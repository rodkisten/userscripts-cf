// Preserve modern GM.* and legacy GM_* signatures without changing grants.
// This is intentionally a passthrough, not a replacement for Tampermonkey APIs.
export function createGMBridge(host = globalThis, moduleId = "") {
  const modern = host.GM ?? {};
  const menuCommands = new Map();
  const legacy = new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      if (property === "registerMenuCommand") return (label, callback, options) => {
        const original = host.GM_registerMenuCommand;
        if (typeof original !== "function") return undefined;
        const id = original(label, callback, options);
        if (typeof callback === "function") {
          menuCommands.set(id, { label, callback });
          host.document?.dispatchEvent(new host.CustomEvent("rod-dock:menu", {
            detail: { type: "register", moduleId, id, label, callback },
          }));
        }
        return id;
      };
      if (property === "unregisterMenuCommand") return (id) => {
        menuCommands.delete(id);
        host.document?.dispatchEvent(new host.CustomEvent("rod-dock:menu", {
          detail: { type: "unregister", moduleId, id },
        }));
        return host.GM_unregisterMenuCommand?.(id);
      };
      const fn = host["GM_" + property];
      return typeof fn === "function" ? fn.bind(host) : fn;
    },
  });
  return Object.freeze({ modern, legacy });
}
