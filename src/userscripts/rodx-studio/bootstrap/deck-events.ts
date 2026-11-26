import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import {
  RODX_SELECTORS,
  NATIVE_X_SELECTORS,
  COMPOSITE_SELECTORS,
  DOM_SELECTORS,
} from "../../../selectors.js";
import { createListsModule } from "../bootstrap/initializeLists.js";
import { PREFIX } from "../config/search.js";
import { Studio } from "../core/studio-runtime.js";
import { FeedFilters } from "../feeds/filters.tsx";
import { applyPostLimit } from "../feeds/local-limits.js";
import { installRecommendationCleanup } from "../feeds/recommendations.js";
import { tick } from "../identity/navigation.js";
import { ScrollChrome } from "../layout/chrome.tsx";
import { XInterfaceHygiene } from "../layout/hygiene.tsx";
import { CompactLayout } from "../layout/tweets.tsx";
import { DirectLinks } from "../links/direct.js";
import { SocialAppLinks } from "../links/social.tsx";
import { createListAccess } from "../lists/access.tsx";
import { ProfileLists } from "../lists/profile.tsx";
import { ImmersiveDownload } from "../media/download.tsx";
import { VideoExperience, ViewportPlayback } from "../media/playback.js";
import { ImmersiveSwipe } from "../media/gestures.tsx";
import { PlayerPreference } from "../media/player.tsx";
import { SeekPreviews } from "../media/seek-preview.tsx";
import { VideoTransport } from "../media/transport.tsx";
import { newDraft } from "../search/actions.js";
import { SearchAnchors } from "../search/anchors.tsx";
import { installListTypeahead } from "../search/list-typeahead.tsx";
import { state } from "../state/deck.js";
import { saveState, gmAvailable, normalizedPreset, normalizedSearch } from "../storage/persistence.js";
import { CloudSync } from "../sync/cloud.js";
import { Relay } from "../telegram/relay.tsx";
import { NativeTranslation } from "../translation/native.js";
import { ResultEnhancer } from "../tweets/enhancer.tsx";
import { ensureDock, repaint } from "../ui/dock.tsx";
import { performAction } from "../ui/events.tsx";
import { closePanel, openPanel } from "../ui/preferences.tsx";
import { renderDock } from "../ui/search-workbench.tsx";

// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const HOTKEYS = {
  keyS: "KeyS",
  escape: "Escape",
} as const;

const MENU_COMMANDS = {
  openDeck: "Abrir RodX Search Deck",
  newSearch: "Nova busca avançada",
  cloudConfig: "Nuvem D1: configurar chave pessoal",
} as const;

const STUDIO_JOBS = {
  cloudRefresh: "cloud.refresh",
  identityNavigation: "identity.navigation",
  uiDock: "ui.dock",
  feedsFilters: "feeds.filters",
  searchNavigation: "search.navigation",
  profileLists: "profile.lists",
  tweetsEnhance: "tweets.enhance",
  linksTelegram: "links.telegram",
  translationNative: "translation.native",
  mediaSetup: "media.setup",
  layoutTweets: "layout.tweets",
  uiQuickActions: "ui.quick-actions",
} as const;

const STUDIO_GROUPS = {
  hygiene: "hygiene",
  profile: "profile",
  links: "links",
  translation: "translation",
  media: "media",
  layout: "layout",
} as const;

const UI_TEXTS = {
  storageErrorLog: "[RodX] Storage update inválido:",
} as const;

const FEED_MEDIA_TYPES = {
  video: "video",
  image: "image",
  media: "media",
  all: "all",
} as const;

export let databaseSaveTimer: ReturnType<typeof setTimeout> | undefined;
export let refreshingCloud = false;

// TODO: injetar contexto para substituir helpers
// ============================================================================
// Funções Semânticas Especializadas
// ============================================================================

export function blockNativeTweetOpenOnClicks(event: MouseEvent): void {
  const el = event.target instanceof Element ? event.target : null;
  if (!el || el.closest(RODX_SELECTORS.studioSelectionRoots)) {
    return;
  }
  if (
    !state.visual.blockTweetOpen ||
    event.defaultPrevented ||
    event.detail === 0 ||
    (event.button != null && event.button !== 0) ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const article = el.closest<HTMLElement>(NATIVE_X_SELECTORS.tweet);
  if (!article || article.closest(NATIVE_X_SELECTORS.xOverlayLayers)) {
    return;
  }
  if (el.closest(COMPOSITE_SELECTORS.tweetInteractiveElements())) {
    return;
  }
  if (window.getSelection()?.toString().trim()) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function handleCrossTabStorageSynchronization(event: StorageEvent): void {
  if (gmAvailable || event.key !== PREFIX + state.account) {
    return;
  }
  try {
    const db = JSON.parse(event.newValue || "null");
    state.searches = Array.isArray(db?.searches) ? db.searches.map(normalizedSearch).filter(Boolean) : [];
    state.presets = Array.isArray(db?.presets) ? db.presets.map(normalizedPreset).filter(Boolean) : [];
    state.selectionList = Array.isArray(db?.selectionList) ? db.selectionList.slice(0, 150) : [];
    repaint();
  } catch (err) {
    console.warn(UI_TEXTS.storageErrorLog, err);
  }
}

export function handleGlobalKeyboardShortcuts(event: KeyboardEvent): void {
  if (event.altKey && event.shiftKey && event.code === HOTKEYS.keyS) {
    event.preventDefault();
    state.open ? performAction("close") : performAction("open");
  } else if (event.key === HOTKEYS.escape && state.open) {
    event.preventDefault();
    performAction("close");
  }
}

export function registerTampermonkeyMenuCommands(): void {
  const win = window as Window & {
    GM_registerMenuCommand?: (name: string, fn: () => void) => void;
  };
  if (typeof win.GM_registerMenuCommand === "function") {
    win.GM_registerMenuCommand(MENU_COMMANDS.openDeck, () => openPanel("saved"));
    win.GM_registerMenuCommand(MENU_COMMANDS.newSearch, newDraft);
    win.GM_registerMenuCommand(MENU_COMMANDS.cloudConfig, () => void CloudSync.configure());
  }
}

export function registerStudioListAccessService(): void {
  Studio.services.listAccess = createListAccess(Studio, (q: string) => SearchAnchors.nativeSearch(q));
}

export function registerStudioCloudSyncService(): void {
  Studio.services.cloud = {
    syncNow: async () => {
      await CloudSync.onAccountLoaded(state.account, state.accountGeneration);
      await saveState();
    },
    configure: CloudSync.configure,
  };
}

export function registerStudioDeckPanelService(): void {
  Studio.services.deck = {
    close: closePanel,
    open: openPanel,
  };
}

export function configureStudioSpaNavigation(): void {
  Studio.navigate = (href: string) => {
    const target = new URL(href, location.origin);
    const anchor = Array.from(document.querySelectorAll<HTMLAnchorElement>(DOM_SELECTORS.linksWithHref)).find(
      (a) =>
        a.pathname === target.pathname &&
        a.search === target.search &&
        !a.closest(RODX_SELECTORS.studioOwnedElements),
    );
    if (anchor) {
      anchor.click();
    } else {
      location.assign(target.href);
    }
  };
}

export function initializeStudioListsModule(): void {
  if (Studio.enabled("lists")) {
    createListsModule();
  }
}

export function setupStudioListTypeahead(): void {
  installListTypeahead(Studio);
}

export function setupStudioRecommendationCleanup(): void {
  installRecommendationCleanup(Studio);
}

export function bindListsDockEventEmitter(): void {
  Studio.on("lists:dock", () => Studio.queue(STUDIO_JOBS.uiDock));
}

export function bindListsChangeEventEmitter(): void {
  Studio.on("lists:changed", () => {
    Studio.queue(STUDIO_JOBS.uiDock);
    Studio.queue(STUDIO_JOBS.uiQuickActions);
    Studio.queue(STUDIO_JOBS.searchNavigation);
  });
}

export function bindListsSettingsEventEmitter(): void {
  Studio.on(
    "lists:settings",
    ({ id, settings }: { id?: string; settings: { hideReposts?: boolean; media?: string } }) => {
      if (!id) {
        return;
      }
      const scope = "list:" + id;
      const mediaValue = settings.media;
      const mappedMedia = ["videos", "native"].includes(mediaValue || "")
        ? FEED_MEDIA_TYPES.video
        : mediaValue === "images"
          ? FEED_MEDIA_TYPES.image
          : mediaValue === "media"
            ? FEED_MEDIA_TYPES.media
            : FEED_MEDIA_TYPES.all;

      const config = {
        reposts: !settings.hideReposts,
        media: mappedMedia,
      };

      if (JSON.stringify(state.visual.feedFilters?.[scope]) === JSON.stringify(config)) {
        return;
      }
      state.visual.feedFilters = {
        ...state.visual.feedFilters,
        [scope]: config,
      };
      FeedFilters.publish();
      Studio.queue(STUDIO_JOBS.feedsFilters);
    },
  );
}

export function setupInterfaceHygieneModule(): void {
  if (Studio.enabled(STUDIO_GROUPS.hygiene)) {
    XInterfaceHygiene.install();
  }
}

export function resetDatabaseState(): void {
  clearTimeout(databaseSaveTimer);
  databaseSaveTimer = undefined;
  refreshingCloud = false;
}

export function setupDatabaseDirtyAutoSaveWatcher(): void {
  Studio.ctx?.onDispose(resetDatabaseState);
  Studio.on("database:dirty", () => {
    if (refreshingCloud) {
      return;
    }
    clearTimeout(databaseSaveTimer);
    databaseSaveTimer = setTimeout(() => {
      if (state.account) {
        void saveState().catch(console.warn);
      }
    }, RUNTIME_LIMITS.bootstrapDeckEvents.databaseSaveDebounceMs);
  });
}

export function registerCloudBackgroundSyncJob(): void {
  Studio.register(
    STUDIO_JOBS.cloudRefresh,
    async () => {
      if (!state.account || refreshingCloud) {
        return;
      }
      refreshingCloud = true;
      try {
        await CloudSync.onAccountLoaded(state.account, state.accountGeneration);
      } finally {
        refreshingCloud = false;
      }
    },
    { events: ["maintenance"], minMs: RUNTIME_LIMITS.bootstrapDeckEvents.cloudRefreshIntervalMs },
  );
}

export function setupVisibilityChangeCloudSyncTrigger(): void {
  Studio.ctx?.listen(document, "visibilitychange", () => {
    if (!document.hidden) {
      Studio.queue(STUDIO_JOBS.cloudRefresh);
    }
  });
}

export function registerIdentityNavigationJob(): void {
  Studio.register(STUDIO_JOBS.identityNavigation, tick, {
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.identityNavigationIntervalMs,
  });
}

export function registerDockRenderJob(): void {
  Studio.register(
    STUDIO_JOBS.uiDock,
    () => {
      ensureDock();
      renderDock();
    },
    {
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.dockRefreshIntervalMs,
    },
  );
}

export function registerFeedFiltersScanJob(): void {
  Studio.register(STUDIO_JOBS.feedsFilters, FeedFilters.scan, {
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.feedFilterScanIntervalMs,
  });
}

export function registerSearchNavigationScanJob(): void {
  Studio.register(STUDIO_JOBS.searchNavigation, SearchAnchors.scan, {
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.searchNavigationIntervalMs,
  });
}

export function registerProfileListsScanJob(): void {
  Studio.register(STUDIO_JOBS.profileLists, ProfileLists.scan, {
    group: STUDIO_GROUPS.profile,
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.profileListsScanIntervalMs,
  });
}

export function registerTweetEnhancementScanJob(): void {
  Studio.register(
    STUDIO_JOBS.tweetsEnhance,
    () => {
      applyPostLimit();
      ResultEnhancer?.scan();
    },
    {
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.tweetEnhancementIntervalMs,
    },
  );
}

export function registerLinksAndTelegramScanJob(): void {
  Studio.register(
    STUDIO_JOBS.linksTelegram,
    () => {
      Relay.scan();
      ImmersiveDownload.scan();
      Relay.scanImmersive(ImmersiveDownload.current());
      DirectLinks.scan();
      SocialAppLinks.scan();
    },
    {
      group: STUDIO_GROUPS.links,
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.socialLinksScanIntervalMs,
    },
  );
}

export function registerNativeTranslationScanJob(): void {
  Studio.register(STUDIO_JOBS.translationNative, NativeTranslation.scan, {
    group: STUDIO_GROUPS.translation,
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.nativeTranslationIntervalMs,
  });
}

export function registerMediaExperienceSetupJob(): void {
  Studio.register(
    STUDIO_JOBS.mediaSetup,
    () => {
      SeekPreviews.scan();
      VideoExperience.scan();
      PlayerPreference.scan();
      if (PlayerPreference.needsRodX()) {
        VideoTransport.scan();
      }
      ViewportPlayback.scan();
      ImmersiveSwipe.scan();
    },
    {
      group: STUDIO_GROUPS.media,
      events: ["dom", "route", "state", "maintenance", "media"],
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.mediaSetupIntervalMs,
    },
  );
}

export function registerLayoutTweetsAndChromeScanJob(): void {
  Studio.register(
    STUDIO_JOBS.layoutTweets,
    () => {
      CompactLayout.scan();
      ScrollChrome.scan();
    },
    {
      group: STUDIO_GROUPS.layout,
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.quickActionsScanIntervalMs,
    },
  );
}

export function executeInitialIdentityTick(): void {
  tick();
}

export function startStudioRuntimeEngine(): void {
  Studio.start();
}

// ============================================================================
// Funções de Inicialização (Referências Limpas)
// ============================================================================

export function bindTweetOpenGuard(): void {
  Studio.ctx?.listen(document, "click", blockNativeTweetOpenOnClicks as EventListener, true);
}

export function bindCrossTabStorage(): void {
  Studio.ctx?.listen(window, "storage", handleCrossTabStorageSynchronization as EventListener);
}

export function bindKeyboardShortcuts(): void {
  Studio.ctx?.listen(window, "keydown", handleGlobalKeyboardShortcuts as EventListener);
}
