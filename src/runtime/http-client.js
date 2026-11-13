// Central transport boundary for userscripts. Never patch global fetch or XMLHttpRequest.
export function createHttpClient({ host = globalThis, signal, storage, namespace = "runtime", ttlMs = 60_000, maxEntries = 200 } = {}) {
  const cache = new Map();
  const pending = new Map();
  const stats = { hits: 0, misses: 0, requests: 0 };
  const gm = host.GM?.xmlHttpRequest?.bind(host.GM) ?? host.GM_xmlhttpRequest;
  const abortError = () => new DOMException("Aborted", "AbortError");
  const keyFor = (url, options) => JSON.stringify([url, (options.method ?? "GET").toUpperCase(), options.credentials ?? "same-origin", [...new Headers(options.headers ?? {}).entries()].sort()]);
  function gmFetch(url, options) {
    if (!gm) throw new Error("GM transport unavailable: check @grant and @connect");
    return new Promise((resolve, reject) => {
      let done = false;
      let handle;
      const stop = () => { handle?.abort?.(); finish(reject, abortError()); };
      function finish(fn, value) { if (done) return; done = true; options.signal?.removeEventListener("abort", stop); fn(value); }
      if (options.signal?.aborted) return reject(abortError());
      options.signal?.addEventListener("abort", stop, { once: true });
      try {
        handle = gm({
          url, method: options.method ?? "GET", headers: Object.fromEntries(new Headers(options.headers ?? {})),
          data: options.body, responseType: "arraybuffer", timeout: options.timeoutMs,
          onload: (response) => {
            const headers = new Headers();
            for (const line of String(response.responseHeaders ?? "").split(/\\r?\\n/)) {
              const i = line.indexOf(":"); if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
            }
            const status = Number(response.status);
            if (status < 200 || status > 599) return finish(reject, new TypeError("Invalid GM HTTP status: " + status));
            const body = options.method?.toUpperCase() === "HEAD" || status === 204 || status === 205 || status === 304 ? null : response.response;
            finish(resolve, new Response(body, { status, statusText: response.statusText, headers }));
          },
          onerror: () => finish(reject, new TypeError("GM request failed")),
          ontimeout: () => finish(reject, new DOMException("Request timed out", "TimeoutError")),
          onabort: () => finish(reject, abortError()),
        });
      } catch (error) { finish(reject, error); }
    });
  }
  async function request(url, options = {}) {
    const method = (options.method ?? "GET").toUpperCase();
    const key = keyFor(String(url), options);
    const useCache = method === "GET" && !options.signal && !signal && options.cacheMode !== "off" &&
      !new Headers(options.headers ?? {}).has("authorization") && options.credentials !== "include";
    const now = Date.now();
    if (useCache) {
      const hit = cache.get(key);
      if (hit && hit.expires > now) {
        stats.hits++;
        cache.delete(key); cache.set(key, hit);
        return hit.response.clone();
      }
      cache.delete(key);
    }
    stats.misses++;
    if (useCache && pending.has(key)) return (await pending.get(key)).clone();
    const run = async () => {
      stats.requests++;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      options.signal?.addEventListener("abort", cancel, { once: true });
      let timer;
      if (options.timeoutMs) timer = setTimeout(cancel, options.timeoutMs);
      try {
        if (controller.signal.aborted) throw abortError();
        const transport = options.transport ?? "auto";
        const opts = { ...options, signal: controller.signal };
        const response = transport === "gm" || (transport === "auto" && gm && new URL(String(url), host.location?.href).origin !== host.location?.origin)
          ? await gmFetch(String(url), opts)
          : await host.fetch(String(url), opts);
        if (useCache && response.ok && !/no-store|private/i.test(response.headers.get("cache-control") ?? "") && maxEntries > 0) {
          cache.set(key, { response: response.clone(), expires: Date.now() + (options.ttlMs ?? ttlMs) });
          while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
        }
        return response;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        options.signal?.removeEventListener("abort", cancel);
      }
    };
    // Shared requests must not be cancelled by an individual consumer.
    const task = run();
    if (useCache) pending.set(key, task);
    try { return (await task).clone(); }
    finally { if (pending.get(key) === task) pending.delete(key); }
  }
  return Object.freeze({
    request,
    async json(url, options) { const r = await request(url, options); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); },
    async text(url, options) { const r = await request(url, options); if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); },
    invalidate() { cache.clear(); },
    stats,
    dispose() { cache.clear(); pending.clear(); },
  });
}
