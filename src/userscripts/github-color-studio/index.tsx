import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ScriptContext } from "../../core/runtime.js";
import * as Dialog from "@radix-ui/react-dialog";
import { normalizeColor, renameVariable, scanColors, scanVariables } from "./colors.js";
import css from "./style.css?inline";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";

const CODE_LINE_SELECTOR =
  '[data-testid="code-viewer"] .react-code-text, .react-code-line-contents, td.blob-code-inner, .react-code-lines .react-code-text';
const VIEW_SELECTOR = '[data-testid="code-viewer"], .react-code-lines, table.highlight';

// CodeMirror keeps its document in EditorState, not in an underlying textarea.
// Some hosts expose their view through cmView; never modify the editor's DOM text.
type CMView = Pick<EditorView, "state" | "dispatch"> & { dom: HTMLElement };
type ViewCarrier = HTMLElement & {
  cmView?: { view?: CMView } | CMView;
  view?: CMView;
};

function isCMView(value: unknown): value is CMView {
  if (!value || typeof value !== "object") {
return false;
}
  const candidate = value as Partial<CMView>;
  return !!candidate.state?.doc && typeof candidate.dispatch === "function";
}

function findCodeMirror(): CMView | null {
  for (const element of document.querySelectorAll<HTMLElement>(".cm-editor")) {
    const node = (element.querySelector(".cm-content") ?? element) as ViewCarrier;
    const attached = node.cmView;
    const root = attached && "rootView" in attached ? (attached as { rootView?: { view?: CMView } }).rootView?.view : undefined;
    const view = root ?? (attached && "view" in attached ? attached.view : attached);
    if (isCMView(view)) {
return view;
}
    if (isCMView(node.view)) {
return node.view;
}
    const wrapper = element as ViewCarrier;
    if (isCMView(wrapper.view)) {
return wrapper.view;
}
    // Only supported if the host exposes a compatible CodeMirror view.
    const finder = EditorView;
    try {
      const discovered = finder.findFromDOM?.(element);
      if (isCMView(discovered)) {
return discovered;
}
    } catch {
      // Different CodeMirror module copies may not share internal view metadata.
    }
  }
  return null;
}

const installedViews = new WeakSet<CMView>();

class ColorWidget extends WidgetType {
  constructor(readonly value: string, readonly from: number) { super(); }
  eq(other: ColorWidget) { return this.value === other.value && this.from === other.from; }
  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rcs-cm-swatch";
    button.title = `Edit ${this.value}`;
    button.setAttribute("aria-label", `Edit color ${this.value}`);
    button.style.backgroundColor = this.value;
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", event => {
      event.preventDefault();
      const input = document.createElement("input");
      input.type = "color";
      input.value = normalizeColor(this.value).startsWith("#")
        ? normalizeColor(this.value).slice(0, 7) : "#000000";
      input.style.position = "fixed";
      input.style.opacity = "0";
      input.style.pointerEvents = "none";
      document.body.append(input);
      let currentValue = this.value;
      input.addEventListener("input", () => {
        const current = view.state.doc.sliceString(this.from, this.from + currentValue.length);
        if (current !== currentValue) {
return;
}
        view.dispatch({ changes: { from: this.from, to: this.from + currentValue.length, insert: input.value } });
        currentValue = input.value;
      });
      input.addEventListener("change", () => input.remove(), { once: true });
      input.addEventListener("blur", () => queueMicrotask(() => input.remove()), { once: true });
      input.click();
    });
    return button;
  }
}

const colorPlugin = ViewPlugin.fromClass(class {
  decorations;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(update: import("@codemirror/view").ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
this.decorations = this.build(update.view);
}
  }
  build(view: EditorView) {
    const ranges: { from: number; decoration: ReturnType<typeof Decoration.widget> }[] = [];
    for (const { from, to } of view.visibleRanges) {
      const source = view.state.doc.sliceString(from, to);
      for (const match of scanColors(source)) {
        const offset = from + match.from;
        ranges.push({ from: offset, decoration: Decoration.widget({
          widget: new ColorWidget(match.value, offset), side: -1,
        }) });
      }
    }
    return Decoration.set(ranges.sort((a,b) => a.from - b.from).map(item => item.decoration.range(item.from)));
  }
}, { decorations: plugin => plugin.decorations });

function installColorPlugin(view: CMView): boolean {
  if (installedViews.has(view)) {
return true;
}
  try {
    view.dispatch({ effects: StateEffect.appendConfig.of(colorPlugin) });
    installedViews.add(view);
    return true;
  } catch (error) {
    console.warn("[Color Studio] CodeMirror extension incompatible with host state modules", error);
    return false;
  }
}

function replaceCodeMirrorDocument(view: CMView, next: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: next },
  });
}

function ColorStudio({
  getSource,
  applySource,
  close,
}: {
  getSource: () => string;
  applySource: (next: string) => boolean;
  close: () => void;
}) {
  const [source, setSource] = useState(getSource);
  const [selected, setSelected] = useState("");
  const [format, setFormat] = useState("hex");
  const [rename, setRename] = useState("");
  const [filter, setFilter] = useState("");
  const colors = useMemo(() => scanColors(source), [source]);
  const symbols = useMemo(() => scanVariables(source), [source]);
  const unique = useMemo(() => [...new Map(colors.map((c) => [c.normalized, c])).values()], [colors]);
  const selectedRefs = symbols.references.filter((r) => r.name === selected);
  const selectedDefs = symbols.declarations.filter((r) => r.name === selected);
  function changeColor(from: string, to: string) {
    const next = source.replaceAll(from, to);
    if (applySource(next)) {
setSource(next);
}
  }
  function changeName() {
    if (!selected || !rename || selectedDefs.length !== 1) {
return;
}
    const next = renameVariable(source, selected, rename);
    if (
      window.confirm(
        `Renomear ${selected} para ${rename} em ${selectedRefs.length + selectedDefs.length} ocorrências deste arquivo?`,
      ) &&
      applySource(next)
    ) {
      setSource(next);
      setSelected(rename);
      setRename("");
    }
  }
  function convert(value: string): string {
    const rgb = normalizeColor(value);
    if (!rgb.startsWith("rgb")) {
return value;
}
    if (format === "rgb") {
return rgb;
}
    if (format === "hex") {
return value.startsWith("#") ? value : normalizeColor(value);
}
    if (format === "hsl") {
      const m = rgb.match(/[\d.]+/g)?.map(Number);
      if (!m || m.length < 3) {
return value;
}
      const [r, g, b] = m.slice(0, 3).map((v) => v / 255),
        max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
      let h = 0,
        s = 0;
      const l = (max + min) / 2;
      if (delta) {
        s = delta / (1 - Math.abs(2 * l - 1));
        switch (max) {
          case r:
            h = ((g - b) / delta) % 6;
            break;
          case g:
            h = (b - r) / delta + 2;
            break;
          default:
            h = (r - g) / delta + 4;
        }
        h *= 60;
        if (h < 0) {
h += 360;
}
      }
      return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
    }
    return value;
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
close();
}
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="rcs-overlay" />
        <Dialog.Content className="rcs-panel" aria-describedby={undefined}>
          <header>
            <Dialog.Title>🎨 GitHub Color Studio</Dialog.Title>
            <Dialog.Close aria-label="Fechar">×</Dialog.Close>
          </header>
          <p>
            {colors.length} ocorrências · {unique.length} cores · {symbols.declarations.length} definições CSS
          </p>
          <input
            aria-label="Filtrar cores e variáveis"
            placeholder="Filtrar cores e variáveis…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="rcs-formats">
            {["hex", "rgb", "hsl"].map((f) => (
              <button aria-pressed={format === f} onClick={() => setFormat(f)} key={f}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <section className="rcs-scroll">
            <h3>Cores deste arquivo</h3>
            {unique
              .filter((c) => c.value.includes(filter) || c.normalized.includes(filter))
              .map((c) => (
                <div className="rcs-color" key={c.from}>
                  <input
                    type="color"
                    aria-label={`Editar ${c.value}`}
                    value={
                      normalizeColor(c.value).startsWith("#")
                        ? normalizeColor(c.value).slice(0, 7)
                        : "#000000"
                    }
                    onChange={(e) => changeColor(c.value, e.target.value)}
                  />
                  <code>{c.value}</code>
                  <small>{colors.filter((x) => x.normalized === c.normalized).length} usos</small>
                  <button onClick={() => changeColor(c.value, convert(c.value))}>Converter</button>
                  <button onClick={() => navigator.clipboard.writeText(c.value)}>Copiar</button>
                </div>
              ))}
            <h3>Variáveis CSS</h3>
            {symbols.declarations
              .filter((v) => v.name.includes(filter))
              .map((v) => (
                <button
                  className="rcs-variable"
                  key={v.from}
                  onClick={() => setSelected(v.name)}
                  aria-pressed={selected === v.name}
                >
                  {v.name}{" "}
                  <small>{symbols.references.filter((r) => r.name === v.name).length} referências</small>
                </button>
              ))}
            {selected && (
              <div className="rcs-rename">
                <strong>{selected}</strong>
                <p>
                  {selectedRefs.length} referências · {selectedDefs.length} definições neste arquivo
                </p>
                <input
                  aria-label="Novo nome"
                  placeholder="--novo-nome"
                  value={rename}
                  onChange={(e) => setRename(e.target.value)}
                />
                <button
                  disabled={selectedDefs.length !== 1 || !/^--[\w-]+$/.test(rename)}
                  onClick={changeName}
                >
                  Renomear neste arquivo
                </button>
              </div>
            )}
          </section>
          <footer>
            <button onClick={() => navigator.clipboard.writeText(source)}>Copiar código</button>
            <Dialog.Close>Fechar</Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GitHubColorStudioApp({ ctx }: { ctx: ScriptContext }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<HTMLElement[]>([]);
  const [available, setAvailable] = useState(false);
  const [sourceVersion, setSourceVersion] = useState(0);
  const getEditor = () =>
    document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label*="code" i], textarea[aria-label*="file" i], textarea.js-code-editor, textarea[data-testid*="editor"]',
    );
  const getViewer = () => document.querySelector(VIEW_SELECTOR);
  const getCMView = () => findCodeMirror();
  const getSource = () =>
    getCMView()?.state.doc.toString() ??
    getEditor()?.value ??
    ([...document.querySelectorAll<HTMLElement>(CODE_LINE_SELECTOR)]
      .map((line) => line.textContent ?? "")
      .join("\n") ||
      getViewer()?.textContent ||
      "");
  const applySource = (next: string): boolean => {
    const cmView = getCMView();
    if (cmView) {
      installColorPlugin(cmView);
      replaceCodeMirrorDocument(cmView, next);
      setSourceVersion((version) => version + 1);
      return true;
    }
    const editor = getEditor();
    if (!editor) {
      void navigator.clipboard.writeText(next);
      window.alert("Visualização somente leitura: código atualizado copiado. Abra Edit para aplicar.");
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(editor, next);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    setSourceVersion((version) => version + 1);
    return true;
  };
  useEffect(() => {
    let scheduled = false;
    const refresh = () => {
      const next = [...document.querySelectorAll<HTMLElement>(CODE_LINE_SELECTOR)];
      const view = getCMView();
      if (view) {
installColorPlugin(view);
}
      setAvailable(Boolean(view || getEditor() || getViewer() || document.querySelector(".cm-editor")));
      setLines((previous) =>
        previous.length === next.length && previous.every((line, index) => line === next[index])
          ? previous
          : next,
      );
    };
    refresh();
    const observer = ctx.observe(
      document.body,
      () => {
        if (scheduled) {
return;
}
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          refresh();
        });
      },
      { childList: true, subtree: true },
    );
    return () => observer.disconnect();
  }, [ctx]);
  if (!available) {
return null;
}
  return (
    <>
      <button
        type="button"
        className="rcs-fab"
        aria-label="Abrir Color Studio"
        title="GitHub Color Studio"
        onClick={() => setOpen(true)}
      >
        🎨
      </button>
      {lines.flatMap((line, lineIndex) => {
        const colors = scanColors(
          [...line.childNodes]
            .filter(
              (node) => !(node instanceof HTMLElement && node.classList.contains("rcs-inline-swatches")),
            )
            .map((node) => node.textContent ?? "")
            .join(""),
        );
        return colors.length
          ? [
              createPortal(
                <span className="rcs-inline-swatches" aria-label="Cores da linha" key={lineIndex}>
                  {colors.map((color) => (
                    <button
                      key={color.from}
                      type="button"
                      className="rcs-swatch"
                      style={{ backgroundColor: color.value }}
                      aria-label={`Editar cor ${color.value}`}
                      title={color.value}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(true);
                      }}
                    />
                  ))}
                </span>,
                line,
                `colors-${lineIndex}`,
              ),
            ]
          : [];
      })}
      {open && (
        <ColorStudio
          key={sourceVersion}
          getSource={getSource}
          applySource={applySource}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default {
  init(ctx: ScriptContext): void {
    if (!ctx.ui) {
return;
}
    ctx.ui.pageStyle(css, { id: "rod-github-color-studio-style" });
    const dispose = ctx.ui.mountReact(<GitHubColorStudioApp ctx={ctx} />);
    ctx.onDispose(dispose);
  },
};
