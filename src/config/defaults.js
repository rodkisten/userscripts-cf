const FEED_DEFAULTS = Object.freeze({ media: "media", reposts: true });
// User-facing settings defaults. Consumers receive independent mutable copies.
const clone = (value) =>
  Array.isArray(value)
    ? value.map(clone)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
      : value;
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export const DEFAULT_SETTINGS = freeze({
  replWorkspace: {
    code: '// Ctrl/Cmd+Enter executa. Variáveis de topo persistem na sessão.\nconst title = document.title;\nconsole.log("Página:", location.href);\nawait Promise.resolve(title)',
    history: [],
    timeout: 3000,
    position: { x: 12, y: 90 },
  },
  relay: {
    enabled: true,
    url: "https://xtelegram-cf.migos.club",
    token: "",
    channels: "",
    autoCheck: true,
    labelSent: true,
  },
  repost: {
    shareMode: "direct",
    destination: "instagram",
    enqueueAfterTelegram: true,
    copyCaptionOnShare: true,
    includeSourceUrl: false,
  },
  studio: {
    feedDefaults: FEED_DEFAULTS,
    budgetMs: 7,
    scanDelayMs: 110,
    maintenanceMs: 15000,
    modules: {
      lists: true,
      profile: true,
      layout: true,
      media: true,
      links: true,
      translation: true,
      hygiene: true,
      customTimeline: false,
    },
    homeListLimit: 12,
  },
  lists: {
    hideReposts: true,
    showHomeBar: true,
    homeAll: true,
    homeIds: [],
    media: "media",
    replies: true,
    queryText: "",
    sort: "live",
    minLikes: "",
    lastListId: "",
    autoSyncApi: true,
    queueIntervalSeconds: 90,
    quickAddFollow: false,
    quickAddDisableReposts: false,
  },
  listMutationFeatures: {
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false,
    rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
  },
  searchFields: {
    all: "",
    exact: "",
    any: "",
    none: "",
    hashtags: "",
    cashtags: "",
    lang: "",
    from: "",
    to: "",
    mentions: "",
    listId: "",
    following: "any",
    verified: "any",
    since: "",
    until: "",
    withinTime: "",
    sinceTime: "",
    untilTime: "",
    minLikes: "",
    maxLikes: "",
    minReposts: "",
    maxReposts: "",
    minReplies: "",
    maxReplies: "",
    media: "any",
    replies: "any",
    reposts: "any",
    quotes: "any",
    links: "any",
    hashtagFilter: "any",
    mentionFilter: "any",
    safe: "any",
    postType: "any",
    hasEngagement: "any",
    urlDomain: "",
    placeId: "",
    conversationId: "",
    replyToId: "",
    quoteId: "",
    quotedUserId: "",
    sinceId: "",
    maxId: "",
    extra: "",
  },
  feed: FEED_DEFAULTS,
  visual: {
    snap: false,
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
});
export function createDefaults(section) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, section))
    throw Error("Unknown defaults section: " + section);
  return clone(DEFAULT_SETTINGS[section]);
}
