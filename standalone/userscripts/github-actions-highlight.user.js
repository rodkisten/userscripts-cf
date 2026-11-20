// ==UserScript==
// @name         💜 Rod GitHub Actions Run Highlighter
// @namespace    https://rodkisten.github.io/userscripts
// @version      1.1.0
// @description  Syntax highlighting for GitHub Actions run blocks, expressions and shell scripts on GitHub file views.
// @match        https://github.com/*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/lib/common.min.js
// @grant        GM_addStyle
// @noframes
// ==/UserScript==

(() => {
  "use strict";
  const GLOBAL = "__ROD_ACTIONS_HIGHLIGHT__";
  if (window[GLOBAL]) return;
  window[GLOBAL] = true;

  const STYLE = `    
    .rod-actions-code span[class*=hljs-]{color:inherit}\n    .rod-actions-code .hljs-keyword{color:#ff7b72!important}\n    .rod-actions-code .hljs-built_in{color:#ffa657!important}\n    .rod-actions-code .hljs-variable{color:#79c0ff!important}\n    .rod-actions-code .hljs-string{color:#a5d6ff!important}\n    .rod-actions-code .hljs-comment{color:#8b949e!important}\n    .rod-actions-code .hljs-operator{color:#ff7b72!important}\n    .rod-actions-code .hljs-meta{color:#d2a8ff!important}\n    .rod-actions-code .hljs-number{color:#79c0ff!important}\n    .rod-actions-code .hljs-title{color:#d2a8ff!important}\n    .rod-actions-code .hljs-params{color:#e6edf3!important}\n    .rod-actions-code .hljs-subst{color:#79c0ff!important}\n    .rod-actions-code .rod-actions-expression{color:#d2a8ff!important}\n    
    .rod-actions-code .hljs-keyword,.rod-actions-code .hljs-selector-tag,.rod-actions-code .hljs-built_in{color:var(--color-prettylights-syntax-keyword,#cf222e)!important}
    .rod-actions-code .hljs-string,.rod-actions-code .hljs-attr,.rod-actions-code .hljs-template-variable{color:var(--color-prettylights-syntax-string,#0a3069)!important}
    .rod-actions-code .hljs-variable,.rod-actions-code .hljs-title,.rod-actions-code .hljs-function{color:var(--color-prettylights-syntax-entity,#8250df)!important}
    .rod-actions-code .hljs-number,.rod-actions-code .hljs-literal{color:var(--color-prettylights-syntax-constant,#0550ae)!important}
    .rod-actions-code .hljs-comment{color:var(--color-prettylights-syntax-comment,#6e7781)!important}
    .rod-actions-code .rod-actions-expression{color:var(--color-prettylights-syntax-entity,#8250df)!important;font-weight:600}
    .rod-actions-code{background:transparent!important}
  `;
  GM_addStyle(STYLE);

  const SELECTORS = [
    ".react-code-line-contents",
    '[data-testid="code-line"] .react-code-text',
    ".blob-code-inner",
    '[data-testid="code-view"] [data-line-number] .react-code-text',
  ];
  const RUN = /^(\s*)(?:-\s+)?run\s*:\s*([|>])([+-]?)(?:\s*#.*)?$/;
  const SHELL = /^\s*shell\s*:\s*([^\s#]+)/;
  const EXT = /\.(?:yml|yaml)$/i;
  const ESC = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const leading = (s) => (s.match(/^\s*/)?.[0] || "").replace(/\t/g, "        ").length;
  const detect = (shell, body) => {
    const s = (shell || "").toLowerCase();
    if (/pwsh|powershell/.test(s)) return "powershell";
    if (/python/.test(s)) return "python";
    if (/node|javascript/.test(s)) return "javascript";
    if (/ruby/.test(s)) return "ruby";
    if (/bash|sh|zsh/.test(s)) return "bash";
    const first = body.find((x) => x.trim()) || "";
    if (/^\s*#!.*python/.test(first)) return "python";
    if (/^\s*#!.*(?:bash|sh|zsh)/.test(first)) return "bash";
    return "bash";
  };
  // Preserve expressions through the language parser without injecting untrusted HTML.
  const paint = (source, language) => {
    const expressions = [];
    const masked = source.replace(/\$\{\{[\s\S]*?\}\}/g, (match) => {
      const index = expressions.push(match) - 1;
      return "RODACTIONSEXPRTOKEN" + index + "END";
    });
    let html;
    try {
      html = window.hljs?.getLanguage(language)
        ? window.hljs.highlight(masked, { language, ignoreIllegals: true }).value
        : ESC(masked);
    } catch {
      html = ESC(masked);
    }
    // Tokens can be wrapped in spans by Highlight.js; restore after flattening only
    // when no token is split by markup. Otherwise retain escaped placeholder safely.
    html = html.replace(/RODACTIONSEXPRTOKEN(\d+)END/g, (_, n) =>
      expressions[Number(n)] === undefined
        ? ""
        : '<span class="rod-actions-expression">' + ESC(expressions[Number(n)]) + "</span>",
    );
    return html;
  };
  // Split HTML by actual newline while balancing all open span tags.
  const splitHighlighted = (html) => {
    const stack = [];
    const lines = [""];
    const tokens = html.match(/<\/?span\b[^>]*>|\n|[^<\n]+|<(?!\/?span\b)[^>]*>/g) || [];
    for (const token of tokens) {
      const last = lines.length - 1;
      if (token === "\n") {
        lines[last] += "</span>".repeat(stack.length);
        lines.push(stack.join(""));
      } else if (/^<span\b/.test(token)) {
        stack.push(token);
        lines[last] += token;
      } else if (token === "</span>") {
        if (stack.length) stack.pop();
        lines[last] += token;
      } else {
        lines[last] += token;
      }
    }
    return lines;
  };
  const parse = (lines) => {
    const blocks = [];
    let shell = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const shellMatch = line.match(SHELL);
      if (shellMatch) shell = shellMatch[1];
      const match = line.match(RUN);
      if (!match) continue;
      const base = leading(line);
      let end = i + 1;
      while (end < lines.length && (!lines[end].trim() || leading(lines[end]) > base)) end++;
      const content = lines.slice(i + 1, end);
      if (content.some((x) => x.trim())) blocks.push({ start: i + 1, end, language: detect(shell, content) });
      i = end - 1;
    }
    return blocks;
  };
  const isWorkflow = () =>
    /\/\.github\/workflows\/[^/?#]+\.ya?ml(?:$|[?#/])/.test(location.pathname) ||
    (/\.ya?ml$/.test(location.pathname) && document.body.textContent?.includes("run:"));
  let busy = false;
  let lastUrl = '';
  const debug = (...args) => console.debug('[Rod Actions Highlight]',...args);
  function update() {
    if (busy || !isWorkflow()) return;
    busy = true;
    try {
      const nodes =
        SELECTORS.map((selector) => [...document.querySelectorAll(selector)]).find((x) => x.length > 0) || [];
      if (!nodes.length) return;
      const lines = nodes.map((node) => node.textContent || "");
      const signature = location.pathname + ":" + lines.length + ":" + lines.join("\n").length;
      if (signature === lastUrl && nodes.every((node) => node.dataset.rodActionsProcessed === "1")) return;
      nodes.forEach((node) => {
        if (node.dataset.rodActionsProcessed === "1" && node.dataset.rodActionsOriginal !== undefined) {
          node.innerHTML = node.dataset.rodActionsOriginal;
        }
        delete node.dataset.rodActionsProcessed;
        node.classList.remove("rod-actions-code");
      });
      const originalLines = nodes.map((node) => node.textContent || "");
      for (const block of parse(originalLines)) {
        const source = originalLines.slice(block.start, block.end).join("\n");
        const highlighted = splitHighlighted(paint(source, block.language));
        if (highlighted.length !== block.end - block.start) continue;
        highlighted.forEach((html, index) => {
          const node = nodes[block.start + index];
          node.dataset.rodActionsOriginal = node.innerHTML;
          node.innerHTML = html || " ";
          node.classList.add("rod-actions-code");
        });
      }
      nodes.forEach((node) => (node.dataset.rodActionsProcessed = "1"));
      lastUrl = signature;
      debug("processed", {
        lines: nodes.length,
        blocks: parse(originalLines).length,
        hljs: !!window.hljs,
        path: location.pathname,
      });
    } finally {
      busy = false;
    }
  }
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  new MutationObserver((mutations) => {
    if (busy) return;
    if (mutations.some((m) => m.addedNodes.length || m.removedNodes.length)) schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("turbo:load", schedule);
  document.addEventListener("pjax:end", schedule);
  window.addEventListener("popstate", schedule);
  schedule();
})();
