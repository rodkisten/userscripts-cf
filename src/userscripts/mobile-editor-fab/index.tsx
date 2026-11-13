import { createSignal, For, Show, onCleanup } from "solid-js";
import styles, { css } from "./MobileEditorFab.module.css";

type Editor = HTMLTextAreaElement | HTMLInputElement | HTMLElement;
type Context = {
  listen: (target: EventTarget, type: string, callback: EventListener, options?: AddEventListenerOptions) => void;
  ui: { mountSolid: (component: () => any, options?: { styles?: string[]; id?: string }) => () => void };
  onDispose: (callback: () => void) => void;
  dock?: { register: (actions: { id: string; label: string; run: () => void }[]) => void };
};
const actions = [
  ["copy","Copiar","copy"],["clipboard-paste","Colar","paste"],["undo-2","Desfazer","undo"],
  ["redo-2","Refazer","redo"],["arrow-left","←","ArrowLeft"],["arrow-right","→","ArrowRight"],
  ["arrow-up","↑","ArrowUp"],["arrow-down","↓","ArrowDown"],["scan","Tudo","selectAll"],
  ["arrow-right-to-line","Tab","Tab"],["corner-down-left","Enter","Enter"],["keyboard","Teclado","keyboard"],
  ["command","Ctrl","ctrl"],["arrow-big-up","Shift","shift"],["move-horizontal","Home","Home"],
  ["move-horizontal","End","End"],["scissors","Cortar","cut"],["x","Esc","Escape"],
] as const;
const glyphs: Record<string,string> = {
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  "clipboard-paste":'<rect x="5" y="5" width="14" height="17" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h6"/>',
  "arrow-left":'<path d="m14 18-6-6 6-6"/>',"arrow-right":'<path d="m10 18 6-6-6-6"/>',
  "arrow-up":'<path d="m18 14-6-6-6 6"/>',"arrow-down":'<path d="m6 10 6 6 6-6"/>',
  keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h14M5 13h14M8 17h8"/>',
  "undo-2":'<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12"/>',
  "redo-2":'<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12"/>',
  scan:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/>',
  "arrow-right-to-line":'<path d="M4 12h13m-5-5 5 5-5 5M21 4v16"/>',
  "corner-down-left":'<path d="M20 4v8a4 4 0 0 1-4 4H4m0 0 5-5m-5 5 5 5"/>',
  command:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>',
  "arrow-big-up":'<path d="m12 3 8 9h-5v9H9v-9H4z"/>',
  "move-horizontal":'<path d="M3 12h18m-14-4-4 4 4 4m10-8 4 4-4 4"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 12 12M14 10l6-6M8 16l3-3"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>'
};
function Icon(props: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" innerHTML={glyphs[props.name] || glyphs.keyboard}/>;
}
function editorFor(node: Element | null): Editor | null {
  return node?.closest('textarea,input:not([type="hidden"]):not([type="checkbox"]),[contenteditable="true"],.monaco-editor') as Editor | null;
}
function monacoFor(target: Editor) {
  const node = target.closest(".monaco-editor");
  const api = (window as any).monaco?.editor;
  if (!node || typeof api?.getEditors !== "function") return null;
  return api.getEditors().find((item: any) => item.getDomNode?.() === node) || null;
}
function nativeInsert(element: Editor, value: string) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.setRangeText(value, element.selectionStart ?? 0, element.selectionEnd ?? 0, "end");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  } else { element.focus(); document.execCommand("insertText", false, value); }
}
export default {
  init(ctx: Context) {
    const [target, setTarget] = createSignal<Editor | null>(null);
    const [open, setOpen] = createSignal(false);
    const [ctrl, setCtrl] = createSignal(false);
    const [shift, setShift] = createSignal(false);
    const [position, setPosition] = createSignal({ x: 8, y: 8, visible: false });
    const place = () => {
      const el = target();
      if (!el?.isConnected) { setPosition(p => ({ ...p, visible: false })); return; }
      const rect = (el.closest(".monaco-editor") || el).getBoundingClientRect();
      const vp = window.visualViewport;
      const width = vp?.width || innerWidth, height = vp?.height || innerHeight;
      const x = Math.max(8, Math.min(rect.right - 40, width - 50));
      const y = Math.max(8, Math.min(rect.top + 8, height - 52));
      setPosition({ x, y, visible: rect.bottom > 0 && rect.top < height && rect.width > 8 });
    };
    const focus = (event: Event) => {
      const node = editorFor(event.target as Element);
      if (node) { setTarget(node); place(); }
    };
    ctx.listen(document, "focusin", focus, { capture: true });
    ctx.listen(window, "scroll", place, { capture: true, passive: true });
    ctx.listen(window, "resize", place);
    if (window.visualViewport) {
      ctx.listen(window.visualViewport, "resize", place);
      ctx.listen(window.visualViewport, "scroll", place);
    }
    async function run(action: string) {
      const element = target();
      if (!element) return;
      if (action === "ctrl") { setCtrl(v => !v); return; }
      if (action === "shift") { setShift(v => !v); return; }
      const monaco = monacoFor(element);
      const editor = monaco || element;
      if (action === "keyboard") { (monaco?.focus ? monaco : element).focus(); setOpen(false); return; }
      const selection = monaco?.getSelection?.();
      const model = monaco?.getModel?.();
      const text = monaco && selection && model ? model.getValueInRange(selection) :
        element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
          ? element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0)
          : String(window.getSelection() || "");
      if (action === "copy" || action === "cut") {
        try { await navigator.clipboard.writeText(text); } catch { return; }
        if (action === "cut" && text) {
          if (monaco && selection) monaco.executeEdits("mobile-fab", [{ range: selection, text: "" }]);
          else nativeInsert(element, "");
        }
      } else if (action === "paste") {
        let pasted: string;
        try { pasted = await navigator.clipboard.readText(); } catch { return; }
        if (monaco && selection) monaco.executeEdits("mobile-fab", [{ range: selection, text: pasted }]);
        else nativeInsert(element, pasted);
      } else if (monaco) {
        const pos = monaco.getPosition();
        if (action === "undo" || action === "redo") monaco.trigger("mobile-fab", action, null);
        else if (action === "selectAll") monaco.setSelection(model.getFullModelRange());
        else if (action === "Tab" || action === "Enter") monaco.executeEdits("mobile-fab", [{ range: selection, text: action === "Tab" ? "\t" : "\n" }]);
        else if (pos && (action.startsWith("Arrow") || action === "Home" || action === "End")) {
          const line = Math.max(1, Math.min(model.getLineCount(), pos.lineNumber + (action === "ArrowUp" ? -1 : action === "ArrowDown" ? 1 : 0)));
          const column = action === "Home" ? 1 : action === "End" ? model.getLineMaxColumn(line) :
            Math.max(1, Math.min(model.getLineMaxColumn(line), pos.column + (action === "ArrowLeft" ? -1 : action === "ArrowRight" ? 1 : 0)));
          if (shift() && (window as any).monaco?.Selection) monaco.setSelection(new (window as any).monaco.Selection(selection.selectionStartLineNumber, selection.selectionStartColumn, line, column));
          else monaco.setPosition({ lineNumber: line, column });
          monaco.revealPositionInCenterIfOutsideViewport?.({ lineNumber: line, column });
        }
      } else if (action === "selectAll") {
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) element.select();
        else document.execCommand("selectAll");
      } else if (action === "undo" || action === "redo") document.execCommand(action);
      else if (action === "Tab" || action === "Enter") nativeInsert(element, action === "Tab" ? "\t" : "\n");
      else if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        const delta = action === "ArrowLeft" ? -1 : action === "ArrowRight" ? 1 : 0;
        const index = action === "Home" ? 0 : action === "End" ? element.value.length : Math.max(0, Math.min(element.value.length, element.selectionEnd + delta));
        element.setSelectionRange(shift() ? element.selectionStart : index, index);
      }
      setCtrl(false); setShift(false);
    }
    const dispose = ctx.ui.mountSolid(() => (
      <>
        <Show when={position().visible}>
          <button class={styles.fab} data-open={open()} style={{ left: position().x + "px", top: position().y + "px" }}
            aria-label="Abrir atalhos do editor" aria-expanded={open()}
            onPointerDown={event => event.preventDefault()} onClick={() => setOpen(v => !v)}><Icon name="keyboard"/></button>
        </Show>
        <Show when={open() && position().visible}>
          <section class={styles.panel} role="group" aria-label="Atalhos do editor"
            style={{ left: Math.max(8, Math.min(position().x - 260, innerWidth - 318)) + "px", top: Math.max(8, Math.min(position().y + 46, (window.visualViewport?.height || innerHeight) - 270)) + "px" }}>
            <div class={styles.title}><span>⌨ Editor móvel</span><button class={styles.close} aria-label="Fechar" onClick={() => setOpen(false)}>×</button></div>
            <div class={styles.grid}><For each={actions}>{([icon, label, action]) =>
              <button class={styles.key} data-active={action === "ctrl" ? ctrl() : action === "shift" ? shift() : false}
                aria-label={label} onPointerDown={event => event.preventDefault()} onClick={() => void run(action)}>
                <Icon name={icon}/><span>{label}</span>
              </button>
            }</For></div>
            <p class={styles.hint}>Ctrl e Shift: próximo comando</p>
          </section>
        </Show>
      </>
    ), { styles: [css], id: "mobile-editor-fab" });
    ctx.onDispose(dispose);
  },
};
