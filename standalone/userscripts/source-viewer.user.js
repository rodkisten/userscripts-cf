// ==UserScript==
// @name         🥵 000 / Ultra Virtual Pretty Viewer
// @namespace    https://rod.dev/userscripts
// @version      2.6.0
// @description  Stable mobile-safe virtualized source viewer with full-source HLJS highlighting, exact search centering, auto-pretty, and soft wrap.
// @author       Rod
// @match        *://*/*
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/prettier-standalone@1.3.1-0/bundle.min.js
// @grant        none
// @noframes
// @weight       999
// ==/UserScript==

(async function UltraPrettyViewer() {
  "use strict";

  /***************************************************************************************************
   * Constants
   **************************************************************************************************/

  const APP_ID = "__ROD_ULTRA_PRETTY_VIEWER__";
  const META_ID = "__ROD_ULTRA_PRETTY_META__";
  const DEBUG = true;

  const BLOCK_SIZE = 100;
  const BLOCK_OVERSCAN = 4;
  const DEFAULT_LINE_HEIGHT = 19.44;
  const DEFAULT_BLOCK_HEIGHT = BLOCK_SIZE * DEFAULT_LINE_HEIGHT;

  const AUTO_PRETTY_MAX_BYTES = 120 * 1024;
  const AUTO_PRETTY_MAX_LINES = 1800;
  const PRETTIER_TIMEOUT_MS = 3500;

  const SEARCH_DEBOUNCE_MS = 120;
  const MAX_SEARCH_MATCHES = 5000;
  const SEARCH_SETTLE_MAX_PASSES = 6;

  const CDN = {
    prettier: "https://esm.sh/prettier@3.3.3/standalone?bundle&target=es2022",
    prettierBabel: "https://esm.sh/prettier@3.3.3/plugins/babel?bundle&target=es2022",
    prettierEstree: "https://esm.sh/prettier@3.3.3/plugins/estree?bundle&target=es2022",
    prettierHtml: "https://esm.sh/prettier@3.3.3/plugins/html?bundle&target=es2022",
    prettierCss: "https://esm.sh/prettier@3.3.3/plugins/postcss?bundle&target=es2022",
    hljs: "https://esm.sh/highlight.js@11.11.1/lib/core?bundle&target=es2022",
    hljsJs: "https://esm.sh/highlight.js@11.11.1/lib/languages/javascript?bundle&target=es2022",
    hljsTs: "https://esm.sh/highlight.js@11.11.1/lib/languages/typescript?bundle&target=es2022",
    hljsJson: "https://esm.sh/highlight.js@11.11.1/lib/languages/json?bundle&target=es2022",
    hljsCss: "https://esm.sh/highlight.js@11.11.1/lib/languages/css?bundle&target=es2022",
    hljsXml: "https://esm.sh/highlight.js@11.11.1/lib/languages/xml?bundle&target=es2022",
  };

  /***************************************************************************************************
   * State
   **************************************************************************************************/

  const state = {
    rawSource: "",
    currentSource: "",
    lines: [],
    blocks: [],
    blockHeights: [],
    blockOffsets: [],
    totalHeight: 1,
    visibleStartBlock: -1,
    visibleEndBlock: -1,
    highlightedLines: [],
    highlightedCache: new Map(),
    renderQueued: false,
    renderVersion: 0,
    searchQuery: "",
    searchMatches: [],
    searchMatchesByLine: new Map(),
    searchIndex: -1,
    searchVersion: 0,
    searchJumpToken: 0,
    hljs: null,
    highlighterSource: "mini",
    prettier: null,
    prettierPlugins: [],
    prettierSource: "mini",
    language: "javascript",
    parser: "babel",
    mode: "raw",
    softWrap: true,
  };

  /***************************************************************************************************
   * Helpers
   **************************************************************************************************/

  function debug(...args) {
    if (DEBUG) console.log("[UltraPrettyViewer]", ...args);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function waitForBody() {
    while (!document.body) {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    }
  }

  function idle(callback) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(callback, { timeout: 220 });
      return;
    }
    window.setTimeout(callback, 16);
  }

  function debounce(callback, wait) {
    let timer = 0;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback(...args), wait);
    };
  }

  function lockZoom() {
    const preventGesture = (event) => event.preventDefault();
    let lastTouch = 0;

    const handleTouchEnd = (event) => {
      const now = Date.now();
      if (now - lastTouch < 360) event.preventDefault();
      lastTouch = now;
    };

    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: false });
  }

  function ensureViewportMeta() {
    if (document.getElementById(META_ID)) return;
    const meta = document.createElement("meta");
    meta.id = META_ID;
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover";
    document.documentElement.appendChild(meta);
  }

  function detectLanguage(source) {
    const path = location.pathname.toLowerCase();
    if (path.endsWith(".json") || /^[\s\n\r]*[{[]/.test(source)) {
      return { language: "json", parser: "json" };
    }
    if (path.endsWith(".css")) return { language: "css", parser: "css" };
    if (path.endsWith(".html") || path.endsWith(".xml") || /^\s*</.test(source)) {
      return { language: "html", parser: "html" };
    }
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      return { language: "typescript", parser: "typescript" };
    }
    return { language: "javascript", parser: "babel" };
  }

  function formatBytes(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.inset = "0";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    }
  }

  function withTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Prettier timed out")), timeout);
      }),
    ]);
  }

  function shouldAutoPretty() {
    return state.rawSource.length <= AUTO_PRETTY_MAX_BYTES &&
      state.rawSource.split("\n").length <= AUTO_PRETTY_MAX_LINES;
  }

  function trimMiddle(value, maxLength = 12) {
    const text = String(value);
    if (text.length <= maxLength) return text;
    const side = Math.floor((maxLength - 1) / 2);
    return `${text.slice(0, side)}…${text.slice(-side)}`;
  }

  function trimLocation(value) {
    try {
      const url = value instanceof URL
        ? value
        : new URL(value instanceof Location ? value.href : String(value));

      const host = url.hostname
        .split(".")
        .map((part) => trimMiddle(part, 10))
        .join(".");

      const path = url.pathname
        .split("/")
        .filter(Boolean)
        .map((part, index, parts) =>
          index === parts.length - 1 ? trimMiddle(part, 40) : trimMiddle(part, 8),
        )
        .join("/");

      return [host, path ? `/${path}` : "", url.search, url.hash].join("");
    } catch {
      return trimMiddle(value, 80);
    }
  }

  /***************************************************************************************************
   * Safe Import Loader
   **************************************************************************************************/

  const IMPORT_CACHE = new Map();

  async function importSafe(url, options = {}) {
    const { globalName, timeout = 15000, useEval = true, debug: importDebug = false } = options;
    if (IMPORT_CACHE.has(url)) return IMPORT_CACHE.get(url);
    const promise = _importSafe(url, { globalName, timeout, useEval, debug: importDebug });
    IMPORT_CACHE.set(url, promise);
    return promise;
  }

  async function _importSafe(url, options) {
    const { globalName, timeout, useEval, debug: importDebug } = options;
    const fail = (...args) => importDebug && console.warn("[importSafe]", ...args);

    try {
      const module = await promiseTimeout(import(/* @vite-ignore */ url), timeout);
      if (module) return normalizeModule(module, globalName);
    } catch (error) {
      fail("Native import() failed", error);
    }

    try {
      const response = await promiseTimeout(fetch(url), timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      const blob = new Blob([source], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      try {
        const module = await import(blobUrl);
        return normalizeModule(module, globalName);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      fail("Fetch + blob import failed", error);
    }

    if (useEval) {
      try {
        const response = await promiseTimeout(fetch(url), timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const source = await response.text();
        const exports = {};
        const module = { exports };
        const fn = new Function("exports", "module", source);
        fn(exports, module);
        return normalizeModule(module.exports || exports, globalName);
      } catch (error) {
        fail("Fetch + eval failed", error);
      }
    }

    try {
      await loadScript(url, timeout);
      if (globalName && globalThis[globalName]) return globalThis[globalName];
      return true;
    } catch (error) {
      fail("Script injection failed", error);
    }

    return null;
  }

  function normalizeModule(module, globalName) {
    if (!module) return null;
    if (globalName && globalThis[globalName]) return globalThis[globalName];
    if (module.default) return module.default;
    return module;
  }

  function promiseTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      }),
    ]);
  }

  function loadScript(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Script timeout: ${url}`));
      }, timeout);

      function cleanup() {
        window.clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
      }

      script.src = url;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => {
        cleanup();
        resolve();
      };
      script.onerror = (error) => {
        cleanup();
        reject(error);
      };
      document.head.appendChild(script);
    });
  }

  /***************************************************************************************************
   * MiniPrettier
   **************************************************************************************************/

  function formatJson(source) {
    try {
      return JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      return source;
    }
  }

  function formatBraceLanguage(source) {
    let output = "";
    let indent = 0;
    let quote = "";
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        output += char;
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        output += char;
        continue;
      }

      if (char === "{" || char === "[" || char === "(") {
        output += `${char}\n${"  ".repeat(indent + 1)}`;
        indent += 1;
        continue;
      }

      if (char === "}" || char === "]" || char === ")") {
        indent = Math.max(0, indent - 1);
        output = output.trimEnd();
        output += `\n${"  ".repeat(indent)}${char}`;
        continue;
      }

      if (char === ";" || char === ",") {
        output += `${char}\n${"  ".repeat(indent)}`;
        continue;
      }

      if (/\s/.test(char)) {
        if (!/\s/.test(output.at(-1) || "")) output += " ";
        continue;
      }

      output += char;
    }

    return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function formatCss(source) {
    return source
      .replace(/\s*{\s*/g, " {\n  ")
      .replace(/;\s*/g, ";\n  ")
      .replace(/\s*}\s*/g, "\n}\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function formatHtml(source) {
    const voidTags = new Set(["br", "hr", "img", "input", "meta", "link", "source", "area", "base"]);
    const tokens = source.replace(/>\s+</g, "><").split(/(<[^>]+>)/g).filter(Boolean);
    const lines = [];
    let indent = 0;

    for (const token of tokens) {
      const value = token.trim();
      if (!value) continue;
      const close = /^<\//.test(value);
      const open = /^<[a-zA-Z]/.test(value);
      const tag = value.match(/^<\/?([a-zA-Z0-9:-]+)/)?.[1]?.toLowerCase() || "";
      const selfClosing = /\/>$/.test(value) || voidTags.has(tag) || /^<!/.test(value);
      if (close) indent = Math.max(0, indent - 1);
      lines.push(`${"  ".repeat(indent)}${value}`);
      if (open && !close && !selfClosing) indent += 1;
    }

    return lines.join("\n");
  }

  function miniPrettier(source, language) {
    if (language === "json") return formatJson(source);
    if (language === "css") return formatCss(source);
    if (language === "html") return formatHtml(source);
    return formatBraceLanguage(source);
  }

  /***************************************************************************************************
   * Highlighting
   **************************************************************************************************/

  function miniHljs(line, language) {
    const source = String(line);

    if (language === "html") {
      return escapeHtml(source)
        .replace(/(&lt;!--.*?--&gt;)/g, '<span class="tok-comment">$1</span>')
        .replace(/(&lt;\/?[\w:-]+)/g, '<span class="tok-tag">$1</span>')
        .replace(/([\w:-]+)(=)/g, '<span class="tok-attr">$1</span>$2')
        .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="tok-string">$1</span>');
    }

    if (language === "css") {
      return escapeHtml(source)
        .replace(/(\/\*.*?\*\/)/g, '<span class="tok-comment">$1</span>')
        .replace(/^(\s*[.#]?[\w-]+)(?=\s*\{)/g, '<span class="tok-selector">$1</span>')
        .replace(/([\w-]+)(\s*:)/g, '<span class="tok-attr">$1</span>$2')
        .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="tok-string">$1</span>')
        .replace(/\b(\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|dvh|dvw|s|ms)?)\b/g, '<span class="tok-number">$1</span>');
    }

    const escaped = escapeHtml(source);
    const parts = escaped.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$)/g);

    return parts.map((part) => {
      if (!part) return "";
      if (/^\/\//.test(part)) return `<span class="tok-comment">${part}</span>`;
      if (/^["'`]/.test(part)) return `<span class="tok-string">${part}</span>`;
      return part
        .replace(/\b(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|from|function|if|import|in|instanceof|interface|let|new|null|return|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield)\b/g, '<span class="tok-keyword">$1</span>')
        .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>')
        .replace(/\b([A-Z][A-Za-z0-9_$]*)\b/g, '<span class="tok-type">$1</span>')
        .replace(/\b([a-zA-Z_$][\w$]*)(?=\()/g, '<span class="tok-title">$1</span>');
    }).join("");
  }

  /**
   * Splits complete Highlight.js output while keeping multiline span state.
   * Highlight.js emits span-only markup, so reopening the active span stack on
   * each new line gives every virtual line valid, independent HTML.
   */
  function splitHighlightedHtmlIntoLines(html, expectedLineCount) {
    const lines = [""];
    const openSpans = [];
    const tokens = String(html).split(/(<span\b[^>]*>|<\/span>|\r?\n)/gi);

    for (const token of tokens) {
      if (!token) continue;
      if (token === "\n" || token === "\r\n") {
        if (openSpans.length) lines[lines.length - 1] += "</span>".repeat(openSpans.length);
        lines.push(openSpans.join(""));
        continue;
      }
      if (/^<span\b/i.test(token)) {
        openSpans.push(token);
        lines[lines.length - 1] += token;
        continue;
      }
      if (token.toLowerCase() === "</span>") {
        lines[lines.length - 1] += token;
        openSpans.pop();
        continue;
      }
      lines[lines.length - 1] += token;
    }

    while (lines.length < expectedLineCount) lines.push("");
    if (lines.length > expectedLineCount) lines.length = expectedLineCount;
    return lines;
  }

  function rebuildHighlightedLines() {
    state.highlightedCache.clear();

    try {
      if (state.hljs?.highlight) {
        const language = state.language === "html" ? "xml" : state.language;
        const highlighted = state.hljs.highlight(state.currentSource, {
          language,
          ignoreIllegals: true,
        }).value;
        state.highlightedLines = splitHighlightedHtmlIntoLines(highlighted, state.lines.length);
        return;
      }
    } catch (error) {
      debug("Full-source highlighting failed", error);
    }

    state.highlightedLines = state.lines.map((line) => miniHljs(line, state.language));
  }

  function highlightLine(line, index) {
    const precomputed = state.highlightedLines[index];
    if (precomputed !== undefined) return precomputed || "&nbsp;";

    const key = `${state.mode}:${state.language}:${state.highlighterSource}:${index}:${line}`;
    const cached = state.highlightedCache.get(key);
    if (cached) return cached;

    let output;
    try {
      output = state.hljs?.highlight
        ? state.hljs.highlight(line, {
            language: state.language === "html" ? "xml" : state.language,
            ignoreIllegals: true,
          }).value
        : miniHljs(line, state.language);
    } catch {
      output = miniHljs(line, state.language);
    }

    const finalOutput = output || "&nbsp;";
    state.highlightedCache.set(key, finalOutput);
    return finalOutput;
  }

  function getSearchRangesForLine(lineIndex) {
    if (!state.searchQuery) return [];
    return state.searchMatchesByLine.get(lineIndex) || [];
  }

  /** Adds search marks without discarding Highlight.js spans. */
  function applySearchRangesToHighlightedHtml(highlightedHtml, ranges) {
    if (!ranges.length) return highlightedHtml || "&nbsp;";

    const template = document.createElement("template");
    template.innerHTML = highlightedHtml === "&nbsp;" ? "" : highlightedHtml;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    let absoluteOffset = 0;

    for (const textNode of textNodes) {
      const value = textNode.nodeValue || "";
      const nodeStart = absoluteOffset;
      const nodeEnd = nodeStart + value.length;
      absoluteOffset = nodeEnd;

      const overlaps = ranges.filter((range) => range.ch < nodeEnd && range.endCh > nodeStart);
      if (!overlaps.length) continue;

      const fragment = document.createDocumentFragment();
      let cursor = 0;

      for (const range of overlaps) {
        const start = Math.max(0, range.ch - nodeStart);
        const end = Math.min(value.length, range.endCh - nodeStart);
        if (start > cursor) fragment.append(document.createTextNode(value.slice(cursor, start)));
        if (end > start) {
          const mark = document.createElement("mark");
          mark.className = range.index === state.searchIndex
            ? "rod-search-hit rod-search-hit-current"
            : "rod-search-hit";
          mark.dataset.searchIndex = String(range.index);
          mark.textContent = value.slice(start, end);
          fragment.append(mark);
        }
        cursor = Math.max(cursor, end);
      }

      if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
      textNode.replaceWith(fragment);
    }

    return template.innerHTML || "&nbsp;";
  }

  function renderCodeLine(line, lineIndex) {
    const highlighted = highlightLine(line, lineIndex);
    if (!state.searchQuery) return highlighted;
    return applySearchRangesToHighlightedHtml(highlighted, getSearchRangesForLine(lineIndex));
  }

  /***************************************************************************************************
   * Boot
   **************************************************************************************************/

  ensureViewportMeta();
  await waitForBody();

  const rawPre = document.querySelector("body > pre");
  if (!rawPre || document.body.firstElementChild !== rawPre) return;

  const loading = document.createElement("div");
  loading.innerHTML = `
    <style>
      html, body { margin: 0 !important; background: #070b14 !important; }
      .rod-loading { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: #070b14; color: #dce6ff; font-family: ui-sans-serif, system-ui, sans-serif; }
      .rod-loading-card { display: grid; gap: 12px; justify-items: center; }
      .rod-spinner { width: 38px; height: 38px; border: 3px solid rgb(255 255 255 / .12); border-top-color: #82aaff; border-radius: 999px; animation: rod-spin .8s linear infinite; }
      @keyframes rod-spin { to { transform: rotate(360deg); } }
      .rod-loading-title { font-size: 13px; font-weight: 800; }
    </style>
    <div class="rod-loading"><div class="rod-loading-card"><div class="rod-spinner"></div><div class="rod-loading-title">Loading HLJS first...</div></div></div>
  `;
  document.documentElement.appendChild(loading);

  state.rawSource = rawPre.textContent || "";
  state.currentSource = state.rawSource;
  const detected = detectLanguage(state.rawSource);
  state.language = detected.language;
  state.parser = detected.parser;
  rawPre.remove();

  const [hljsMod, jsLang, tsLang, jsonLang, cssLang, xmlLang] = await Promise.all([
    importSafe(CDN.hljs),
    importSafe(CDN.hljsJs),
    importSafe(CDN.hljsTs),
    importSafe(CDN.hljsJson),
    importSafe(CDN.hljsCss),
    importSafe(CDN.hljsXml),
  ]);

  const hljs = hljsMod?.default || hljsMod;
  if (hljs?.registerLanguage) {
    for (const [name, mod] of [
      ["javascript", jsLang],
      ["typescript", tsLang],
      ["json", jsonLang],
      ["css", cssLang],
      ["xml", xmlLang],
    ]) {
      const factory = mod?.default || mod;
      if (factory) hljs.registerLanguage(name, factory);
    }
    state.hljs = hljs;
    state.highlighterSource = "hljs";
  }

  mountViewer();

  idle(async () => {
    const [prettierMod, babel, estree, html, css] = await Promise.all([
      importSafe(CDN.prettier),
      importSafe(CDN.prettierBabel),
      importSafe(CDN.prettierEstree),
      importSafe(CDN.prettierHtml),
      importSafe(CDN.prettierCss),
    ]);

    const prettier = prettierMod?.default || prettierMod;
    if (prettier?.format) {
      state.prettier = prettier;
      state.prettierSource = "prettier";
      state.prettierPlugins = [
        babel?.default || babel,
        estree?.default || estree,
        html?.default || html,
        css?.default || css,
      ].filter(Boolean);
    }

    if (shouldAutoPretty()) {
      document.querySelector(`#${APP_ID} [data-action="pretty"]`)?.click();
    }
  });

  /***************************************************************************************************
   * Viewer
   **************************************************************************************************/

  function mountViewer() {
    const root = document.createElement("main");
    root.id = APP_ID;
    root.innerHTML = `
      <style>
        #${APP_ID} {
          position: fixed; inset: 0; z-index: 999; display: grid;
          grid-template-rows: auto auto minmax(0, 1fr); overflow: hidden;
          background: radial-gradient(circle at top left, rgb(130 170 255 / .10), transparent 36%), #070b14;
          color: #dce6ff; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 100vw; user-select: text; -webkit-user-select: text;
        }
        .rod-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: calc(env(safe-area-inset-top) + 9px) 10px 9px; border-bottom: 1px solid rgb(124 140 180 / .16); background: rgb(7 11 20 / .94); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        .rod-title { min-width: 0; }
        .rod-title strong { display: -webkit-box; overflow: hidden; color: #eef4ff; font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .rod-title span { display: block; overflow: hidden; color: rgb(220 230 255 / .55); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .rod-actions { display: flex; gap: 6px; align-items: center; }
        .rod-btn, .rod-search-btn { appearance: none; border: 1px solid rgb(124 140 180 / .26); border-radius: 999px; background: rgb(255 255 255 / .07); color: #eef4ff; font: inherit; font-weight: 800; user-select: none; -webkit-user-select: none; }
        .rod-btn { min-width: 24px; padding: 7px 3.5px; font-size: 12px; background: linear-gradient(180deg, rgb(255 255 255 / .10), rgb(255 255 255 / .04)); }
        .rod-btn-primary { border-color: rgb(130 170 255 / .48); background: linear-gradient(135deg, rgb(130 170 255 / .22), rgb(199 146 234 / .16)), rgb(255 255 255 / .05); }
        .rod-btn:active, .rod-search-btn:active { transform: scale(.95); }
        .rod-searchbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto auto; gap: 6px; align-items: center; padding: 7px 10px; border-bottom: 1px solid rgb(124 140 180 / .14); background: rgb(7 11 20 / .96); }
        .rod-searchbar[hidden] { display: none !important; }
        .rod-search-input { min-width: 0; height: 32px; border: 1px solid rgb(124 140 180 / .28); border-radius: 999px; padding: 0 12px; outline: none; background: rgb(255 255 255 / .07); color: #eef4ff; font: inherit; font-size: 13px; font-weight: 720; }
        .rod-search-input::placeholder { color: rgb(220 230 255 / .42); }
        .rod-search-count { min-width: 48px; color: rgb(220 230 255 / .62); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; font-weight: 850; text-align: center; }
        .rod-search-btn { width: 32px; height: 32px; font-size: 13px; }
        .rod-scroll { position: relative; min-height: 0; height: 100%; overflow: auto; overscroll-behavior: contain; overflow-anchor: none; background: #070b14; -webkit-overflow-scrolling: touch; }
        .rod-virtual-spacer { height: 0; width: 1px; min-width: 1px; pointer-events: none; }
        .rod-blocks { position: relative; width: 100%; }
        .rod-block { position: relative; width: 100%; }
        .rod-line { display: grid; grid-template-columns: 46px minmax(0, 1fr); align-items: start; padding-inline: 6px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.62; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
        .rod-line-number { padding-right: 8px; color: rgb(220 230 255 / .24); text-align: right; user-select: none !important; -webkit-user-select: none !important; pointer-events: none; }
        .rod-line-code { min-width: 0; color: rgb(220 230 255 / .92); user-select: text; -webkit-user-select: text; }
        .rod-search-hit { display: inline; border-radius: 3px; padding: 0 1px; background: rgb(255 203 107 / .34); color: #fff7d6; box-shadow: 0 0 0 1px rgb(255 203 107 / .22); }
        .rod-search-hit-current { background: rgb(255 120 148 / .72); color: #fff; box-shadow: 0 0 0 1px rgb(255 120 148 / .82), 0 0 0 3px rgb(255 120 148 / .18); }
        .hljs-comment, .tok-comment { color: #63718f; font-style: italic; }
        .hljs-keyword, .hljs-selector-tag, .tok-keyword, .tok-tag { color: #c792ea; }
        .hljs-string, .hljs-regexp, .tok-string { color: #c3e88d; }
        .hljs-number, .hljs-literal, .tok-number { color: #ffcb6b; }
        .hljs-title, .hljs-function, .tok-title { color: #82aaff; }
        .hljs-attr, .hljs-attribute, .hljs-name, .tok-attr { color: #89ddff; }
        .hljs-built_in, .hljs-type, .tok-type { color: #ffcb6b; }
        .hljs-variable, .hljs-template-variable { color: #f78c6c; }
        .tok-selector { color: #f07178; }
      </style>

      <header class="rod-toolbar">
        <div class="rod-title"><strong>${trimLocation(location.href)}</strong><span data-meta></span></div>
        <div class="rod-actions">
          <button class="rod-btn" data-action="search">S</button>
          <button class="rod-btn" data-action="raw">R</button>
          <button class="rod-btn" data-action="pretty">P</button>
          <button class="rod-btn rod-btn-primary" data-action="copy">C</button>
        </div>
      </header>

      <section class="rod-searchbar" hidden>
        <input class="rod-search-input" type="search" placeholder="Find in source" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <span class="rod-search-count">0/0</span>
        <button class="rod-search-btn" data-action="search-prev" title="Previous">↑</button>
        <button class="rod-search-btn" data-action="search-next" title="Next">↓</button>
        <button class="rod-search-btn" data-action="search-close" title="Close">×</button>
      </section>

      <div class="rod-scroll">
        <div class="rod-virtual-spacer rod-top-spacer"></div>
        <div class="rod-blocks"></div>
        <div class="rod-virtual-spacer rod-bottom-spacer"></div>
      </div>
    `;

    document.body.innerHTML = "";
    document.body.appendChild(root);

    const scroll = root.querySelector(".rod-scroll");
    const topSpacer = root.querySelector(".rod-top-spacer");
    const bottomSpacer = root.querySelector(".rod-bottom-spacer");
    const blocksEl = root.querySelector(".rod-blocks");
    const meta = root.querySelector("[data-meta]");
    const searchButton = root.querySelector('[data-action="search"]');
    const searchbar = root.querySelector(".rod-searchbar");
    const searchInput = root.querySelector(".rod-search-input");
    const searchCount = root.querySelector(".rod-search-count");
    const searchPrevButton = root.querySelector('[data-action="search-prev"]');
    const searchNextButton = root.querySelector('[data-action="search-next"]');
    const searchCloseButton = root.querySelector('[data-action="search-close"]');
    const rawButton = root.querySelector('[data-action="raw"]');
    const prettyButton = root.querySelector('[data-action="pretty"]');
    const copyButton = root.querySelector('[data-action="copy"]');

    function updateMeta() {
      meta.textContent = `${state.language} · ${state.lines.length} lines · ${formatBytes(state.currentSource.length)} · ${state.mode} · highlight: ${state.highlighterSource} · formatter: ${state.prettierSource}`;
    }

    function updateSearchCount() {
      if (!state.searchQuery || !state.searchMatches.length) {
        searchCount.textContent = "0/0";
        return;
      }
      const visibleIndex = Math.max(0, state.searchIndex) + 1;
      const capped = state.searchMatches.length >= MAX_SEARCH_MATCHES ? "+" : "";
      searchCount.textContent = `${visibleIndex}/${state.searchMatches.length}${capped}`;
    }

    function rebuildBlockOffsets() {
      state.blockOffsets = new Array(state.blocks.length);
      let offset = 0;
      for (let index = 0; index < state.blocks.length; index += 1) {
        state.blockOffsets[index] = offset;
        offset += state.blockHeights[index] || DEFAULT_BLOCK_HEIGHT;
      }
      state.totalHeight = Math.max(1, offset);
    }

    function findBlockIndex(scrollTop) {
      if (!state.blockOffsets.length) return 0;
      let low = 0;
      let high = state.blockOffsets.length - 1;
      let answer = 0;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (state.blockOffsets[mid] <= scrollTop) {
          answer = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return answer;
    }

    function clampScrollTop(value) {
      const maxScrollTop = Math.max(0, state.totalHeight - scroll.clientHeight);
      return Math.max(0, Math.min(value, maxScrollTop));
    }

    /** Updates only spacer geometry. It never mutates scrollTop. */
    function updateVirtualSpacers(first, last) {
      const top = first > 0 ? state.blockOffsets[first] || 0 : 0;
      const renderedBottom = last >= state.blocks.length
        ? state.totalHeight
        : state.blockOffsets[last] || state.totalHeight;
      const bottom = Math.max(0, state.totalHeight - renderedBottom);
      topSpacer.style.height = `${top}px`;
      bottomSpacer.style.height = `${bottom}px`;
    }

    function rebuildLines() {
      state.lines = state.currentSource.split("\n");
      state.blocks = [];
      for (let index = 0; index < state.lines.length; index += BLOCK_SIZE) {
        state.blocks.push(state.lines.slice(index, index + BLOCK_SIZE));
      }
      state.blockHeights = state.blocks.map((block) =>
        Math.max(DEFAULT_LINE_HEIGHT, block.length * DEFAULT_LINE_HEIGHT),
      );
      state.visibleStartBlock = -1;
      state.visibleEndBlock = -1;
      state.renderVersion += 1;
      rebuildHighlightedLines();
      rebuildBlockOffsets();
      updateMeta();
      rebuildSearch(false);

      requestAnimationFrame(() => {
        if (state.searchIndex < 0) scroll.scrollTop = 0;
        forceViewportRender();
      });
    }

    /**
     * Measures natural block heights without moving the current DOM or scroll.
     * The updated values are used only for future virtual-range calculations.
     */
    function measureRenderedBlocks(renderVersion) {
      if (renderVersion !== state.renderVersion) return;
      const renderedBlocks = blocksEl.querySelectorAll("[data-block-index]");
      let changed = false;

      for (const block of renderedBlocks) {
        const index = Number(block.getAttribute("data-block-index"));
        const measured = Math.ceil(block.getBoundingClientRect().height);
        if (measured > 0 && Math.abs((state.blockHeights[index] || 0) - measured) > 1) {
          state.blockHeights[index] = measured;
          changed = true;
        }
      }

      if (!changed) return;

      rebuildBlockOffsets();

      // The currently rendered range stays in normal document flow. Only the
      // bottom spacer changes here, so the user's visual position cannot jump.
      updateVirtualSpacers(state.visibleStartBlock, state.visibleEndBlock);
    }

    function forceViewportRender() {
      state.visibleStartBlock = -1;
      state.visibleEndBlock = -1;
      queueRender();
    }

    function renderViewport() {
      state.renderQueued = false;
      if (!state.blocks.length) {
        topSpacer.style.height = "0px";
        bottomSpacer.style.height = "0px";
        blocksEl.innerHTML = "";
        return;
      }

      const scrollTop = scroll.scrollTop;
      const viewportHeight = scroll.clientHeight || window.innerHeight;
      const firstVisible = findBlockIndex(scrollTop);
      const lastVisible = findBlockIndex(scrollTop + viewportHeight);
      const first = Math.max(0, firstVisible - BLOCK_OVERSCAN);
      const last = Math.min(state.blocks.length, lastVisible + BLOCK_OVERSCAN + 1);

      if (first === state.visibleStartBlock && last === state.visibleEndBlock) return;

      state.visibleStartBlock = first;
      state.visibleEndBlock = last;
      state.renderVersion += 1;
      const renderVersion = state.renderVersion;

      const html = [];
      for (let blockIndex = first; blockIndex < last; blockIndex += 1) {
        const blockLines = state.blocks[blockIndex];
        const lineStart = blockIndex * BLOCK_SIZE;
        html.push(`<div class="rod-block" data-block-index="${blockIndex}">`);
        for (let localIndex = 0; localIndex < blockLines.length; localIndex += 1) {
          const lineIndex = lineStart + localIndex;
          html.push(
            `<div class="rod-line" data-line-index="${lineIndex}">` +
              `<div class="rod-line-number" aria-hidden="true">${lineIndex + 1}</div>` +
              `<div class="rod-line-code">${renderCodeLine(blockLines[localIndex], lineIndex)}</div>` +
            `</div>`,
          );
        }
        html.push("</div>");
      }

      updateVirtualSpacers(first, last);
      blocksEl.innerHTML = html.join("");
      requestAnimationFrame(() => measureRenderedBlocks(renderVersion));
    }

    function queueRender() {
      if (state.renderQueued) return;
      state.renderQueued = true;
      requestAnimationFrame(renderViewport);
    }

    function rebuildSearch(keepIndex = true) {
      const query = state.searchQuery;
      const previousIndex = state.searchIndex;
      state.searchVersion += 1;
      state.searchMatches = [];
      state.searchMatchesByLine = new Map();

      if (!query) {
        state.searchJumpToken += 1;
        state.searchIndex = -1;
        updateSearchCount();
        forceViewportRender();
        return;
      }

      const needle = query.toLowerCase();

      for (let line = 0; line < state.lines.length; line += 1) {
        const haystack = String(state.lines[line] || "").toLowerCase();
        let from = 0;

        while (state.searchMatches.length < MAX_SEARCH_MATCHES) {
          const index = haystack.indexOf(needle, from);
          if (index < 0) break;
          const match = {
            index: state.searchMatches.length,
            line,
            ch: index,
            endCh: index + query.length,
          };
          state.searchMatches.push(match);
          const lineMatches = state.searchMatchesByLine.get(line) || [];
          lineMatches.push(match);
          state.searchMatchesByLine.set(line, lineMatches);
          from = Math.max(index + query.length, index + 1);
        }

        if (state.searchMatches.length >= MAX_SEARCH_MATCHES) break;
      }

      if (!state.searchMatches.length) state.searchIndex = -1;
      else if (keepIndex && previousIndex >= 0) {
        state.searchIndex = Math.min(previousIndex, state.searchMatches.length - 1);
      } else {
        state.searchIndex = 0;
      }

      updateSearchCount();
      forceViewportRender();
      if (state.searchIndex >= 0) jumpToSearchMatch(state.searchIndex, false);
    }

    const debouncedSearch = debounce(() => {
      state.searchQuery = searchInput.value.trim();
      rebuildSearch(false);
    }, SEARCH_DEBOUNCE_MS);

    function openSearch() {
      searchbar.hidden = false;
      searchInput.focus();
      searchInput.select();
      updateSearchCount();
    }

    function closeSearch() {
      state.searchJumpToken += 1;
      searchbar.hidden = true;
      searchInput.value = "";
      state.searchQuery = "";
      state.searchMatches = [];
      state.searchMatchesByLine = new Map();
      state.searchIndex = -1;
      updateSearchCount();
      forceViewportRender();
    }

    function estimateSearchMatchTop(match) {
      const blockIndex = Math.floor(match.line / BLOCK_SIZE);
      const blockTop = state.blockOffsets[blockIndex] || 0;
      const blockHeight = state.blockHeights[blockIndex] || DEFAULT_BLOCK_HEIGHT;
      const block = state.blocks[blockIndex] || [];
      const localLineIndex = match.line - blockIndex * BLOCK_SIZE;
      return blockTop + blockHeight * ((localLineIndex + 0.5) / Math.max(1, block.length));
    }

    function getSearchTargetBounds(searchIndex) {
      const targets = blocksEl.querySelectorAll(`[data-search-index="${searchIndex}"]`);
      if (!targets.length) return null;
      let top = Infinity;
      let bottom = -Infinity;
      for (const target of targets) {
        const rect = target.getBoundingClientRect();
        top = Math.min(top, rect.top);
        bottom = Math.max(bottom, rect.bottom);
      }
      return Number.isFinite(top) && Number.isFinite(bottom)
        ? { top, bottom, height: Math.max(0, bottom - top) }
        : null;
    }

    /**
     * Centers the actual rendered mark. No virtual estimate is used for the
     * final position, so wrapped lines are handled correctly.
     */
    function settleSearchMatch(searchIndex, jumpToken, pass = 0) {
      if (jumpToken !== state.searchJumpToken || searchIndex !== state.searchIndex) return;

      requestAnimationFrame(() => {
        if (jumpToken !== state.searchJumpToken || searchIndex !== state.searchIndex) return;

        forceViewportRender();

        requestAnimationFrame(() => {
          if (jumpToken !== state.searchJumpToken || searchIndex !== state.searchIndex) return;

          const bounds = getSearchTargetBounds(searchIndex);
          if (!bounds) {
            if (pass >= SEARCH_SETTLE_MAX_PASSES) return;
            const match = state.searchMatches[searchIndex];
            if (!match) return;
            scroll.scrollTop = clampScrollTop(
              estimateSearchMatchTop(match) - scroll.clientHeight / 2,
            );
            settleSearchMatch(searchIndex, jumpToken, pass + 1);
            return;
          }

          const scrollRect = scroll.getBoundingClientRect();
          const targetCenter = bounds.top - scrollRect.top + bounds.height / 2;
          const viewportCenter = scroll.clientHeight / 2;
          const delta = targetCenter - viewportCenter;

          if (Math.abs(delta) > 1) {
            scroll.scrollTop = clampScrollTop(scroll.scrollTop + delta);
          }

          if (pass < 2 && Math.abs(delta) > 1) {
            settleSearchMatch(searchIndex, jumpToken, pass + 1);
          }
        });
      });
    }

    function jumpToSearchMatch(index, wrap = true) {
      if (!state.searchMatches.length) return;
      const total = state.searchMatches.length;
      const nextIndex = wrap
        ? (index + total) % total
        : Math.max(0, Math.min(index, total - 1));
      const match = state.searchMatches[nextIndex];
      if (!match) return;

      state.searchIndex = nextIndex;
      updateSearchCount();
      const jumpToken = ++state.searchJumpToken;

      scroll.scrollTop = clampScrollTop(
        estimateSearchMatchTop(match) - scroll.clientHeight / 2,
      );
      forceViewportRender();
      settleSearchMatch(nextIndex, jumpToken);
    }

    function nextSearchMatch() {
      if (!state.searchQuery) return openSearch();
      if (state.searchMatches.length) jumpToSearchMatch(state.searchIndex + 1);
    }

    function previousSearchMatch() {
      if (!state.searchQuery) return openSearch();
      if (state.searchMatches.length) jumpToSearchMatch(state.searchIndex - 1);
    }

    async function prettyPrint(manual) {
      prettyButton.textContent = "Wait";
      try {
        if (state.prettier?.format) {
          state.currentSource = String(
            await withTimeout(
              state.prettier.format(state.rawSource, {
                parser: state.parser,
                plugins: state.prettierPlugins,
                semi: true,
                tabWidth: 2,
                printWidth: 88,
                trailingComma: "all",
              }),
              manual ? PRETTIER_TIMEOUT_MS * 2 : PRETTIER_TIMEOUT_MS,
            ),
          );
        } else {
          state.currentSource = miniPrettier(state.rawSource, state.language);
          state.prettierSource = "mini";
        }
      } catch {
        state.currentSource = miniPrettier(state.rawSource, state.language);
        state.prettierSource = "mini";
      }

      state.mode = "pretty";
      prettyButton.textContent = "Pretty";
      rebuildLines();
    }

    searchButton.addEventListener("click", openSearch);
    searchInput.addEventListener("input", debouncedSearch);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) previousSearchMatch();
        else nextSearchMatch();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
    });
    searchPrevButton.addEventListener("click", previousSearchMatch);
    searchNextButton.addEventListener("click", nextSearchMatch);
    searchCloseButton.addEventListener("click", closeSearch);

    rawButton.addEventListener("click", () => {
      state.currentSource = state.rawSource;
      state.mode = "raw";
      rebuildLines();
    });

    prettyButton.addEventListener("click", () => void prettyPrint(true));

    copyButton.addEventListener("click", async () => {
      const ok = await copyText(state.currentSource);
      copyButton.textContent = ok ? "Copied" : "Failed";
      window.setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 900);
    });

    document.addEventListener("keydown", (event) => {
      const isFind = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f";
      if (isFind) {
        event.preventDefault();
        openSearch();
      }
    });

    scroll.addEventListener("scroll", queueRender, { passive: true });

    window.addEventListener("resize", () => {
      // Width changes alter soft-wrap height. Reset measurements because every
      // block can now have a different natural height.
      state.blockHeights = state.blocks.map((block) =>
        Math.max(DEFAULT_LINE_HEIGHT, block.length * DEFAULT_LINE_HEIGHT),
      );
      rebuildBlockOffsets();
      forceViewportRender();
    }, { passive: true });

    rebuildLines();
    loading.remove();
    lockZoom();

    debug("Viewer mounted", {
      language: state.language,
      parser: state.parser,
      highlighter: state.highlighterSource,
    });
  }
})();
