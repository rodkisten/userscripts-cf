import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { PREFIX } from "../config/search.js";
import { state } from "../state/deck.js";
import { storage } from "../storage/gm.js";
import { CloudSync } from "../sync/cloud.js";

export let Seen;

export function initializeDeckSeen() {
  Seen = (() => {
    const key = (account) => PREFIX + "viewed:" + account;
    let savedVersion = 0;
    async function load(account) {
      if (!account) return;
      state.seenAccount = account;
      let value = null;
      try {
        value = await storage.get(key(account));
      } catch (_) {}
      if (!value)
        try {
          value = JSON.parse(localStorage.getItem(key(account)) || "null");
        } catch (_) {}
      if (state.account !== account) return;
      state.seen = new Map(
        (Array.isArray(value) ? value : [])
          .filter((a) => Array.isArray(a) && /^\d{5,25}$/.test(a[0]))
          .slice(-10000),
      );
    }
    function flushSoon() {
      clearTimeout(state.seenSaveTimer);
      const version = ++savedVersion;
      state.seenSaveTimer = setTimeout(async () => {
        if (version !== savedVersion || !state.account) return;
        const account = state.account;
        const entries = [...state.seen.entries()].slice(-10000);
        try {
          localStorage.setItem(key(account), JSON.stringify(entries));
        } catch (_) {}
        try {
          await storage.set(key(account), entries);
        } catch (e) {
          console.warn("[RodX] Vistos preservados localmente", e);
        }
      }, RUNTIME_LIMITS.tweetsSeen.flushSoonDelayMs);
    }
    function mark(id) {
      if (!state.account || !id || state.seen.has(id)) return;
      const at = Date.now();
      state.seen.set(id, at);
      CloudSync.markSeen(state.account, id, at);
      if (state.seen.size > 10000) state.seen.delete(state.seen.keys().next().value);
      flushSoon();
    }
    return Object.freeze({
      load,
      mark,
      flushSoon,
    });
  })();
}
