// ============================================================================
// Constantes Semânticas
// ============================================================================
const CONFIG_KEY_DEFAULT = "gws:config:v1";
const SEEN_KEY_DEFAULT = "gws:seen:v1";
const CACHE_KEY_DEFAULT = "gws:audio-cache:v1";
const PLAYBACK_KEY_DEFAULT = "gws:playback:v1";

const DEFAULT_SUBREDDIT_NAME = "GoneWildAudioGay";
const DEFAULT_TIME_FORMAT_ZERO = "0:00";
const SAFE_URL_PROTOCOLS_REGEX = /^https?:$/;
const HOSTNAME_MATCH_REGEX = /(?:^|\.)(?:soundgasm\.net|audiochan\.(?:com|net)|audioerotica\.(?:com|net))$/i;
const AUDIO_EXTENSION_REGEX = /\.(?:mp3|m4a|aac|ogg|opus|wav)(?:[?#]|$)/i;
const CATEGORY_TAG_REGEX = /^(?:(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM){1,3}4(?:M|F|A|NB|T|TM|TF|MM|FF|MF|FM|B|NB){1,3}|NSFW|SFW|MDOM|MSUB|18\+)|\[\s*(?:Script\s+(?:Offer|Fill)|Improv|OC|Verification)\s*\]|\[\s*(?:gentle\s+\w*)\]|\[(?:mdom|msub)\s*(?:\w*)\]|\[\w*\s*(?:speaker)]|\[\w*\s*(?:listener)\]/gi;
const BRACKET_MATCH_REGEX = /\[([^\[\]\r\n]{1,180})\]/g;
const TAG_KEYWORDS_MATCH_REGEX = /\b(?:tags?|keywords?|kinks?|themes?|genres?)\s*:\s*((?:\s*\[[^\[\]\r\n]{1,180}\])+)/gi;
const TAG_GROUP_MATCH_REGEX = /(?:\b(?:tags?|keywords?|kinks?|themes?|genres?)\s*:\s*)?((?:\s*\[[^\[\]\r\n]{1,180}\]){2,})/gi;
const URL_EXTRACT_REGEX = /https?:\/\/[^\s<>"'\])}]+/gi;
const URL_CLEANUP_PUNCTUATION_REGEX = /[.,;:!?]+$/;
const TIMESTAMP_DIGITS_REGEX = /^\d{10,13}$/;
const ESCAPED_SLASH_REGEX = /\\\//g;
const HTML_AMP_REGEX = /&amp;/g;

const MAX_TIMESTAMP_LOWER_BOUND = 1e11;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MAX_EXTRACTED_LINKS_LIMIT = 5;

// ============================================================================
// Tipagens e Interfaces Estritas
// ============================================================================
export type AudioItem = {
  external: string;
  playable: string | null;
  studioHref?: string;
};

export type Recording = {
  title: string;
  description: string;
  href: string;
  plays: number;
  index: number;
};

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

// ============================================================================
// Configurações e Padrões Globais
// ============================================================================
export const DEFAULTS: Settings = Object.freeze({
  subreddits: [DEFAULT_SUBREDDIT_NAME],
  removeAds: true,
  showTags: true,
  audio: true,
  hideSeen: false,
  networkFilter: true,
  onlyAudio: false,
});

export const KEYS = Object.freeze({
  config: CONFIG_KEY_DEFAULT,
  seen: SEEN_KEY_DEFAULT,
  cache: CACHE_KEY_DEFAULT,
  playback: PLAYBACK_KEY_DEFAULT,
});

export const HOSTS = HOSTNAME_MATCH_REGEX;
export const AUDIO_EXT = AUDIO_EXTENSION_REGEX;

// ============================================================================
// Funções Auxiliares Semânticas
// ============================================================================
export function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function categoryTag(tag: string): boolean {
  return CATEGORY_TAG_REGEX.test(tag.replace(/\s/g, ""));
}

export function parseTags(title: string, description = ""): string[] {
  const tags: string[] = [];
  
  const extractBrackets = (text: string, whole = text, offset = 0) => {
    for (const matchResult of text.matchAll(BRACKET_MATCH_REGEX)) {
      if (/^\s*\(/.test(whole.slice(offset + matchResult.index! + matchResult[0].length))) continue;
      const value = matchResult[1].replace(/\s+/g, " ").trim();
      if (value && !/^https?:\/\//i.test(value) && !/[<>]/.test(value)) {
        tags.push(value);
      }
    }
  };

  extractBrackets(title);

  for (const match of description.matchAll(TAG_KEYWORDS_MATCH_REGEX)) {
    extractBrackets(match[1], description, match.index! + match[0].indexOf(match[1]));
  }

  for (const match of description.matchAll(TAG_GROUP_MATCH_REGEX)) {
    extractBrackets(match[1], description, match.index! + match[0].indexOf(match[1]));
  }

  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = normalize(tag);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function cleanTitle(title: string): string {
  return (
    title
      .replace(BRACKET_MATCH_REGEX, " ")
      .replace(/\s+/g, " ")
      .trim() || title
  );
}

export function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  if (seconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR);
    const minutes = String(Math.floor(seconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE).padStart(2, "0");
    const remainingSeconds = String(seconds % SECONDS_PER_MINUTE).padStart(2, "0");
    return `${hours}:${minutes}:${remainingSeconds}`;
  }
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainingSeconds = String(seconds % SECONDS_PER_MINUTE).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be disabled in private tabs. */
  }
}

export function safeURL(value: string, base = location.href): URL | null {
  try {
    const url = new URL(value, base);
    return SAFE_URL_PROTOCOLS_REGEX.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function extractLinks(text: string): string[] {
  const rawText = String(text || "")
    .replace(ESCAPED_SLASH_REGEX, "/")
    .replace(HTML_AMP_REGEX, "&");

  const matches = rawText.matchAll(URL_EXTRACT_REGEX);
  const uniqueUrls = new Set<string>();

  for (const match of matches) {
    const cleanedRawUrl = match[0].replace(URL_CLEANUP_PUNCTUATION_REGEX, "");
    const url = safeURL(cleanedRawUrl);
    if (url && HOSTS.test(url.hostname)) {
      uniqueUrls.add(cleanedRawUrl);
    }
  }

  return Array.from(uniqueUrls).slice(0, MAX_EXTRACTED_LINKS_LIMIT);
}
