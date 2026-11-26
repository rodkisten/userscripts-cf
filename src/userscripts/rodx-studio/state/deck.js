import { DEFAULT_SETTINGS } from "../../../config/defaults.js";
import { VISUAL_RANGES } from "../../../config/runtime.js";
import { Studio } from "../core/studio-runtime.js";

export let state;

export function initializeDeckState() {
  state = Studio.slice("deck", {
    account: null,
    accountLabel: "",
    accountSource: "",
    manualAccount: null,
    accountCandidate: "",
    accountCandidateSince: 0,
    lastCookieId: "",
    searchLimitKey: "",
    limitSeen: new Map(),
    limitCounter: 0,
    sessionLimits: new Map(),
    nativeSearchOverlay: null,
    companionButton: null,
    seen: new Map(),
    seenAccount: "",
    visual: {
      density: 1,
      font: 15,
      compact: false,
      colorfulTags: false,
      hideSeen: false,
      viewedThreshold: 0.65,
      seenDelayMs: 2500,
      translatePosts: true,
      blockTweetOpen: true,
      translateForeignTags: true,
      seekPreviews: true,
      videoPauseDim: false,
      previewStepSeconds: 5,
      playerMode: "videojs",
      videoMute: true,
      bestQuality: true,
      autoPlayEnterPercent: 55,
      autoPauseExitPercent: 75,
      swipeToCloseVideo: true,
    },
    seenSaveTimer: null,
    readObserver: null,
    readTimers: new Map(),
    readProgress: new WeakMap(),
    filterSignature: "",
    rawFixes: new Map(),
    saveError: "",
    lastIdentifiedAccount: "",
    storageWarning: "",
    searches: [],
    presets: [],
    selectionList: [],
    presetEditingId: null,
    rawDirty: false,
    rawQueryDraft: "",
    autoFixSummary: "",
    view: "saved",
    open: false,
    editingId: null,
    draft: null,
    message: "",
    busy: false,
    openedGroups: new Set(["words", "people"]),
    accountGeneration: 0,
    pendingWrites: Promise.resolve(),
    valueListenerId: null,
    dockHost: null,
    dockShadow: null,
    rootHost: null,
    rootShadow: null,
    lastUrl: "",
    lastAccountCheck: 0,
  });
}

// Consolidated visual normalization
export function normalizeVisual(source = {}) {
  const v = source && typeof source === "object" ? source : {};
  return {
    snap: v.snap === true,
    feedFilters:
      v.feedFilters && typeof v.feedFilters === "object"
        ? Object.fromEntries(
            Object.entries(v.feedFilters)
              .slice(-VISUAL_RANGES.feedFilterEntries)
              .map(([key, value]) => [
                key,
                {
                  reposts: value?.reposts !== false,
                  media: ["all", "media", "video", "image"].includes(value?.media)
                    ? value.media
                    : DEFAULT_SETTINGS.feed.media,
                },
              ]),
          )
        : {},
    density: Math.min(
      VISUAL_RANGES.density.max,
      Math.max(VISUAL_RANGES.density.min, Number(v.density) || DEFAULT_SETTINGS.visual.density),
    ),
    font: Math.min(
      VISUAL_RANGES.font.max,
      Math.max(VISUAL_RANGES.font.min, Number(v.font) || DEFAULT_SETTINGS.visual.font),
    ),
    compact: v.compact === true,
    colorfulTags: v.colorfulTags === true,
    hideSeen: Boolean(v.hideSeen),
    viewedThreshold: Math.min(
      VISUAL_RANGES.viewedThreshold.max,
      Math.max(
        VISUAL_RANGES.viewedThreshold.min,
        Number(v.viewedThreshold) || DEFAULT_SETTINGS.visual.viewedThreshold,
      ),
    ),
    seenDelayMs: Math.min(
      VISUAL_RANGES.seenDelayMs.max,
      Math.max(VISUAL_RANGES.seenDelayMs.min, Number(v.seenDelayMs) || DEFAULT_SETTINGS.visual.seenDelayMs),
    ),
    translatePosts: v.translatePosts !== false,
    blockTweetOpen: v.blockTweetOpen !== false,
    translateForeignTags: v.translateForeignTags !== false,
    seekPreviews: v.seekPreviews !== false,
    videoPauseDim: v.videoPauseDim === true,
    previewStepSeconds: Math.min(
      VISUAL_RANGES.previewStepSeconds.max,
      Math.max(
        VISUAL_RANGES.previewStepSeconds.min,
        Number(v.previewStepSeconds) || DEFAULT_SETTINGS.visual.previewStepSeconds,
      ),
    ),
    playerMode: ["twitter", "rodx", "videojs"].includes(v.playerMode)
      ? v.playerMode
      : DEFAULT_SETTINGS.visual.playerMode,
    videoMute: v.videoMute !== false,
    bestQuality: v.bestQuality !== false,
    autoPlayEnterPercent: Math.min(
      VISUAL_RANGES.autoPlayEnterPercent.max,
      Math.max(
        VISUAL_RANGES.autoPlayEnterPercent.min,
        Number(v.autoPlayEnterPercent) || DEFAULT_SETTINGS.visual.autoPlayEnterPercent,
      ),
    ),
    autoPauseExitPercent: Math.min(
      VISUAL_RANGES.autoPauseExitPercent.max,
      Math.max(
        VISUAL_RANGES.autoPauseExitPercent.min,
        Number(v.autoPauseExitPercent) || DEFAULT_SETTINGS.visual.autoPauseExitPercent,
      ),
    ),
    swipeToCloseVideo: v.swipeToCloseVideo !== false,
  };
}
