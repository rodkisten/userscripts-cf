import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import {
  RODX_SELECTORS,
  NATIVE_X_SELECTORS,
  COMPOSITE_SELECTORS,
  DOM_SELECTORS,
} from "../../../selectors.js";
import { createListsModule } from "../lists/index.js";
import { PREFIX } from "../config/search.js";
import { Studio } from "../core/studio.js";
import { FeedFilters } from "../feeds/filters.js";
import { applyPostLimit } from "../feeds/local-limits.js";
import { installRecommendationCleanup } from "../feeds/recommendations.js";
import { tick } from "../identity/navigation.js";
import { ScrollChrome } from "../layout/chrome.js";
import { XInterfaceHygiene } from "../layout/hygiene.js";
import { CompactLayout } from "../layout/tweets.js";
import { DirectLinks } from "../links/direct.js";
import { SocialAppLinks } from "../links/social.js";
import { createListAccess } from "../lists/access.js";
import { ProfileLists } from "../lists/profile.js";
import { ImmersiveDownload } from "../media/download.js";
import { VideoExperience } from "../media/experience.js";
import { ImmersiveSwipe } from "../media/immersive.js";
import { PlayerPreference } from "../media/player.js";
import { SeekPreviews } from "../media/previews.js";
import { VideoTransport } from "../media/transport.js";
import { ViewportPlayback } from "../media/viewport.js";
import { XDOM } from "../platform/selectors.js";
import { newDraft } from "../search/actions.js";
import { SearchAnchors } from "../search/anchors.js";
import { installListTypeahead } from "../search/list-typeahead.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/account.js";
import { gmAvailable } from "../storage/gm.js";
import { normalizedPreset, normalizedSearch } from "../storage/normalize.js";
import { CloudSync } from "../sync/cloud.js";
import { Relay } from "../telegram/relay.js";
import { NativeTranslation } from "../translation/native.js";
import { ResultEnhancer } from "../tweets/enhancer.js";
import { ensureDock, repaint } from "../ui/dock.js";
import { performAction } from "../ui/events.js";
import { closePanel, openPanel } from "../ui/preferences.js";
import { renderDock } from "../ui/search-workbench.js";

export function initializeRodX_deck_164() {
  document.addEventListener(
    "click",
    (event) => {
      const el = event.target instanceof Element ? event.target : null;
      if (!el || el.closest(RODX_SELECTORS.studioSelectionRoots)) return;
      if (
        !state.visual.blockTweetOpen ||
        event.defaultPrevented ||
        event.detail === 0 ||
        (event.button != null && event.button !== 0) ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const article = el.closest(XDOM.tweet);
      if (!article || article.closest(NATIVE_X_SELECTORS.xOverlayLayers)) return;
      if (el.closest(COMPOSITE_SELECTORS.tweetInteractiveElements())) return;
      if (window.getSelection()?.toString().trim()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}

export function initializeRodX_deck_169() {
  window.addEventListener("storage", (event) => {
    if (gmAvailable || event.key !== PREFIX + state.account) return;
    try {
      const db = JSON.parse(event.newValue || "null");
      state.searches = Array.isArray(db?.searches) ? db.searches.map(normalizedSearch).filter(Boolean) : [];
      state.presets = Array.isArray(db?.presets) ? db.presets.map(normalizedPreset).filter(Boolean) : [];
      state.selectionList = Array.isArray(db?.selectionList) ? db.selectionList.slice(0, 150) : [];
      repaint();
    } catch (err) {
      console.warn("[RodX] Storage update inválido:", err);
    }
  });
}

export function initializeRodX_deck_170() {
  window.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyS") {
      event.preventDefault();
      state.open ? performAction("close") : performAction("open");
    } else if (event.key === "Escape" && state.open) {
      event.preventDefault();
      performAction("close");
    }
  });
}

export function initializeRodX_deck_171() {
  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Abrir RodX Search Deck", () => openPanel("saved"));
    GM_registerMenuCommand("Nova busca avançada", newDraft);
    GM_registerMenuCommand("Nuvem D1: configurar chave pessoal", () => void CloudSync.configure());
  }
}

export function initializeRodX_deck_172() {
  Studio.services.listAccess = createListAccess(Studio, (q) => SearchAnchors.nativeSearch(q));
}

export function initializeRodX_deck_173() {
  Studio.services.cloud = {
    syncNow: async () => {
      await CloudSync.onAccountLoaded(state.account, state.accountGeneration);
      await saveState();
    },
    configure: CloudSync.configure,
  };
}

export function initializeRodX_deck_175() {
  Studio.services.deck = {
    close: closePanel,
    open: openPanel,
  };
}

export function initializeRodX_deck_176() {
  Studio.navigate = (href) => {
    const target = new URL(href, location.origin);
    const anchor = [...document.querySelectorAll(DOM_SELECTORS.linksWithHref)].find(
      (a) =>
        a.pathname === target.pathname &&
        a.search === target.search &&
        !a.closest(RODX_SELECTORS.studioOwnedElements),
    );
    if (anchor) anchor.click();
    else location.assign(target.href);
  };
}

export function initializeRodX_deck_177() {
  if (Studio.enabled("lists")) createListsModule(Studio);
}

export function initializeRodX_deck_178() {
  installListTypeahead(Studio);
}

export function initializeRodX_deck_179() {
  installRecommendationCleanup(Studio);
}

export function initializeRodX_deck_180() {
  Studio.on("lists:dock", () => Studio.queue("ui.dock"));
}

export function initializeRodX_deck_181() {
  Studio.on("lists:changed", () => {
    Studio.queue("ui.dock");
    Studio.queue("ui.quick-actions");
    Studio.queue("search.navigation");
  });
}

export function initializeRodX_deck_182() {
  Studio.on("lists:settings", ({ id, settings }) => {
    if (!id) return;
    const scope = "list:" + id;
    const config = {
      reposts: !settings.hideReposts,
      media: ["videos", "native"].includes(settings.media)
        ? "video"
        : settings.media === "images"
          ? "image"
          : settings.media === "media"
            ? "media"
            : "all",
    };
    if (JSON.stringify(state.visual.feedFilters?.[scope]) === JSON.stringify(config)) return;
    state.visual.feedFilters = {
      ...state.visual.feedFilters,
      [scope]: config,
    };
    FeedFilters.publish();
    Studio.queue("feeds.filters");
  });
}

export function initializeRodX_deck_183() {
  if (Studio.enabled("hygiene")) XInterfaceHygiene.install();
}

export let databaseSaveTimer, refreshingCloud;

export function initializeDeckDatabaseSaveTimerAndRefreshingCloud() {
  databaseSaveTimer = undefined;
  refreshingCloud = false;
}

export function initializeRodX_deck_185() {
  Studio.on("database:dirty", () => {
    if (refreshingCloud) return;
    clearTimeout(databaseSaveTimer);
    databaseSaveTimer = setTimeout(() => {
      if (state.account) void saveState().catch(console.warn);
    }, RUNTIME_LIMITS.bootstrapDeckEvents.databaseSaveDebounceMs);
  });
}

export function initializeRodX_deck_186() {
  Studio.register(
    "cloud.refresh",
    async () => {
      if (!state.account || refreshingCloud) return;
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

export function initializeRodX_deck_187() {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) Studio.queue("cloud.refresh");
  });
}

export function initializeRodX_deck_188() {
  Studio.register("identity.navigation", tick, {
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.identityNavigationIntervalMs,
  });
}

export function initializeRodX_deck_189() {
  Studio.register(
    "ui.dock",
    () => {
      ensureDock();
      renderDock();
      // The old page-wide search launcher is intentionally no longer inserted.
    },
    {
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.dockRefreshIntervalMs,
    },
  );
}

export function initializeRodX_deck_190() {
  Studio.register("feeds.filters", FeedFilters.scan, {
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.feedFilterScanIntervalMs,
  });
}

export function initializeRodX_deck_191() {
  Studio.register("search.navigation", SearchAnchors.scan, {
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.searchNavigationIntervalMs,
  });
}

export function initializeRodX_deck_192() {
  Studio.register("profile.lists", ProfileLists.scan, {
    group: "profile",
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.profileListsScanIntervalMs,
  });
}

export function initializeRodX_deck_193() {
  Studio.register(
    "tweets.enhance",
    () => {
      applyPostLimit();
      ResultEnhancer.scan();
    },
    {
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.tweetEnhancementIntervalMs,
    },
  );
}

export function initializeRodX_deck_194() {
  Studio.register(
    "links.telegram",
    () => {
      Relay.scan();
      ImmersiveDownload.scan();
      Relay.scanImmersive(ImmersiveDownload.current());
      DirectLinks.scan();
      SocialAppLinks.scan();
    },
    {
      group: "links",
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.socialLinksScanIntervalMs,
    },
  );
}

export function initializeRodX_deck_195() {
  Studio.register("translation.native", NativeTranslation.scan, {
    group: "translation",
    minMs: RUNTIME_LIMITS.bootstrapDeckEvents.nativeTranslationIntervalMs,
  });
}

export function initializeRodX_deck_196() {
  Studio.register(
    "media.setup",
    () => {
      SeekPreviews.scan();
      VideoExperience.scan();
      PlayerPreference.scan();
      if (PlayerPreference.needsRodX()) VideoTransport.scan();
      ViewportPlayback.scan();
      ImmersiveSwipe.scan();
    },
    {
      group: "media",
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.mediaSetupIntervalMs,
    },
  );
}

export function initializeRodX_deck_197() {
  Studio.register(
    "layout.tweets",
    () => {
      CompactLayout.scan();
      ScrollChrome.scan();
    },
    {
      group: "layout",
      minMs: RUNTIME_LIMITS.bootstrapDeckEvents.quickActionsScanIntervalMs,
    },
  );
}

export function initializeRodX_deck_198() {
  tick();
}

export function initializeRodX_deck_199() {
  Studio.start();
}
