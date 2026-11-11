// Operational limits, durations and protocol values. Numeric loop/index arithmetic stays local.
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export const HTTP_STATUS = Object.freeze({
  ok: 200,
  created: 201,
  accepted: 202,
  multiStatus: 207,
  redirectBoundary: 300,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  serverErrorBoundary: 500,
});
export const RUNTIME_LIMITS = freeze({
  scheduler: { minimumFrameDelayMs: 16 },
  selection: { pointerReleaseDelayMs: 120, touchReleaseDelayMs: 160 },
  navigation: { retryShortDelayMs: 40, retryLongDelayMs: 750 },
  networkPageBridge: {
    maxCapturedMediaItems: 100,
    successStatusMinimum: 200,
    successStatusExclusiveMaximum: 300,
    bodyReadTimeoutMs: 10000,
    minimumTraceLimitBytes: 16384,
    maxPatternCharacters: 20000,
    maxTraversalNodes: 30000,
    maxAcceptedPostIds: 120000,
    maxRequestBodyCharacters: 200000,
    defaultTraceLimitBytes: 1500000,
    maxResponsePreviewCharacters: 3000000,
    maxFilterResponseCharacters: 4000000,
    maximumTraceLimitBytes: 10000000,
  },
  pageReplIndex: {
    downloadDelayMs: 1000,
    fetchURLTimeout: 20000,
    editorAutocompleteDelayMs: 300,
  },
  pageReplStorage: {
    workspaceTimeoutMs: 3000,
    workspaceSaveDebounceMs: 400,
  },
  bootstrapDeckEvents: {
    databaseSaveDebounceMs: 2500,
    cloudRefreshIntervalMs: 60000,
    identityNavigationIntervalMs: 300,
    dockRefreshIntervalMs: 250,
    feedFilterScanIntervalMs: 150,
    searchNavigationIntervalMs: 150,
    profileListsScanIntervalMs: 350,
    tweetEnhancementIntervalMs: 200,
    socialLinksScanIntervalMs: 350,
    nativeTranslationIntervalMs: 1150,
    mediaSetupIntervalMs: 220,
    quickActionsScanIntervalMs: 550,
  },
  coreStudioRuntime: {
    startIntervalMs: 1000,
  },
  feedsRecommendations: {
    installRecommendationCleanupMinMs: 700,
  },
  identityNavigation: {
    tickDelayMs: 2700,
  },
  layoutChrome: {
    settleDelayMs: 180,
  },
  layoutHygiene: {
    installMinMs: 250,
  },
  linksDirect: {
    resolveTimeout: 7500,
  },
  listsAccess: {
    createListAccessMinMs: 300,
  },
  listsClient: {
    sourceTimeout: 12000,
  },
  listsDomCapture: {
    captureVisibleListsDelayMs: 850,
  },
  listsGraphql: {
    refreshListNameDelayMs: 18000,
  },
  listsProfile: {
    resolveDelayMs: 100,
    loadDelayMs: 20000,
  },
  listsQueue: {
    downloadBlobDelayMs: 30000,
  },
  listsQuickPicker: {
    quickToastDelayMs: 3800,
  },
  listsRender: {
    repositoryScanIntervalMs: 450,
    metadataSyncIntervalMs: 7000,
  },
  listsView: {
    scheduleRefreshDelayMs: 240,
  },
  mediaDownload: {
    resolveMP4Timeout: 25000,
    downloadTimeout: 120000,
    downloadDelayMs: 60000,
    resolveDelayMs: 1400,
  },
  mediaGestures: {
    doubleTapMs: 420,
    touchClickMs: 900,
    moveLimit: 16,
    sameSpotPx: 90,
  },
  mediaImmersive: {
    onEndDelayMs: 100,
  },
  mediaSeekPreview: {
    attachDelayMs: 120,
  },
  mediaViewport: {
    resumeCooldownMs: 1400,
    exitGraceMs: 5000,
    initializeDeckViewportPlaybackMinMs: 350,
  },
  networkBridge: {
    connectStudioNetworkDelayMs: 30000,
  },
  networkInspector: {
    refreshSoonDelayMs: 180,
    exportSelectionDelayMs: 10000,
  },
  searchAnchors: {
    navigationRetryDelayMs: 80,
    restoreIntervalMs: 200,
    initializeDeckSearchAnchorsDelayMs: 180,
  },
  storageBackup: {
    exportJSONDelayMs: 1000,
  },
  syncCloud: {
    requestTimeout: 20000,
    queueSnapshotDelayMs: 1300,
  },
  telegramRelay: {
    statusCacheTtlMs: 60000,
    statusCheckBatchSize: 60,
    tokenPreviewCharacters: 4,
    channelSelectionMaxCharacters: 1000,
    requestTimeoutMs: 45000,
    sourceExcerptMaxCharacters: 1800,
    captionMaxCodePoints: 1024,
    captionReservedCodePoints: 15,
    statusCheckDebounceMs: 230,
    queuedCheckRetryMs: 400,
    noticeDurationMs: 4400,
    sendTimeoutMs: 120000,
    scanThrottleMs: 450,
    maxArticlesPerScan: 220,
    statusCacheHighWaterMark: 2000,
    statusCacheLowWaterMark: 1100,
    cardCacheMaxEntries: 400,
    manualRefreshBatchSize: 120,
    healthTimeoutMs: 12000,
  },
  translationForeignTags: {
    max: 180,
    initializeDeckForeignTagsTimeout: 7000,
  },
  tweetsEnhancer: {
    finishDelayMs: 1400,
  },
  tweetsPublisher: {
    maxRows: 100,
    requestVideoTimeout: 90000,
  },
  tweetsQuickRepost: {
    stopDelayMs: 1400,
  },
  tweetsSeen: {
    flushSoonDelayMs: 1200,
  },
  uiDraggableDock: {
    attachDelayMs: 160,
  },
  uiQuickActions: {
    queueSuggestionsDelayMs: 110,
    initializeDeckQuickUIMinMs: 550,
  },
  uiSelection: {
    showDelayMs: 280,
  },
  uiToast: {
    showRodxToastDelayMs: 2600,
  },
});

export const VISUAL_RANGES = freeze({
  feedFilterEntries: 300,
  density: { min: 0.55, max: 1.4 },
  font: { min: 11, max: 19 },
  viewedThreshold: { min: 0.35, max: 0.9 },
  seenDelayMs: { min: 1000, max: 8000 },
  previewStepSeconds: { min: 1, max: 15 },
  autoPlayEnterPercent: { min: 10, max: 100 },
  autoPauseExitPercent: { min: 10, max: 100 },
});

export const STUDIO_RANGES = freeze({
  budgetMs: { min: 3, max: 12 },
  scanDelayMs: { min: 60, max: 500 },
  maintenanceMs: { min: 5000 },
  homeListLimit: { min: 0, max: 50 },
});
