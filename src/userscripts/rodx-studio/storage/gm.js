import { PREFIX } from "../config/search.js";

export let modernGM;

export function initializeDeckModernGM() {
  modernGM = typeof GM !== "undefined" ? GM : null;
}

export let gmGet;

export function initializeDeckGmGet() {
  gmGet =
    typeof GM_getValue === "function"
      ? GM_getValue
      : typeof modernGM?.getValue === "function"
        ? modernGM.getValue.bind(modernGM)
        : null;
}

export let gmSet;

export function initializeDeckGmSet() {
  gmSet =
    typeof GM_setValue === "function"
      ? GM_setValue
      : typeof modernGM?.setValue === "function"
        ? modernGM.setValue.bind(modernGM)
        : null;
}

export let gmAvailable;

export function initializeDeckGmAvailable() {
  gmAvailable = Boolean(gmGet && gmSet);
}

export function decodeStore(value) {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

export let storage;

export function initializeDeckStorage() {
  storage = {
    async get(key) {
      if (gmAvailable) return decodeStore(await gmGet(key, null));
      const raw = localStorage.getItem(key);
      return decodeStore(raw);
    },
    async set(key, value) {
      const serialized = JSON.stringify(value);
      if (gmAvailable) return await gmSet(key, serialized);
      localStorage.setItem(key, serialized);
    },
  };
}

export let recoveryKey;

export function initializeDeckRecoveryKey() {
  recoveryKey = (accountKey) => `${PREFIX}recovery:${accountKey}`;
}

export function recoveryRead(accountKey) {
  try {
    const value = JSON.parse(localStorage.getItem(recoveryKey(accountKey)) || "null");
    return value && Array.isArray(value.searches) && Array.isArray(value.presets) ? value : null;
  } catch (_) {
    return null;
  }
}

export function recoveryWrite(accountKey, value) {
  try {
    localStorage.setItem(recoveryKey(accountKey), JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}
