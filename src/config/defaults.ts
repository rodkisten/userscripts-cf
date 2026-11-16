export interface FeedDefaults {
  media: string;
  reposts: boolean;
}

export const FEED_DEFAULTS: FeedDefaults = Object.freeze({ media: "media", reposts: true });

// User-facing settings defaults. Consumers receive independent mutable copies.
const clone = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(clone) as unknown as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, clone(item)])
    ) as unknown as T;
  }
  return value;
};

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const DEFAULT_SETTINGS = freeze({
  replWorkspace: {
    code: '// Ctrl/Cmd+Enter executa. Variáveis de topo persistem na sessão.\nconst title = document.title;\nconsole.log("Página:", location.href);\nawait Promise.resolve(title)',
    history: [] as string[],
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
    enqueueAfter
