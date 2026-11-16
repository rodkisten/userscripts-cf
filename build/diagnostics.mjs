// Lightweight diagnostic prelude injected into every generated userscript.
// Shared across installations on the same JavaScript global.
export function diagnosticPrelude(target, version, scripts) {
  const key = "__rodScriptDiagnosticsV1";
  const storageKey = "rod:script-diagnostics:v1";
  const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  let state = root[key];
  if (!state) {
    const history = (() => {
      try { return JSON.parse(root.localStorage.getItem(storageKey) || "[]"); }
      catch { return []; }
    })();
    state = { scripts: {}, history: Array.isArray(history) ? history : [], capture: null };
    const redact = (value) => String(value ?? "")
      .replace(/(Bearer\s+)[\w.~-]+/gi, "$1[REDACTED]")
      .replace(/([?&](?:token|key|secret|password|authorization)=)[^&#\s]+/gi, "$1[REDACTED]");
    state.capture = (error, source = "manual", owner = null) => {
      try {
        const message = redact(error?.message || error || "Unknown error");
        const stack = redact(error?.stack || "");
        const script = owner || "unknown";
        const fingerprint = [script, source, message, stack.split("\n")[1] || ""].join("|");
        const existing = state.history.find(item => item.fingerprint === fingerprint);
        if (existing) { existing.count++; existing.lastSeen = new Date().toISOString(); }
        else state.history.unshift({ fingerprint, script, source, message, stack,
          count: 1, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(),
          url: root.location?.origin + root.location?.pathname });
        state.history.length = Math.min(state.history.length, 250);
        try { root.localStorage.setItem(storageKey, JSON.stringify(state.history)); } catch {}
      } catch {}
    };
    root.addEventListener("error", event => {
      if (event.error) state.capture(event.error, "window.error");
      else if (event.target !== root) state.capture("Resource failed: " + (event.target?.tagName || "unknown"), "resource.error");
    }, true);
    root.addEventListener("unhandledrejection", event => state.capture(event.reason, "unhandledrejection"));
    state.export = () => JSON.stringify({ schema: 1, scripts: state.scripts, errors: state.history }, null, 2);
    state.clear = () => { state.history.length = 0; try { root.localStorage.removeItem(storageKey); } catch {} };
    root[key] = state;
  }
  for (const script of scripts) state.scripts[script] = { target, version };
  return state;
}
