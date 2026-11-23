/* Shared early diagnostics for every playground HTML document. */
(() => {
  const key = "__rodPlaygroundCaptureV1";
  if (window[key]) return;
  const entries = [];
  const max = 150;
  let root;
  let list;
  let counter;
  let expanded = false;
  let rendering = false;
  const original = {};
  const stringify = (value) => {
    if (value === null || value === undefined) return String(value);
    if (typeof value === "string") return value;
    if (typeof value === "bigint") return value.toString() + "n";
    if (value instanceof Error || (typeof value === "object" && "message" in value && "name" in value)) {
      return [value.name, value.message, value.stack, value.cause && stringify(value.cause)].filter(Boolean).join("\\n");
    }
    if (typeof Event !== "undefined" && value instanceof Event) {
      return [value.type, value.message, value.filename, value.lineno, value.colno, value.target?.src, value.target?.href].filter(Boolean).join(" · ");
    }
    try {
      const seen = new WeakSet();
      return JSON.stringify(value, (_key, item) => {
        if (typeof item === "bigint") return item.toString();
        if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack, cause: item.cause };
        if (typeof item === "object" && item !== null) {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      }) ?? String(value);
    } catch {
      try { return String(value); } catch { return "[Unserializable]"; }
    }
  };
  const redact = (value) => String(value)
    .replace(/(Bearer\\s+)[\\w.~-]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|secret|password|authorization)=)[^&#\\s]+/gi, "$1[REDACTED]");
  function capture(level, args, source) {
    if (rendering) return;
    const message = redact(args.map(stringify).join(" "));
    const previous = entries[entries.length - 1];
    if (previous && previous.level === level && previous.message === message && previous.source === source) {
      previous.count++;
      previous.time = new Date().toLocaleTimeString();
    } else {
      entries.push({ level, message, source, time: new Date().toLocaleTimeString(), count: 1 });
      if (entries.length > max) entries.shift();
    }
    if (root) render();
  }
  function render() {
    if (!root || !list) return;
    rendering = true;
    try {
      counter.textContent = String(entries.reduce((total, entry) => total + entry.count, 0));
      list.replaceChildren();
      for (const entry of entries.slice(-60).reverse()) {
        const row = document.createElement("div");
        row.className = "entry " + entry.level;
        const meta = document.createElement("small");
        meta.textContent = entry.time + " · " + entry.level + " · " + entry.source + (entry.count > 1 ? " · ×" + entry.count : "");
        const body = document.createElement("pre");
        body.textContent = entry.message;
        row.append(meta, body);
        list.append(row);
      }
    } finally { rendering = false; }
  }
  function mount() {
    if (root || !document.body) return;
    const host = document.createElement("div");
    host.id = "rod-playground-diagnostics";
    host.style.cssText = "position:fixed;z-index:2147483647;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));font:12px system-ui;pointer-events:none";
    document.body.append(host);
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{color-scheme:dark}button{font:inherit;cursor:pointer;color:#eee;background:#292437;border:1px solid #605371;border-radius:9px;padding:8px 11px}
      .shell{pointer-events:auto;display:grid;justify-items:end;gap:7px}
      .panel{width:min(390px,calc(100vw - 24px));max-height:min(55dvh,450px);overflow:auto;background:#15131d;color:#f5f3ff;border:1px solid #5b5277;border-radius:14px;box-shadow:0 10px 40px #0009;padding:12px}
      .toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
      .toolbar strong{font-size:13px}.entry{border-top:1px solid #393344;padding:8px 0}.entry small{color:#aaa1ba}
      .entry.error,.entry.warn{color:#ffb4b4}.entry.log,.entry.info,.entry.debug{color:#d2c6e5}
      pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 ui-monospace,monospace;margin:5px 0 0}
      .hidden{display:none}
    `;
    const shell = document.createElement("div"); shell.className = "shell";
    const toggle = document.createElement("button"); toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "🩺 Logs ";
    counter = document.createElement("span"); counter.textContent = "0"; toggle.append(counter);
    const panel = document.createElement("section"); panel.className = "panel hidden"; panel.setAttribute("aria-label", "Playground logs and errors");
    const toolbar = document.createElement("div"); toolbar.className = "toolbar";
    const heading = document.createElement("strong"); heading.textContent = "Logs e erros";
    const copy = document.createElement("button"); copy.textContent = "Copiar"; copy.onclick = () => navigator.clipboard?.writeText(JSON.stringify(entries, null, 2));
    const clear = document.createElement("button"); clear.textContent = "Limpar"; clear.onclick = () => { entries.length = 0; render(); };
    toolbar.append(heading, copy, clear);
    list = document.createElement("div"); list.setAttribute("role", "log");
    panel.append(toolbar, list); shell.append(toggle, panel); root.append(style, shell);
    toggle.onclick = () => { expanded = !expanded; panel.classList.toggle("hidden", !expanded); toggle.setAttribute("aria-expanded", String(expanded)); };
    render();
  }
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    original[level] = console[level];
    console[level] = function (...args) {
      capture(level, args, "console");
      return original[level].apply(this, args);
    };
  }
  window.addEventListener("error", (event) => {
    const target = event.target;
    const resource = target && target !== window ? target.src || target.href || target.currentSrc : "";
    const details = [
      event.error,
      event.message,
      event.filename && (event.filename + ":" + event.lineno + ":" + event.colno),
      resource && ("Resource: " + resource),
    ].filter(Boolean);
    if (event.message === "Script error." || (!event.error && !event.filename && !resource)) {
      details.push("Opaque browser error: check cross-origin scripts, CORS and Safari Web Inspector");
      details.push("Page: " + location.href);
      details.push("Scripts: " + [...document.scripts].map((script) => script.src || "[inline]").join(", "));
    }
    capture("error", details.length ? details : ["Resource loading error", target?.tagName], "window.error");
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    capture("error", [event.reason ?? "Unhandled rejection", event.reason?.stack], "promise");
  }, true);
  window[key] = Object.freeze({ entries, capture, open: () => { mount(); if (!expanded) root.querySelector("button").click(); } });
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
