// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const UNKNOWN_SECTION_ERROR_PREFIX = "Unknown defaults section: ";
const OBJECT_TYPE_NAME = "object";

// ============================================================================
// Tipagens e Interfaces Estritas
// ============================================================================
export interface FeedDefaultsConfig {
  media: string;
  reposts: boolean;
}

export interface ReplWorkspaceConfig {
  code: string;
  history: unknown[];
  timeout: number;
  position: { x: number; y: number };
}

export interface RelayConfig {
  enabled: boolean;
  url: string;
  token: string;
  channels: string;
  autoCheck: boolean;
  labelSent: boolean;
}

export interface RepostConfig {
  shareMode: string;
  destination: string;
  enqueueAfterTelegram: boolean;
  copyCaptionOnShare: boolean;
  includeSourceUrl: boolean;
}

export interface StudioModulesConfig {
  lists: boolean;
  profile: boolean;
  layout: boolean;
  media: boolean;
  links: boolean;
  translation: boolean;
  hygiene: boolean;
  customTimeline: boolean;
}

export interface StudioConfig {
  feedDefaults: FeedDefaultsConfig;
  budgetMs: number;
  scanDelayMs: number;
  maintenanceMs: number;
  modules: StudioModulesConfig;
  homeListLimit: number;
}

export interface ListsConfig {
  hideReposts: boolean;
  showHomeBar: boolean;
  homeAll: boolean;
  homeIds: unknown[];
  media: string;
  replies: boolean;
  queryText: string;
  sort: string;
  minLikes: string;
  lastListId: string;
  autoSyncApi: boolean;
  queueIntervalSeconds: number;
  quickAddFollow: boolean;
  quickAddDisableReposts: boolean;
}

export interface ListMutationFeaturesConfig {
  profile_label_improvements_pcf_label_in_post_enabled: boolean;
  responsive_web_profile_redirect_enabled: boolean;
  rweb_tipjar_consumption_enabled: boolean;
  verified_phone_label_enabled: boolean;
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: boolean;
  responsive_web_graphql_timeline_navigation_enabled: boolean;
}

export interface SearchFieldsConfig {
  all: string;
  exact: string;
  any: string;
  none: string;
  hashtags: string;
  cashtags: string;
  lang: string;
  from: string;
  to: string;
  mentions: string;
  listId: string;
  following: string;
  verified: string;
  since: string;
  until: string;
  withinTime: string;
  sinceTime: string;
  untilTime: string;
  minLikes: string;
  maxLikes: string;
  minReposts: string;
  maxReposts: string;
  minReplies: string;
  maxReplies: string;
  media: string;
  replies: string;
  reposts: string;
  quotes: string;
  links: string;
  hashtagFilter: string;
  mentionFilter: string;
  safe: string;
  postType: string;
  hasEngagement: string;
  urlDomain: string;
  placeId: string;
  conversationId: string;
  replyToId: string;
  quoteId: string;
  quotedUserId: string;
  sinceId: string;
  maxId: string;
  extra: string;
}

export interface VisualConfig {
  snap: boolean;
  density: number;
  font: number;
  compact: boolean;
  colorfulTags: boolean;
  hideSeen: boolean;
  viewedThreshold: number;
  seenDelayMs: number;
  translatePosts: boolean;
  blockTweetOpen: boolean;
  translateForeignTags: boolean;
  seekPreviews: boolean;
  videoPauseDim: boolean;
  previewStepSeconds: number;
  playerMode: string;
  videoMute: boolean;
  bestQuality: boolean;
  autoPlayEnterPercent: number;
  autoPauseExitPercent: number;
  swipeToCloseVideo: boolean;
}

export interface DefaultSettingsSchema {
  replWorkspace: ReplWorkspaceConfig;
  relay: RelayConfig;
  repost: RepostConfig;
  studio: StudioConfig;
  lists: ListsConfig;
  listMutationFeatures: ListMutationFeaturesConfig;
  searchFields: SearchFieldsConfig;
  feed: FeedDefaultsConfig;
  visual: VisualConfig;
}

export type DefaultSettingsSectionKey = keyof DefaultSettingsSchema;

// ============================================================================
// Constantes de Configuração de Feed
// ============================================================================
const FEED_DEFAULTS: FeedDefaultsConfig = Object.freeze({
  media: "media",
  reposts: true,
});

// ============================================================================
// Funções Auxiliares Semânticas (Imutabilidade e Clonagem)
// ============================================================================
function deepCloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneValue(item)) as unknown as T;
  }
  if (value !== null && typeof value === OBJECT_TYPE_NAME) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepCloneValue(item)]),
    ) as unknown as T;
  }
  return value;
}

function deepFreezeObject<T>(value: T): T {
  if (value !== null && typeof value === OBJECT_TYPE_NAME) {
    Object.values(value as Record<string, unknown>).forEach((innerValue) => {
      deepFreezeObject(innerValue);
    });
    Object.freeze(value);
  }
  return value;
}

function validateSectionKeyExists(section: string): asserts section is DefaultSettingsSectionKey {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, section)) {
    throw new Error(`${UNKNOWN_SECTION_ERROR_PREFIX}${section}`);
  }
}

// ============================================================================
// Configurações Padrão Globais
// ============================================================================
export const DEFAULT_SETTINGS: DefaultSettingsSchema = deepFreezeObject({
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

// ============================================================================
// Função Principal Exportada
// ============================================================================
export function createDefaults<K extends DefaultSettingsSectionKey>(section: K): DefaultSettingsSchema[K] {
  validateSectionKeyExists(section);
  return deepCloneValue(DEFAULT_SETTINGS[section]);
}
