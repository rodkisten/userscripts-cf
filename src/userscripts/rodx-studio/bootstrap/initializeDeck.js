import {
  initializeDeckVERSION,
  initializeDeckPREFIX,
  initializeDeckIDENT,
  initializeDeckMAX_VISIBLE,
  initializeDeckEMPTY_FIELDS,
  initializeDeckLANGUAGE_OPTIONS,
  initializeDeckANY_ONLY_EXCLUDE,
  initializeDeckBLOCK_MEDIA,
  initializeDeckBLOCK_TYPES,
  initializeDeckMAX_BLOCK_NODES,
  initializeDeckMAX_BLOCK_DEPTH,
  initializeDeckSORTS,
  initializeDeckGROUPS,
} from "../config/search.js";
import { initializeDeckState } from "../state/deck.js";
import { initializeDeckCopyFields } from "../search/blocks.js";
import {
  initializeDeckHtml,
  initializeDeckUid,
  initializeDeckTokens,
  initializeDeckSplitAccounts,
} from "../shared/text.js";
import { initializeDeckQueryEngine } from "../search/query-compiler.js";
import { initializeDeckSignature } from "../search/block-editing.js";
import { initializeDeckCloudSync } from "../sync/cloud.js";
import { initializeDeckImmersiveDownload } from "../media/download.tsx";
import { initializeDeckRelay } from "../telegram/relay.tsx";
import { initializeDeckXRepost } from "../tweets/publisher.tsx";
import { initializeDeckXClientLists } from "../lists/client.js";
import { initializeDeckProfileLists } from "../lists/profile.tsx";
import { initializeDeckFeedFilters } from "../feeds/filters.tsx";
import { initializeDeckScrollChrome } from "../layout/chrome.tsx";
import { initializeDeckCompactLayout } from "../layout/tweets.tsx";
import { initializeDeckPreferences } from "../ui/preferences.tsx";
import { initializeDeckDirectLinks } from "../links/direct.js";
import { initializeDeckSocialAppLinks } from "../links/social.tsx";
import { initializeDeckVideoTapGuard } from "../media/gestures.tsx";
import { initializeDeckQuickRepost } from "../tweets/quick-repost.js";
import { initializeDeckSeen } from "../tweets/seen.js";
import { initializeDeckNativeTranslation } from "../translation/native.js";
import { initializeDeckForeignTags } from "../translation/foreign-tags.tsx";
import { initializeDeckVideoExperience } from "../media/playback.js";
import { initializeDeckSeekPreviews } from "../media/seek-preview.tsx";
import { initializeDeckPlayerPreference } from "../media/player.tsx";
import { initializeDeckSearchAnchors } from "../search/anchors.tsx";
import { initializeDeckVideoTransport } from "../media/transport.tsx";
import { initializeDeckViewportPlayback } from "../media/playback.js";
import { initializeDeckImmersiveSwipe } from "../media/gestures.tsx";
import { initializeDeckNativeQueryTags } from "../search/native-tags.js";
import { initializeDeckResultEnhancer } from "../tweets/enhancer.tsx";
import { initializeDeckRodxToastTimer } from "../ui/runtime.tsx";
import { initializeDeckDragDock } from "../ui/dock.tsx";
import {
  bindTweetOpenGuard,
  bindCrossTabStorage,
  bindKeyboardShortcuts,
  registerTampermonkeyMenuCommands,
  registerStudioListAccessService,
  registerStudioCloudSyncService,
  registerStudioDeckPanelService,
  configureStudioSpaNavigation,
  initializeStudioListsModule,
  setupStudioListTypeahead,
  setupStudioRecommendationCleanup,
  bindListsDockEventEmitter,
  bindListsChangeEventEmitter,
  bindListsSettingsEventEmitter,
  setupInterfaceHygieneModule,
  resetDatabaseState,
  setupDatabaseDirtyAutoSaveWatcher,
  registerCloudBackgroundSyncJob,
  setupVisibilityChangeCloudSyncTrigger,
  registerIdentityNavigationJob,
  registerDockRenderJob,
  registerFeedFiltersScanJob,
  registerSearchNavigationScanJob,
  registerProfileListsScanJob,
  registerTweetEnhancementScanJob,
  registerLinksAndTelegramScanJob,
  registerNativeTranslationScanJob,
  registerMediaExperienceSetupJob,
  registerLayoutTweetsAndChromeScanJob,
  executeInitialIdentityTick,
  startStudioRuntimeEngine,
} from "./deck-events.js";
import { initializeDeckSelectionPopover } from "../ui/selection.tsx";
import { initializeDeckXInterfaceHygiene } from "../layout/hygiene.tsx";
import { initializeDeckSearchHistory } from "../search/history.tsx";
import { initializeDeckQuickUI } from "../ui/quick-actions.tsx";

function runInitializers(...initializers) {
  for (const initialize of initializers) {
    initialize();
  }
}

export function initializeDeck() {
  // Cada fase mantém a ordem histórica de inicialização do Deck.
  runInitializers(
    // Configuração, estado e compilação.
    initializeDeckVERSION,
    initializeDeckPREFIX,
    initializeDeckIDENT,
    initializeDeckMAX_VISIBLE,
    initializeDeckEMPTY_FIELDS,
    initializeDeckLANGUAGE_OPTIONS,
    initializeDeckANY_ONLY_EXCLUDE,
    initializeDeckBLOCK_MEDIA,
    initializeDeckBLOCK_TYPES,
    initializeDeckMAX_BLOCK_NODES,
    initializeDeckMAX_BLOCK_DEPTH,
    initializeDeckSORTS,
    initializeDeckGROUPS,
    initializeDeckState,
    initializeDeckCopyFields,
    initializeDeckHtml,
    initializeDeckUid,
    initializeDeckTokens,
    initializeDeckSplitAccounts,
    initializeDeckQueryEngine,
    initializeDeckSignature,

    // GM, storage e sincronização.
    initializeDeckCloudSync,

    // Integrações e superfície do Deck.
    initializeDeckImmersiveDownload,
    initializeDeckRelay,
    initializeDeckXRepost,
    initializeDeckXClientLists,
    initializeDeckProfileLists,
    initializeDeckFeedFilters,
    initializeDeckScrollChrome,
    initializeDeckCompactLayout,
    initializeDeckPreferences,
    initializeDeckDirectLinks,
    initializeDeckSocialAppLinks,
    initializeDeckVideoTapGuard,
    initializeDeckQuickRepost,
    initializeDeckSeen,
    initializeDeckNativeTranslation,
    initializeDeckForeignTags,

    // Mídia, busca e aprimoramentos.
    initializeDeckVideoExperience,
    initializeDeckSeekPreviews,
    initializeDeckPlayerPreference,
    initializeDeckSearchAnchors,
    initializeDeckVideoTransport,
    initializeDeckViewportPlayback,
    initializeDeckImmersiveSwipe,
    initializeDeckNativeQueryTags,
    initializeDeckResultEnhancer,
    initializeDeckRodxToastTimer,
    initializeDeckDragDock,

    // Eventos legados e módulos finais.
    bindTweetOpenGuard,
    initializeDeckSelectionPopover,
    initializeDeckXInterfaceHygiene,
    initializeDeckSearchHistory,
    bindCrossTabStorage,
    bindKeyboardShortcuts,
    registerTampermonkeyMenuCommands,
    registerStudioListAccessService,
    registerStudioCloudSyncService,
    initializeDeckQuickUI,
    registerStudioDeckPanelService,
    configureStudioSpaNavigation,
    initializeStudioListsModule,
    setupStudioListTypeahead,
    setupStudioRecommendationCleanup,
    bindListsDockEventEmitter,
    bindListsChangeEventEmitter,
    bindListsSettingsEventEmitter,
    setupInterfaceHygieneModule,
    resetDatabaseState,
    setupDatabaseDirtyAutoSaveWatcher,
    registerCloudBackgroundSyncJob,
    setupVisibilityChangeCloudSyncTrigger,
    registerIdentityNavigationJob,
    registerDockRenderJob,
    registerFeedFiltersScanJob,
    registerSearchNavigationScanJob,
    registerProfileListsScanJob,
    registerTweetEnhancementScanJob,
    registerLinksAndTelegramScanJob,
    registerNativeTranslationScanJob,
    registerMediaExperienceSetupJob,
    registerLayoutTweetsAndChromeScanJob,
    executeInitialIdentityTick,
    startStudioRuntimeEngine,
  );
}
