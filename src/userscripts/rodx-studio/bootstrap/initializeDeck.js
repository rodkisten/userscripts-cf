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
import { initializeDeckCSS, initializeDeckCUSTOM_CSS } from "../styles/deck.js";
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
import {
  initializeDeckModernGM,
  initializeDeckGmGet,
  initializeDeckGmSet,
  initializeDeckGmAvailable,
  initializeDeckStorage,
  initializeDeckRecoveryKey,
} from "../storage/gm.js";
import { initializeDeckCloudSync } from "../sync/cloud.js";
import { initializeDeckImmersiveDownload } from "../media/download.js";
import { initializeDeckRelay } from "../telegram/relay.js";
import { initializeDeckXRepost } from "../tweets/publisher.js";
import { initializeDeckXClientLists } from "../lists/client.js";
import { initializeDeckProfileLists } from "../lists/profile.js";
import { initializeDeckFeedFilters } from "../feeds/filters.js";
import { initializeDeckScrollChrome } from "../layout/chrome.js";
import { initializeDeckCompactLayout } from "../layout/tweets.js";
import { initializeDeckPreferences } from "../ui/preferences.js";
import { initializeDeckDirectLinks } from "../links/direct.js";
import { initializeDeckSocialAppLinks } from "../links/social.js";
import { initializeDeckVideoTapGuard } from "../media/gestures.js";
import { initializeDeckQuickRepost } from "../tweets/quick-repost.js";
import { initializeDeckSeen } from "../tweets/seen.js";
import { initializeDeckNativeTranslation } from "../translation/native.js";
import { initializeDeckForeignTags } from "../translation/foreign-tags.js";
import { initializeDeckVideoExperience } from "../media/experience.js";
import { initializeDeckSeekPreviews } from "../media/previews.js";
import { initializeDeckPlayerPreference } from "../media/player.js";
import { initializeDeckSearchAnchors } from "../search/anchors.js";
import { initializeDeckVideoTransport } from "../media/transport.js";
import { initializeDeckViewportPlayback } from "../media/viewport.js";
import { initializeDeckImmersiveSwipe } from "../media/immersive.js";
import { initializeDeckNativeQueryTags } from "../search/native-tags.js";
import { initializeDeckResultEnhancer } from "../tweets/enhancer.js";
import { initializeDeckRodxToastTimer } from "../ui/toast.js";
import { initializeDeckDragDock } from "../ui/draggable-dock.js";
import {
  initializeRodX_deck_164,
  initializeRodX_deck_169,
  initializeRodX_deck_170,
  initializeRodX_deck_171,
  initializeRodX_deck_172,
  initializeRodX_deck_173,
  initializeRodX_deck_175,
  initializeRodX_deck_176,
  initializeRodX_deck_177,
  initializeRodX_deck_178,
  initializeRodX_deck_179,
  initializeRodX_deck_180,
  initializeRodX_deck_181,
  initializeRodX_deck_182,
  initializeRodX_deck_183,
  initializeDeckDatabaseSaveTimerAndRefreshingCloud,
  initializeRodX_deck_185,
  initializeRodX_deck_186,
  initializeRodX_deck_187,
  initializeRodX_deck_188,
  initializeRodX_deck_189,
  initializeRodX_deck_190,
  initializeRodX_deck_191,
  initializeRodX_deck_192,
  initializeRodX_deck_193,
  initializeRodX_deck_194,
  initializeRodX_deck_195,
  initializeRodX_deck_196,
  initializeRodX_deck_197,
  initializeRodX_deck_198,
  initializeRodX_deck_199,
} from "./deck-events.js";
import { initializeDeckSelectionPopover } from "../ui/selection.js";
import { initializeDeckXInterfaceHygiene } from "../layout/hygiene.js";
import { initializeDeckSearchHistory } from "../search/history.js";
import { initializeDeckQuickUI } from "../ui/quick-actions.js";

export function initializeDeck() {
  initializeDeckVERSION();
  initializeDeckPREFIX();
  initializeDeckIDENT();
  initializeDeckMAX_VISIBLE();
  initializeDeckEMPTY_FIELDS();
  initializeDeckLANGUAGE_OPTIONS();
  initializeDeckANY_ONLY_EXCLUDE();
  initializeDeckBLOCK_MEDIA();
  initializeDeckBLOCK_TYPES();
  initializeDeckMAX_BLOCK_NODES();
  initializeDeckMAX_BLOCK_DEPTH();
  initializeDeckSORTS();
  initializeDeckGROUPS();
  initializeDeckCSS();
  initializeDeckCUSTOM_CSS();
  initializeDeckState();
  initializeDeckCopyFields();
  initializeDeckHtml();
  initializeDeckUid();
  initializeDeckTokens();
  initializeDeckSplitAccounts();
  initializeDeckQueryEngine();
  initializeDeckSignature();
  initializeDeckModernGM();
  initializeDeckGmGet();
  initializeDeckGmSet();
  initializeDeckGmAvailable();
  initializeDeckStorage();
  initializeDeckRecoveryKey();
  initializeDeckCloudSync();
  initializeDeckImmersiveDownload();
  initializeDeckRelay();
  initializeDeckXRepost();
  initializeDeckXClientLists();
  initializeDeckProfileLists();
  initializeDeckFeedFilters();
  initializeDeckScrollChrome();
  initializeDeckCompactLayout();
  initializeDeckPreferences();
  initializeDeckDirectLinks();
  initializeDeckSocialAppLinks();
  initializeDeckVideoTapGuard();
  initializeDeckQuickRepost();
  initializeDeckSeen();
  initializeDeckNativeTranslation();
  initializeDeckForeignTags();
  initializeDeckVideoExperience();
  initializeDeckSeekPreviews();
  initializeDeckPlayerPreference();
  initializeDeckSearchAnchors();
  initializeDeckVideoTransport();
  initializeDeckViewportPlayback();
  initializeDeckImmersiveSwipe();
  initializeDeckNativeQueryTags();
  initializeDeckResultEnhancer();
  initializeDeckRodxToastTimer();
  initializeDeckDragDock();
  initializeRodX_deck_164();
  initializeDeckSelectionPopover();
  initializeDeckXInterfaceHygiene();
  initializeDeckSearchHistory();
  initializeRodX_deck_169();
  initializeRodX_deck_170();
  initializeRodX_deck_171();
  initializeRodX_deck_172();
  initializeRodX_deck_173();
  initializeDeckQuickUI();
  initializeRodX_deck_175();
  initializeRodX_deck_176();
  initializeRodX_deck_177();
  initializeRodX_deck_178();
  initializeRodX_deck_179();
  initializeRodX_deck_180();
  initializeRodX_deck_181();
  initializeRodX_deck_182();
  initializeRodX_deck_183();
  initializeDeckDatabaseSaveTimerAndRefreshingCloud();
  initializeRodX_deck_185();
  initializeRodX_deck_186();
  initializeRodX_deck_187();
  initializeRodX_deck_188();
  initializeRodX_deck_189();
  initializeRodX_deck_190();
  initializeRodX_deck_191();
  initializeRodX_deck_192();
  initializeRodX_deck_193();
  initializeRodX_deck_194();
  initializeRodX_deck_195();
  initializeRodX_deck_196();
  initializeRodX_deck_197();
  initializeRodX_deck_198();
  initializeRodX_deck_199();
}
