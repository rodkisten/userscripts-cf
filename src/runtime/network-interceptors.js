// Shared, lifecycle-managed fetch interceptors. Only requests issued through ctx.http
// are intercepted; patching page globals would affect unrelated website traffic.
const registries = new WeakMap();
export function createNetworkInterceptors(http, { signal, onError = console.error } = {}) {
  let registry = registries.get(http);
  if (!registry) {
    registry = { requests: new Set(), responses: new Set(), original: http.request.bind(http) };
    registries.set(http, registry);
  }
  const owned = new Set();
  function register(kind, callback, options = {}) {
    if (typeof callback !== "function") throw new TypeError("Interceptor must be a function");
    const item = { callback, priority: options.priority ?? 0, once: !!options.once, match: options.match };
    const entries = registry[kind];
    entries.add(item);
    const off = () => { entries.delete(item); owned.delete(off); options.signal?.removeEventListener("abort", off); };
    owned.add(off);
    if (options.signal?.aborted || signal?.aborted) off();
    else options.signal?.addEventListener("abort", off, { once: true });
    return off;
  }
  async function apply(kind, value) {
    let current = value;
    for (const item of [...registry[kind]].sort((a, b) => b.priority - a.priority)) {
      if (!registry[kind].has(item)) continue;
      if (item.match && !(typeof item.match === "function" ? item.match(current) : String(current.url).includes(String(item.match)))) continue;
      if (item.once) registry[kind].delete(item);
      try {
        const next = await item.callback(current);
        if (next !== undefined) current = next;
      } catch (error) { onError("[Userscripts CF interceptor]", error); }
    }
    return current;
  }
  // Context-scoped wrapper: native Request/Response objects are not consumed.
  const request = async (url, options = {}) => {
    const initial = { url: String(url), ...options };
    const modified = await apply("requests", initial);
    const response = await registry.original(modified.url, modified);
    const result = await apply("responses", response);
    return result instanceof Response ? result : response;
  };
  const dispose = () => { for (const off of [...owned]) off(); };
  signal?.addEventListener("abort", dispose, { once: true });
  return Object.freeze({
    interceptRequest: (callback, options) => register("requests", callback, options),
    interceptResponse: (callback, options) => register("responses", callback, options),
    request,
    dispose,
  });
}

/**
 * Opt-in passive native fetch recorder. Reuses one patch per window and restores
 * the original function when the last subscriber unsubscribes.
 * Bodies are read from clones, never from the response delivered to the page.
 */
const nativeFetchObservers = new WeakMap();
export function observePageFetch(callback, { host = globalThis, signal, maxBodyCharacters = 120000 } = {}) {
  if (typeof callback !== "function") throw new TypeError("Expected network observer");
  if (typeof host.fetch !== "function") return () => {};
  let entry = nativeFetchObservers.get(host);
  if (!entry) {
    const original = host.fetch;
    const listeners = new Set();
    const wrapped = function (...args) {
      const start = Date.now();
      const request = args[0];
      const url = typeof request === "string" ? request : request?.url || String(request);
      const method = args[1]?.method || request?.method || "GET";
      const response = original.apply(this, args);
      Promise.resolve(response).then(async result => {
        const event = { url, method, status: result.status, durationMs: Date.now() - start, responseUrl: result.url, body: null, truncated: false };
        try {
          const type = result.headers?.get("content-type") || "";
          if (/json|text|xml|javascript|graphql|html/i.test(type)) {
            const body = await result.clone().text();
            event.body = body.slice(0, maxBodyCharacters);
            event.truncated = body.length > maxBodyCharacters;
          }
        } catch { /* Opaque, streaming and unreadable responses remain metadata-only. */ }
        for (const listener of [...listeners]) { try { listener(event); } catch { /* Observer errors must not affect fetch. */ } }
      }, error => {
        for (const listener of [...listeners]) { try { listener({ url, method, error: String(error), durationMs: Date.now() - start }); } catch {} }
      });
      return response;
    };
    host.fetch = wrapped;
    entry = { original, wrapped, listeners };
    nativeFetchObservers.set(host, entry);
  }
  entry.listeners.add(callback);
  const off = () => {
    entry.listeners.delete(callback);
    if (!entry.listeners.size) {
      if (host.fetch === entry.wrapped) host.fetch = entry.original;
      nativeFetchObservers.delete(host);
    }
    signal?.removeEventListener("abort", off);
  };
  if (signal?.aborted) off();
  else signal?.addEventListener("abort", off, { once: true });
  return off;
}
