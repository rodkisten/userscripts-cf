// Preserve Tampermonkey's native menu behavior while mirroring commands into the Dock.
// The wrapper never creates a second native menu item.
export function createGMBridge(host = globalThis, moduleId = "") {
  const menuCommands = new Map();
  const notify = (detail) => {
    if (host.document?.dispatchEvent && typeof host.CustomEvent === "function")
      host.document.dispatchEvent(new host.CustomEvent("rod-dock:menu", { detail: { moduleId, ...detail } }));
  };
  const register = (native, label, callback, options) => {
    if (typeof native !== "function") return undefined;
    const id = native(label, callback, options);
    if (typeof callback === "function") {
      menuCommands.set(id, { label, callback });
      notify({ type: "register", id, label, callback });
    }
    return id;
  };
  const unregister = (native, id) => {
    const result = typeof native === "function" ? native(id) : undefined;
    if (menuCommands.delete(id)) notify({ type: "unregister", id });
    return result;
  };
  const modern = new Proxy(host.GM ?? {}, {
    get(target, property, receiver) {
      if (property === "registerMenuCommand")
        return (label, callback, options) =>
          register(typeof target.registerMenuCommand === "function" ? target.registerMenuCommand.bind(target) : undefined, label, callback, options);
      if (property === "unregisterMenuCommand")
        return (id) => unregister(typeof target.unregisterMenuCommand === "function" ? target.unregisterMenuCommand.bind(target) : undefined, id);
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const legacy = new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      if (property === "registerMenuCommand")
        return (label, callback, options) => register(host.GM_registerMenuCommand?.bind(host), label, callback, options);
      if (property === "unregisterMenuCommand")
        return (id) => unregister(host.GM_unregisterMenuCommand?.bind(host), id);
      const value = host["GM_" + property];
      return typeof value === "function" ? value.bind(host) : value;
    },
  });
  return Object.freeze({ modern, legacy });
}
