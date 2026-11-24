// Sandbox modules retain direct GM APIs and @require globals.
// A DOM-owned lease coordinates separate userscript sandboxes and versions.
export function installSandbox(factory, key) {
  const root = document.documentElement;
  if (!root) {
    document.addEventListener("DOMContentLoaded", () => installSandbox(factory, key), { once: true });
    return;
  }

  const version =
    typeof GM_info !== "undefined" && GM_info?.script?.version ? String(GM_info.script.version) : "0";
  const scope = key + ":sandbox";
  const attribute = "data-userscripts-cf-" + key.replace(/[^a-z0-9-]/gi, "-");
  const channel = "userscripts-cf:lease:" + scope;
  const token = String(Date.now()) + ":" + Math.random().toString(36).slice(2);
  const compareVersions = (left, right) => {
    const a = String(left).match(/\d+/g) || [];
    const b = String(right).match(/\d+/g) || [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const difference = Number(a[i] || 0) - Number(b[i] || 0);
      if (difference) return Math.sign(difference);
    }
    return 0;
  };
  const readLease = () => {
    try {
      return JSON.parse(root.getAttribute(attribute) || "null");
    } catch {
      return null;
    }
  };
  const current = readLease();
  if (current && compareVersions(current.version, version) >= 0) return;

  // Claim synchronously before boot, preventing older builds from mounting later.
  const lease = { version, token };
  root.setAttribute(attribute, JSON.stringify(lease));
  document.dispatchEvent(new CustomEvent(channel, { detail: lease }));
  const bridge = {
    async call(operation, { id, key: name, value, fallback }) {
      const storageKey = "userscripts-cf:v1:" + id + ":" + name;
      if (operation === "get") return GM_getValue(storageKey, fallback);
      if (operation === "set") return GM_setValue(storageKey, value);
      if (operation === "delete") return GM_deleteValue(storageKey);
      throw Error("Unsupported storage operation");
    },
  };
  let runtime;
  let stopped = false;
  const onLeaseChange = (event) => {
    const next = event.detail;
    if (!next || next.token === token || stopped) return;
    if (compareVersions(next.version, version) < 0) return;
    stopped = true;
    document.removeEventListener(channel, onLeaseChange);
    if (runtime) void Promise.resolve(runtime.dispose()).catch(console.error);
  };
  document.addEventListener(channel, onLeaseChange);
  try {
    runtime = factory().boot(bridge);
    // Another sandbox may have claimed a newer version while boot was running.
    if (readLease()?.token !== token) onLeaseChange({ detail: readLease() });
  } catch (error) {
    document.removeEventListener(channel, onLeaseChange);
    if (readLease()?.token === token) root.removeAttribute(attribute);
    throw error;
  }
}
