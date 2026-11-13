// ==UserScript==
// @name         Mobile Editor FAB · Monaco Keyboard
// @namespace    https://rod.migos.club/userscripts-cf
// @version      1.0.0
// @description  Floating mobile editing shortcuts for textareas, contenteditable and Monaco.
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @tag          productivity
// @tag          development
// ==/UserScript==

(() => {
  "use strict";
  const KEY = "__rodMobileEditorFabV1";
  if (window[KEY]) return;
  window[KEY] = true;

  const icons = {
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    paste: '<rect x="5" y="5" width="14" height="17" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h6"/>',
    left: '<path d="m14 18-6-6 6-6"/>',
    right: '<path d="m10 18 6-6-6-6"/>',
    up: '<path d="m18 14-6-6-6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-7L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-7l3 3"/>',
    select: '<path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6"/>',
    enter: '<path d="M20 4v8a4 4 0 0 1-4 4H4m0 0 5-5m-5 5 5 5"/>',
    tab: '<path d="M4 12h14m-6-6 6 6-6 6M21 5v14"/>',
    esc: '<path d="M5 5h14v14H5zM9 10h6M9 14h4"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    settings: '<path d="M12 3v18M3 12h18"/>',
  };
  const svg = (name) => '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.keyboard) + '</svg>';
  const host = document.createElement("div");
  host.dataset.rodEditorFab = "";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483645;pointer-events:none";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial}*{box-sizing:border-box}
    .fab{position:fixed;left:0;top:0;display:none;pointer-events:auto;touch-action:none;border:1px solid #ffffff44;border-radius:999px;width:42px;height:42px;background:linear-gradient(140deg,#7c3aed,#2563eb);color:white;box-shadow:0 6px 20px #0005;opacity:.55;align-items:center;justify-content:center;transition:opacity .15s;cursor:pointer}
    .fab.open,.fab:focus-visible{opacity:1}.panel{position:fixed;left:0;top:0;display:none;pointer-events:auto;max-width:min(340px,calc(100vw - 16px));padding:9px;border:1px solid #ffffff28;border-radius:17px;background:#151b2bef;color:#fff;box-shadow:0 12px 40px #0008;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .panel.open{display:block}.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}
    button{font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;-webkit-tap-highlight-color:transparent}
    .key{min-width:0;min-height:40px;border:1px solid #ffffff24;background:#ffffff14;border-radius:10px;color:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer}
    .key:active,.key.active{background:#7c3aed}.key svg{width:17px;height:17px}
    .top{display:flex;align-items:center;justify-content:space-between;margin:0 0 7px;gap:8px;font:600 12px -apple-system,sans-serif}
    .top button{background:transparent;color:#fff;border:0;padding:5px;cursor:pointer}
    .hint{font:10px -apple-system,sans-serif;color:#c4c6d0;margin:7px 2px 0}
    @media(prefers-reduced-motion:reduce){.fab{transition:none}}
  </style>
  <button class="fab" type="button" aria-label="Abrir teclado de edição" aria-expanded="false">${svg("keyboard")}</button>
  <section class="panel" role="group" aria-label="Atalhos de edição">
    <div class="top"><span>⌨ Editor móvel</span><button class="dismiss" aria-label="Fechar">${svg("close")}</button></div>
    <div class="grid"></div><div class="hint">Ctrl e Shift permanecem ativos para a próxima tecla.</div>
  </section>`;
  const fab = root.querySelector(".fab");
  const panel = root.querySelector(".panel");
  const grid = root.querySelector(".grid");
  const actions = [
    ["copy","Copiar","copy"],["paste","Colar","paste"],["undo","Desfazer","undo"],["redo","Refazer","redo"],
    ["left","←","ArrowLeft"],["right","→","ArrowRight"],["up","↑","ArrowUp"],["down","↓","ArrowDown"],
    ["select","Tudo","selectAll"],["tab","Tab","Tab"],["enter","Enter","Enter"],["esc","Esc","Escape"],
    ["ctrl","Ctrl","ctrl"],["shift","Shift","shift"],["keyboard","Teclado","keyboard"],
    ["settings","Home","Home"],["settings","End","End"],["copy","Cortar","cut"]
  ];
  let target = null;
  let opened = false;
  let ctrl = false;
  let shift = false;
  let lastRect = null;
  const buttons = new Map();
  for (const [icon, label, action] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "key";
    button.setAttribute("aria-label", label);
    button.innerHTML = (icons[icon] ? svg(icon) : '<b>' + label + '</b>') + "<span>" + label + "</span>";
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => void perform(action));
    grid.append(button);
    buttons.set(action, button);
  }
  function editable(element) {
    if (!(element instanceof Element)) return null;
    const candidate = element.closest('textarea,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),[contenteditable="true"],.monaco-editor');
    if (!candidate || candidate.matches("input[readonly],textarea[readonly],input[disabled],textarea[disabled]")) return null;
    return candidate;
  }
  function editorTarget(element) {
    return element?.closest?.(".monaco-editor")?.querySelector("textarea.inputarea") || element;
  }
  function updatePosition() {
    if (!target?.isConnected) { fab.style.display = "none"; panel.classList.remove("open"); opened = false; return; }
    const bounds = target.closest(".monaco-editor")?.getBoundingClientRect() || target.getBoundingClientRect();
    lastRect = bounds;
    const viewport = window.visualViewport;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const offsetX = viewport?.offsetLeft || 0;
    const offsetY = viewport?.offsetTop || 0;
    if (bounds.bottom < offsetY || bounds.top > offsetY + height || bounds.width < 5) { fab.style.display = "none"; return; }
    const x = Math.max(offsetX + 6, Math.min(bounds.right - 38, offsetX + width - 48));
    const y = Math.max(offsetY + 8, Math.min(bounds.top + 7, offsetY + height - 52));
    fab.style.left = x + "px"; fab.style.top = y + "px"; fab.style.display = "flex";
    panel.style.left = Math.max(offsetX + 8, Math.min(x - 280, offsetX + width - 348)) + "px";
    panel.style.top = Math.max(offsetY + 8, Math.min(y + 48, offsetY + height - 315)) + "px";
  }
  function setOpen(next) {
    opened = next;
    panel.classList.toggle("open", next);
    fab.classList.toggle("open", next);
    fab.setAttribute("aria-expanded", String(next));
    updatePosition();
  }
  function setModifier(name) {
    if (name === "ctrl") ctrl = !ctrl;
    else shift = !shift;
    buttons.get("ctrl").classList.toggle("active", ctrl);
    buttons.get("shift").classList.toggle("active", shift);
  }
  function insertText(element, text) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? start;
      element.setRangeText(text, start, end, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      return;
    }
    element.focus({ preventScroll: true });
    document.execCommand("insertText", false, text);
  }
  function key(element, name) {
    element.focus({ preventScroll: true });
    const options = { key: name, code: name, ctrlKey: ctrl, metaKey: false, shiftKey: shift, bubbles: true, cancelable: true, composed: true };
    element.dispatchEvent(new KeyboardEvent("keydown", options));
    element.dispatchEvent(new KeyboardEvent("keyup", options));
    ctrl = shift = false;
    buttons.get("ctrl").classList.remove("active");
    buttons.get("shift").classList.remove("active");
  }
  // Synthetic keyboard events are untrusted; use Monaco's model API when exposed.
  function activeMonaco() {
    const node = target?.closest?.(".monaco-editor");
    const api = window.monaco?.editor;
    if (!node || typeof api?.getEditors !== "function") return null;
    try { return api.getEditors().find(editor => editor.getDomNode?.() === node) || null; }
    catch { return null; }
  }
  function monacoAction(editor, action, text) {
    const model = editor.getModel?.();
    const selection = editor.getSelection?.();
    const position = editor.getPosition?.();
    if (!model || !selection || !position) return false;
    const delta = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }[action];
    if (delta || action === "Home" || action === "End") {
      const lineNumber = Math.max(1, Math.min(model.getLineCount(), position.lineNumber + (delta?.[1] || 0)));
      const column = action === "Home" ? 1 : action === "End" ? model.getLineMaxColumn(lineNumber)
        : Math.max(1, Math.min(model.getLineMaxColumn(lineNumber), position.column + (delta?.[0] || 0)));
      const next = { lineNumber, column };
      if (shift && window.monaco?.Selection) editor.setSelection(new window.monaco.Selection(selection.selectionStartLineNumber, selection.selectionStartColumn, lineNumber, column));
      else editor.setPosition(next);
      editor.revealPositionInCenterIfOutsideViewport?.(next);
    } else if (action === "selectAll") editor.setSelection(model.getFullModelRange());
    else if (action === "undo" || action === "redo") editor.trigger("rod-fab", action, null);
    else if (action === "paste" || action === "Tab" || action === "Enter") {
      if (text === undefined) return false;
      editor.executeEdits("rod-fab", [{ range: selection, text, forceMoveMarkers: true }]);
    } else return false;
    ctrl = shift = false;
    buttons.get("ctrl").classList.remove("active");
    buttons.get("shift").classList.remove("active");
    return true;
  }
  async function perform(action) {
    const element = editorTarget(target);
    if (!element) return;
    if (action === "ctrl" || action === "shift") { setModifier(action); return; }
    if (action === "keyboard") { element.focus(); setOpen(false); return; }
    const monaco = activeMonaco();
    if (monaco && action !== "copy" && action !== "cut") {
      if (action === "paste") {
        try { if (monacoAction(monaco, action, await navigator.clipboard.readText())) return; }
        catch { /* Clipboard unavailable; do not alter Monaco's hidden textarea. */ }
      } else if (monacoAction(monaco, action, action === "Tab" ? "\\t" : action === "Enter" ? "\\n" : undefined)) return;
      return;
    }
    if (action === "copy" || action === "cut") {
      const selected = monaco ? monaco.getModel()?.getValueInRange(monaco.getSelection()) : element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
        ? element.value.slice(element.selectionStart, element.selectionEnd) : String(getSelection());
      if (selected) {
        try { await navigator.clipboard.writeText(selected); } catch { key(element, "c"); }
        if (action === "cut" && monaco) monacoAction(monaco, "paste", "");
        else if (action === "cut" && element.setRangeText) insertText(element, "");
      }
    } else if (action === "paste") {
      try { insertText(element, await navigator.clipboard.readText()); }
      catch { element.focus(); key(element, "v"); }
    } else if (action === "selectAll" && !monaco && element.select) element.select();
    else if (action === "undo" || action === "redo" || action === "selectAll") {
      element.focus({ preventScroll: true });
      document.execCommand(action === "selectAll" ? "selectAll" : action);
    } else if (action === "Tab" && !monaco) insertText(element, "\t");
    else if (action === "Enter" && !monaco && !(element instanceof HTMLInputElement)) insertText(element, "\n");
    else if (action === "Home" && !monaco && element.setSelectionRange) element.setSelectionRange(0, 0);
    else if (action === "End" && !monaco && element.setSelectionRange) element.setSelectionRange(element.value.length, element.value.length);
    else key(element, action);
  }
  document.addEventListener("focusin", (event) => {
    if (event.composedPath().includes(host)) return;
    const next = editable(event.target);
    if (next) { target = next; updatePosition(); }
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (event.composedPath().includes(host)) return;
    if (opened && !editable(event.target)) setOpen(false);
  }, true);
  fab.addEventListener("pointerdown", event => event.preventDefault());
  fab.addEventListener("click", () => setOpen(!opened));
  root.querySelector(".dismiss").addEventListener("click", () => setOpen(false));
  window.addEventListener("scroll", updatePosition, { passive: true, capture: true });
  window.addEventListener("resize", updatePosition, { passive: true });
  window.visualViewport?.addEventListener("resize", updatePosition, { passive: true });
  window.visualViewport?.addEventListener("scroll", updatePosition, { passive: true });
  (document.body || document.documentElement).append(host);
})();
