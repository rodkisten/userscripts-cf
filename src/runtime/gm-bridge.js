// Preserve modern GM.* and legacy GM_* signatures without changing grants.
// This is intentionally a passthrough, not a replacement for Tampermonkey APIs.
export function createGMBridge(host = globalThis) {
  const modern = host.GM ?? {};
  const legacy = new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      const fn = host["GM_" + property];
      return typeof fn === "function" ? fn.bind(host) : fn;
    },
  });
  return Object.freeze({ modern, legacy });
}
