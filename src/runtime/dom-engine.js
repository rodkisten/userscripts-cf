// Shared DOM query engine. Strict mode invalidates on mutations before serving cache.
export function createDomEngine({ root = document, signal, maxEntries = 256 } = {}) {
  const cache = new Map();
  let generation = 0;
  const stats = { hits: 0, misses: 0, invalidations: 0 };
  const observer = typeof MutationObserver === "function"
    ? new MutationObserver(() => invalidate())
    : null;
  observer?.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  function invalidate() {
    generation++;
    stats.invalidations++;
    cache.clear();
  }
  function synchronize() {
    if (observer?.takeRecords().length) invalidate();
  }
  function lookup(selector, scope, many) {
    synchronize();
    if (scope !== root || !observer) {
      return many ? [...scope.querySelectorAll(selector)] : scope.querySelector(selector);
    }
    const key = (many ? "all:" : "one:") + selector;
    if (cache.has(key)) {
      stats.hits++;
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return many ? [...value] : value;
    }
    stats.misses++;
    const value = many ? [...scope.querySelectorAll(selector)] : scope.querySelector(selector);
    if (maxEntries > 0) {
      cache.set(key, value);
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    }
    return many ? [...value] : value;
  }
  function one(selector, scope = root) { return lookup(selector, scope, false); }
  function all(selector, scope = root) { return lookup(selector, scope, true); }
  function waitFor(selector, { scope = root, signal: ownSignal = signal, timeoutMs = 0 } = {}) {
    const found = one(selector, scope);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      let done = false;
      let timer;
      const watcher = new MutationObserver(() => {
        const value = scope.querySelector(selector);
        if (value) finish(resolve, value);
      });
      const abort = () => finish(reject, new DOMException("Aborted", "AbortError"));
      function finish(fn, value) {
        if (done) return;
        done = true;
        watcher.disconnect();
        clearTimeout(timer);
        ownSignal?.removeEventListener("abort", abort);
        fn(value);
      }
      if (ownSignal?.aborted) return abort();
      ownSignal?.addEventListener("abort", abort, { once: true });
      watcher.observe(scope, { childList: true, subtree: true, attributes: true });
      if (timeoutMs > 0) timer = setTimeout(() => finish(reject, new Error("DOM query timeout")), timeoutMs);
      // Close the gap between the first query and observer registration.
      const immediate = scope.querySelector(selector);
      if (immediate) finish(resolve, immediate);
    });
  }
  signal?.addEventListener("abort", () => observer?.disconnect(), { once: true });
  return Object.freeze({ one, all, waitFor, invalidate, stats, dispose() { observer?.disconnect(); cache.clear(); } });
}
