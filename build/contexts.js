// Sandbox modules retain direct GM APIs and @require globals.
// Main-world modules use the restricted bridge already validated by the lab.
export function installSandbox(factory, key) {
  const instances = (window.__userscriptsCF ||= {});
  const instanceKey = key + ":sandbox";
  if (instances[instanceKey]) return;
  const bridge = {
    async call(operation, { id, key: name, value, fallback }) {
      const storageKey = "userscripts-cf:v1:" + id + ":" + name;
      if (operation === "get") return GM_getValue(storageKey, fallback);
      if (operation === "set") return GM_setValue(storageKey, value);
      if (operation === "delete") return GM_deleteValue(storageKey);
      throw Error("Unsupported storage operation");
    },
  };
  // No serialization/injection here: direct sandbox invocation preserves GM APIs.
  instances[instanceKey] = factory().boot(bridge);
}
