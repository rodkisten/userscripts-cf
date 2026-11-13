// The only userscript-facing boundary for GM storage APIs.
// Legacy callers retain their serialized JSON format during migration.
export function createGMStorage(host = globalThis) {
  const modern = host.GM;
  const get = typeof modern?.getValue === "function" ? modern.getValue.bind(modern) : host.GM_getValue;
  const set = typeof modern?.setValue === "function" ? modern.setValue.bind(modern) : host.GM_setValue;
  const remove = typeof modern?.deleteValue === "function" ? modern.deleteValue.bind(modern) : host.GM_deleteValue;
  const available = typeof get === "function" && typeof set === "function";
  return Object.freeze({
    available,
    async get(key, fallback = null) {
      if (available) return (await get(key, fallback)) ?? fallback;
      try { return host.localStorage?.getItem(key) ?? fallback; }
      catch { return fallback; }
    },
    async set(key, value) {
      if (available) return set(key, value);
      if (!host.localStorage) throw new Error("Storage unavailable");
      host.localStorage.setItem(key, value);
    },
    async delete(key) {
      if (typeof remove === "function") return remove(key);
      if (!host.localStorage) throw new Error("Storage unavailable");
      host.localStorage.removeItem(key);
    },
  });
}
