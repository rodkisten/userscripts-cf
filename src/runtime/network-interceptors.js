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
