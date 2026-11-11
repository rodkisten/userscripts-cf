// Serialized into the page context. No import(), eval(), Blob URL or Function().
export function pageBridge(channel) {
  const pending = new Map();
  let serial = 0;
  const reply = (event) => {
    let data;
    try {
      data = JSON.parse(event.detail);
    } catch {
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    clearTimeout(job.timer);
    if (data.error) job.reject(Error(data.error));
    else job.resolve(data.value);
  };
  document.addEventListener(channel + ":reply", reply);
  return {
    call(op, args) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("GM bridge timeout"));
        }, 5000);
        pending.set(id, { resolve, reject, timer });
        document.dispatchEvent(
          new CustomEvent(channel + ":request", {
            detail: JSON.stringify({ id, op, args }),
          }),
        );
      });
    },
    dispose() {
      document.removeEventListener(channel + ":reply", reply);
      document.dispatchEvent(new CustomEvent(channel + ":closed"));
      for (const job of pending.values()) {
        clearTimeout(job.timer);
        job.reject(Error("GM bridge disposed"));
      }
      pending.clear();
    },
  };
}

// Serialized into the Tampermonkey sandbox, where GM APIs are available.
export function install(factory, createBridge, allowedIDs, key) {
  const marker = "__userscripts_cf_" + key;
  if (window[marker]) return;
  window[marker] = true;
  const channel = "userscripts-cf:" + crypto.randomUUID();
  const allowed = new Set(allowedIDs);
  const handle = async (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch {
      return;
    }
    const response = { id: request.id };
    try {
      const { id, key: name, value, fallback } = request.args || {};
      if (!allowed.has(id) || typeof name !== "string" || name.length > 200)
        throw Error("Invalid storage scope");
      const storageKey = "userscripts-cf:v1:" + id + ":" + name;
      if (request.op === "get") response.value = await GM_getValue(storageKey, fallback);
      else if (request.op === "set") {
        await GM_setValue(storageKey, value);
        response.value = true;
      } else if (request.op === "delete") {
        await GM_deleteValue(storageKey);
        response.value = true;
      } else throw Error("Unsupported bridge operation");
    } catch (error) {
      response.error = String(error.message || error);
    }
    document.dispatchEvent(new CustomEvent(channel + ":reply", { detail: JSON.stringify(response) }));
  };
  document.addEventListener(channel + ":request", handle);
  document.addEventListener(
    channel + ":closed",
    () => {
      document.removeEventListener(channel + ":request", handle);
    },
    { once: true },
  );
  let observer;
  const inject = () => {
    const root = document.documentElement;
    if (!root) return false;
    observer?.disconnect();
    const script = document.createElement("script");
    script.textContent = `(() => {
      const bridge = (${createBridge.toString()})(${JSON.stringify(channel)});
      const UserscriptsCF = (${factory.toString()})();
      const instances = window.__userscriptsCF ||= {};
      if (instances[${JSON.stringify(key)}]) { bridge.dispose(); return; }
      instances[${JSON.stringify(key)}] = UserscriptsCF.boot(bridge);
    })();`;
    root.append(script);
    script.remove();
    return true;
  };
  if (!inject()) {
    observer = new MutationObserver(inject);
    observer.observe(document, { childList: true });
  }
}
