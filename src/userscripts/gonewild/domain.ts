export type AudioItem = { external: string; playable: string | null; studioHref?: string };
export type Recording = { title: string; description: string; href: string; plays: number; index: number };
export type Post = {
  id: string;
  title: string;
  sub: string;
  href: string;
  author: string;
  body: string;
  links: string[];
  tags: string[];
};
export type Settings = {
  subreddits: string[];
  removeAds: boolean;
  showTags: boolean;
  audio: boolean;
  hideSeen: boolean;
  networkFilter: boolean;
  onlyAudio: boolean;
};
export const DEFAULTS: Settings = {
  subreddits: ["GoneWildAudioGay"],
  removeAds: true,
  showTags: true,
  audio: true,
  hideSeen: false,
  networkFilter: true,
  onlyAudio: false,
};
export const KEYS = {
  config: "gws:config:v1",
  seen: "gws:seen:v1",
  cache: "gws:audio-cache:v1",
  playback: "gws:playback:v1",
};
export const HOSTS = /(?:^|\.)(?:soundgasm\.net|audiochan\.(?:com|net)|audioerotica\.(?:com|net))$/i;
export const AUDIO_EXT = /\.(?:mp3|m4a|aac|ogg|opus|wav)(?:[?#]|$)/i;
export const normalize = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
export const categoryTag = (tag: string) =>
  /^(?:(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM){1,3}4(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM){1,3}|NSFW|SFW|18\+)$/i.test(
    tag.replace(/\s/g, ""),
  );
export function parseTags(title: string, description = ""): string[] {
  const tags: string[] = [];
  const brackets = (text: string, whole = text, offset = 0) => {
    for (const m of text.matchAll(/\[([^\[\]\r\n]{1,180})\]/g)) {
      if (/^\s*\(/.test(whole.slice(offset + m.index! + m[0].length))) continue;
      const value = m[1].replace(/\s+/g, " ").trim();
      if (value && !/^https?:\/\//i.test(value) && !/[<>]/.test(value)) tags.push(value);
    }
  };
  brackets(title);
  for (const match of description.matchAll(
    /\b(?:tags?|keywords?|kinks?|themes?|genres?)\s*:\s*((?:\s*\[[^\[\]\r\n]{1,180}\])+)/gi,
  ))
    brackets(match[1], description, match.index! + match[0].indexOf(match[1]));
  for (const m of description.matchAll(
    /(?:\b(?:tags?|keywords?|kinks?|themes?|genres?)\s*:\s*)?((?:\s*\[[^\[\]\r\n]{1,180}\]){2,})/gi,
  ))
    brackets(m[1], description, m.index! + m[0].indexOf(m[1]));
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = normalize(tag);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export const cleanTitle = (title: string) =>
  title
    .replace(/\[[^\[\]\r\n]{1,180}\]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || title;
export function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function readJSON<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be disabled in private tabs. */
  }
}
export function safeURL(value: string, base = location.href) {
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}
export function extractLinks(text: string) {
  return [
    ...new Set(
      [
        ...String(text || "")
          .replace(/\\\//g, "/")
          .replace(/&amp;/g, "&")
          .matchAll(/https?:\/\/[^\s<>"'\])}]+/gi),
      ]
        .map((m) => m[0].replace(/[.,;:!?]+$/, ""))
        .filter((raw) => {
          const url = safeURL(raw);
          return url && HOSTS.test(url.hostname);
        }),
    ),
  ].slice(0, 5);
}
