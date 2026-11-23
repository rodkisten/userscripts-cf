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
  const scriptFailures = new Map();
  const original = {};

  const stringify = (value) => {
    if (value === null || value === undefined) return String(value);
    if (typeof value === "string") return value;
    if (typeof value === "bigint") return value.toString() + "n";
    if (value instanceof Error || (typeof value === "object" && "message" in value && "name" in value)) {
      return [value.name, value.message, value.stack, value.cause && stringify(value.cause)].filter(Boolean).join("\n");
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
    .replace(/(Bearer\s+)[\w.~-]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|secret|password|authorization)=)[^&#\s]+/gi, "$1[REDACTED]");

  const makeSpan = (cls, text) => {
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    return span;
  };

  const buildJsonTree = (value, depth = 0, keyName = null, isLast = true) => {
    const indent = "  ".repeat(depth);
    const comma = isLast ? "" : ",";

    if (value === null || typeof value !== "object") {
      const line = document.createElement("div");
      line.append(document.createTextNode(indent));
      if (keyName !== null) {
        line.append(makeSpan("json-key", JSON.stringify(keyName)), document.createTextNode(": "));
      }
      if (value === null) {
        line.append(makeSpan("json-null", "null"));
      } else if (typeof value === "string") {
        line.append(makeSpan("json-string", JSON.stringify(value)));
      } else if (typeof value === "number") {
        line.append(makeSpan("json-number", String(value)));
      } else if (typeof value === "boolean") {
        line.append(makeSpan("json-boolean", String(value)));
      }
      if (comma) line.append(document.createTextNode(comma));
      return line;
    }

    const isArray = Array.isArray(value);
    const keys = isArray ? value : Object.keys(value);
    const count = keys.length;
    const openBracket = isArray ? "[" : "{";
    const closeBracket = isArray ? "]" : "}";

    if (count === 0) {
      const line = document.createElement("div");
      line.append(document.createTextNode(indent));
      if (keyName !== null) {
        line.append(makeSpan("json-key", JSON.stringify(keyName)), document.createTextNode(": "));
      }
      line.append(document.createTextNode(openBracket + closeBracket + comma));
      return line;
    }

    const details = document.createElement("details");
    details.className = "json-node";
    if (depth < 2) details.open = true;

    const summary = document.createElement("summary");
    summary.append(document.createTextNode(indent));
    const arrow = makeSpan("json-arrow", "");
    summary.append(arrow);

    if (keyName !== null) {
      summary.append(makeSpan("json-key", JSON.stringify(keyName)), document.createTextNode(": "));
    }

    summary.append(document.createTextNode(openBracket));
    const previewText = isArray
      ? ` ${count} ${count === 1 ? "item" : "items"} `
      : ` ${count} ${count === 1 ? "key" : "keys"} `;
    summary.append(makeSpan("json-preview", previewText + closeBracket + comma));
    details.append(summary);

    const childrenContainer = document.createElement("div");
    if (isArray) {
      value.forEach((item, idx) => {
        childrenContainer.append(buildJsonTree(item, depth + 1, null, idx === count - 1));
      });
    } else {
      keys.forEach((k, idx) => {
        childrenContainer.append(buildJsonTree(value[k], depth + 1, k, idx === count - 1));
      });
    }

    const closingLine = document.createElement("div");
    closingLine.textContent = indent + closeBracket + comma;
    childrenContainer.append(closingLine);

    details.append(childrenContainer);
    return details;
  };

  // Extrai apenas blocos JSON reais do texto (puros ou embutidos em logs mistos)
  const renderMessage = (container, text) => {
    const trimmed = text.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          container.append(buildJsonTree(parsed));
          return;
        }
      } catch {
        // Fallback para busca de blocos parciais abaixo
      }
    }

    let cursor = 0;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "{" || ch === "[") {
        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;

        for (let j = i; j < text.length; j++) {
          const c = text[j];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (c === "\\" && inString) {
            escaped = true;
            continue;
          }
          if (c === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (c === "{" || c === "[") depth++;
            else if (c === "}" || c === "]") {
              depth--;
              if (depth === 0) {
                end = j;
                break;
              }
            }
          }
        }

        if (end !== -1) {
          const candidate = text.slice(i, end + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed === "object" && parsed !== null) {
              if (i > cursor) {
                container.append(document.createTextNode(text.slice(cursor, i)));
              }
              container.append(buildJsonTree(parsed));
              cursor = end + 1;
              i = cursor;
              continue;
            }
          } catch {
            // Não era JSON válido, segue varrendo como texto comum
          }
        }
      }
      i++;
    }

    if (cursor < text.length) {
      container.append(document.createTextNode(text.slice(cursor)));
    }
  };

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
        renderMessage(body, entry.message);
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
      .panel{width:min(390px,calc(100vw - 24px));max-height:min(48dvh,340px);overflow:auto;overscroll-behavior:contain;background:#15131d;color:#f5f3ff;border:1px solid #5b5277;border-radius:14px;box-shadow:0 10px 40px #0009;padding:12px}
      .toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
      .toolbar strong{font-size:13px}.entry{border-top:1px solid #393344;padding:8px 0}.entry small{color:#aaa1ba}
      .entry.error,.entry.warn{color:#ffb4b4}.entry.log,.entry.info,.entry.debug{color:#d2c6e5}
      pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 ui-monospace,monospace;margin:5px 0 0}
      details.json-node{display:block}
      details.json-node>summary{cursor:pointer;list-style:none;user-select:none;border-radius:4px}
      details.json-node>summary::-webkit-details-marker{display:none}
      details.json-node>summary:hover{background:#ffffff0d}
      .json-arrow::before{content:"▶ ";font-size:9px;color:#8e82a6;display:inline-block;width:12px}
      details.json-node[open]>summary>.json-arrow::before{content:"▼ "}
      .json-preview{color:#8e82a6;font-style:italic}
      details.json-node[open]>summary>.json-preview{display:none}
      .json-key{color:#9cdcfe}.json-string{color:#ce9178}.json-number{color:#b5cea8}.json-boolean{color:#569cd6}.json-null{color:#808080;font-style:italic}
      .hidden{display:none} @media(max-width:600px){.panel{max-height:40dvh}.shell{gap:5px}}
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

  // Resource load errors are captured separately from opaque cross-origin execution errors.
  // Do not guess a stack trace when Safari intentionally withholds it.
  document.addEventListener("error", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLScriptElement) || !target.src) return;
    const url = target.src;
    scriptFailures.set(url, (scriptFailures.get(url) || 0) + 1);
    capture("error", ["Script resource failed to load", url, "crossOrigin=" + (target.crossOrigin || "unset")], "script.resource");
  }, true);

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
      details.push("Safari concealed the original error. A stack trace is not available from this event.");
      details.push("Check the Safari Web Inspector and scripts loaded from other origins.");
      details.push("Page: " + location.href);
      details.push("Scripts: " + [...document.scripts].map((script) => script.src || "[inline]").join(", "));
      if (scriptFailures.size) details.push("Resource failures: " + [...scriptFailures].map(([url, count]) => url + " ×" + count).join(", "));
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
