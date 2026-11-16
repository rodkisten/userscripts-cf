import { Button, ButtonGroup, DropdownButton, buttonCss } from "../src/runtime/solid-ui/button";
import { createSignal } from "solid-js";
import sourceStyles, { css as sourceCss } from "./InspectorSource.module.css";
import { render } from "@solidjs/web";
import { ObjectInspector } from "../src/runtime/solid-ui/object-inspector";
import { RodMenu } from "../src/runtime/solid-ui/menu";
import { studioExamples, schemaForExample } from "./examples";
import type { RodInspectorOptions } from "../src/runtime/solid-ui/object-inspector/types";
import type { Presentation, RodMenuSchema } from "../src/runtime/solid-ui/menu/types";

type InspectorSample = "response" | "dom" | "settings" | "syntax";
const samples: Record<InspectorSample, unknown> = {
  response: {
    ok: true,
    status: 200,
    data: {
      user: { id: 42, name: "Rod", roles: ["developer", "admin"] },
      items: [
        { id: "a", active: true },
        { id: "b", active: false },
      ],
    },
    durationMs: 127,
  },
  dom: document.querySelector("main") ?? document.body,
  syntax: (() => {
    const circular: Record<string, unknown> = { label: "Circular" };
    circular.self = circular;
    return {
      string: "Hello, syntax!",
      number: 42,
      bigint: 9007199254740993n,
      boolean: true,
      nil: null,
      missing: undefined,
      symbol: Symbol("token"),
      callable: function inspect() {},
      array: [1, "two", false],
      map: new Map([["key", 12]]),
      set: new Set(["one", "two"]),
      date: new Date("2026-11-15T12:00:00Z"),
      regexp: /syntax\s+highlight/gi,
      error: new TypeError("Example error"),
      circular,
    };
  })(),
  settings: {
    theme: { accent: "#a78bfa", radius: 18 },
    menu: { presentation: "bottom-sheet", size: "lg", scrollLock: true },
    features: ["dock", "inspector", "menu"],
  },
};
const root = document.getElementById("tree");
if (!root) throw new Error("[Rod UI Studio] Missing inspector mount");
const [sample, setSample] = createSignal<InspectorSample>("response");
const [depth, setDepth] = createSignal(2);
const [filter, setFilter] = createSignal("");
const [revision, setRevision] = createSignal(0);
const [inspectorOptions, setInspectorOptions] = createSignal<RodInspectorOptions>({
  inspectDepth: 12,
  inspectItems: 1000,
  previewItems: 5,
  virtualize: true,
  theme: "dark",
});
render(() => {
  const value = () => {
    const selected = samples[sample()];
    const term = filter().trim().toLowerCase();
    if (!term || !selected || typeof selected !== "object" || selected instanceof Element) return selected;
    return Object.fromEntries(
      Object.entries(selected).filter(([key, value]) =>
        (
          key +
          " " +
          String(
            value instanceof Error
              ? value.message
              : typeof value === "object"
                ? Object.prototype.toString.call(value)
                : value,
          )
        )
          .toLowerCase()
          .includes(term),
      ),
    );
  };
  return (
    <div data-studio-inspector-revision={revision()}>
      <ObjectInspector value={value()} options={{ ...inspectorOptions(), expandDepth: depth() }} />
    </div>
  );
}, root);
document.querySelectorAll<HTMLButtonElement>("[data-object]").forEach((button) =>
  button.addEventListener("click", () => {
    const next = button.dataset.object as InspectorSample;
    if (!(next in samples)) return;
    setSample(next);
    document
      .querySelectorAll("[data-object]")
      .forEach((item) => item.setAttribute("aria-selected", String(item === button)));
  }),
);
document
  .getElementById("filter")
  ?.addEventListener("input", (event) => setFilter((event.target as HTMLInputElement).value));
document
  .getElementById("depth")
  ?.addEventListener("change", (event) => setDepth(Number((event.target as HTMLSelectElement).value)));
document.getElementById("expand")?.addEventListener("click", () => setDepth(20));
document.getElementById("collapse")?.addEventListener("click", () => {
  setDepth(0);
  setRevision((value) => value + 1);
});
document
  .getElementById("copyObject")
  ?.addEventListener("click", () =>
    navigator.clipboard?.writeText(
      safeSource(
        samples[sample()] instanceof Element
          ? { outerHTML: (samples[sample()] as Element).outerHTML }
          : samples[sample()],
      ),
    ),
  );
document.getElementById("menuLive")?.addEventListener("click", () => {
  const title = (document.getElementById("titleInput") as HTMLInputElement)?.value || "RodMenu";
  const presentation = (document.getElementById("presentation") as HTMLSelectElement)?.value as Presentation;
  const size = (document.getElementById("menuSize") as HTMLSelectElement)?.value as RodMenuSchema["size"];
  RodMenu.open({
    id: "rod-ui-studio-live-menu",
    title,
    presentation,
    size,
    description: "Instância real do RodMenu SolidJS 2",
    fields: [
      { type: "text", name: "name", label: "Nome", value: "Minha configuração" },
      { type: "switch", name: "enabled", label: "Habilitado", value: true },
      {
        type: "select",
        name: "quality",
        label: "Qualidade",
        options: [
          { value: "auto", label: "Automática" },
          { value: "high", label: "Alta" },
        ],
      },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", role: "cancel" },
      { id: "save", label: "Salvar", role: "submit" },
    ],
  });
});

const catalog = document.getElementById("examplesCatalog");
const search = document.getElementById("examplesSearch") as HTMLInputElement | null;
const category = document.getElementById("examplesCategory") as HTMLSelectElement | null;
const categories = [...new Set(studioExamples.map((example) => example.category))];
if (category) {
  for (const name of categories) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    category.appendChild(option);
  }
}
function renderExamples() {
  if (!catalog) return;
  catalog.replaceChildren();
  const query = search?.value.trim().toLocaleLowerCase() ?? "";
  const selectedCategory = category?.value ?? "";
  for (const example of studioExamples.filter(
    (item) =>
      (!selectedCategory || item.category === selectedCategory) &&
      (!query || [item.title, item.description, item.category].join(" ").toLocaleLowerCase().includes(query)),
  )) {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = example.title;
    const description = document.createElement("p");
    description.textContent = example.description;
    const categoryTag = document.createElement("span");
    categoryTag.className = "token";
    categoryTag.textContent = example.category;
    const button = document.createElement("button");
    button.className = "primary";
    button.textContent = "Abrir instância real";
    button.addEventListener("click", () => {
      const presentation = (document.getElementById("presentation") as HTMLSelectElement)
        ?.value as Presentation;
      const size = (document.getElementById("menuSize") as HTMLSelectElement)?.value as RodMenuSchema["size"];
      RodMenu.open(schemaForExample(example, presentation, size));
      const output = document.getElementById("exampleCode");
      if (output)
        output.textContent = JSON.stringify(
          schemaForExample(example, presentation, size),
          (_key, value) =>
            typeof value === "function"
              ? "[callback]"
              : value instanceof Element
                ? `[Element: ${value.tagName}]`
                : value,
          2,
        );
    });
    card.append(title, description, categoryTag, document.createElement("hr"), button);
    catalog.appendChild(card);
  }
}
search?.addEventListener("input", renderExamples);
category?.addEventListener("change", renderExamples);
renderExamples();

const inspectorControls: Array<{
  key: keyof RodInspectorOptions;
  label: string;
  kind: "boolean" | "number" | "select";
  min?: number;
  max?: number;
}> = [
  { key: "inspectDepth", label: "Profundidade máxima", kind: "number", min: 1, max: 50 },
  { key: "inspectItems", label: "Máximo de itens", kind: "number", min: 10, max: 10000 },
  { key: "previewItems", label: "Itens no resumo", kind: "number", min: 1, max: 50 },
  { key: "previewMaxLength", label: "Comprimento do resumo", kind: "number", min: 10, max: 1000 },
  { key: "showPrototype", label: "Mostrar prototype", kind: "boolean" },
  { key: "showNonEnumerable", label: "Propriedades não enumeráveis", kind: "boolean" },
  { key: "showObjectLength", label: "Mostrar tamanho", kind: "boolean" },
  { key: "virtualize", label: "Virtualização", kind: "boolean" },
  { key: "virtualizeAfter", label: "Virtualizar após N itens", kind: "number", min: 1, max: 5000 },
  { key: "virtualRowHeight", label: "Altura da linha", kind: "number", min: 16, max: 120 },
  { key: "virtualOverscan", label: "Overscan", kind: "number", min: 0, max: 100 },
  { key: "virtualMaxHeight", label: "Altura máxima", kind: "number", min: 100, max: 2000 },
  { key: "virtualRowCache", label: "Cache de linhas", kind: "number", min: 10, max: 10000 },
  { key: "unmountOnCollapse", label: "Desmontar ao recolher", kind: "boolean" },
  { key: "highlightDuration", label: "Duração do destaque (ms)", kind: "number", min: 0, max: 10000 },
  { key: "theme", label: "Tema", kind: "select" },
  { key: "syntaxHighlighting", label: "Syntax highlighting", kind: "boolean" },
];
const inspectorPanel = document.getElementById("inspectorAdvanced");
if (inspectorPanel) {
  for (const control of inspectorControls) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:160px;flex:1";
    const caption = document.createElement("span");
    caption.textContent = control.label;
    const input =
      control.kind === "select" ? document.createElement("select") : document.createElement("input");
    if (control.kind === "select") {
      for (const theme of ["auto", "dark", "light"]) {
        const option = document.createElement("option");
        option.value = theme;
        option.textContent = theme;
        input.append(option);
      }
    } else {
      (input as HTMLInputElement).type = control.kind === "boolean" ? "checkbox" : "number";
      if (control.kind === "number") {
        (input as HTMLInputElement).min = String(control.min ?? 0);
        (input as HTMLInputElement).max = String(control.max ?? 10000);
      }
    }
    input.style.cssText =
      "background:var(--surface2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px;min-height:38px";
    const current = inspectorOptions()[control.key];
    if (control.kind === "boolean") (input as HTMLInputElement).checked = Boolean(current);
    else if (current !== undefined) input.value = String(current);
    input.addEventListener("change", () => {
      const value =
        control.kind === "boolean"
          ? (input as HTMLInputElement).checked
          : control.kind === "number"
            ? Number(input.value)
            : input.value;
      setInspectorOptions((previous) => ({ ...previous, [control.key]: value }));
      const preview = document.getElementById("inspectorOptionsCode");
      if (preview)
        preview.textContent = JSON.stringify({ ...inspectorOptions(), expandDepth: depth() }, null, 2);
    });
    label.append(caption, input);
    inspectorPanel.append(label);
  }
}
document.getElementById("inspectorReset")?.addEventListener("click", () => {
  setInspectorOptions({
    inspectDepth: 12,
    inspectItems: 1000,
    previewItems: 5,
    virtualize: true,
    theme: "dark",
  });
  inspectorPanel?.querySelectorAll("input,select").forEach((element, index) => {
    const control = inspectorControls[index];
    if (!control) return;
    const value = inspectorOptions()[control.key];
    if (element instanceof HTMLInputElement && element.type === "checkbox") element.checked = Boolean(value);
    else (element as HTMLInputElement | HTMLSelectElement).value = value === undefined ? "" : String(value);
  });
});

/** The editor is loaded only by the Studio, never by the userscript inspector runtime. */
const sourcePanel = document.createElement("section");
sourcePanel.className = sourceStyles.panel;
sourcePanel.innerHTML = `<div class="${sourceStyles.toolbar}"><strong>CodeMirror · Source / Stack trace</strong><select aria-label="Linguagem" id="inspectorSourceLanguage"><option value="json">JSON</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option></select><button type="button" id="inspectorShowStack">Stack trace</button><button type="button" id="inspectorCopySource">Copiar formatado</button></div><div id="inspectorSourceEditor" class="${sourceStyles.editor}" aria-label="Código destacado"></div>`;
root.parentElement?.append(sourcePanel);

function safeSource(value: unknown): string {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(
      value,
      (_key, item: unknown) => {
        if (typeof item === "bigint") return String(item) + "n";
        if (typeof item === "symbol") return String(item);
        if (typeof item === "function") return String(item);
        if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
        if (item instanceof Map) return { type: "Map", entries: [...item.entries()] };
        if (item instanceof Set) return { type: "Set", values: [...item.values()] };
        if (typeof item === "object" && item !== null) {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      },
      2,
    ) ?? "undefined"
  );
}

let sourceText = "";
let showStack = false;
let updateSource: ((text: string) => void) | undefined;
const sourceLanguage = document.getElementById("inspectorSourceLanguage") as HTMLSelectElement;
const sourceHost = document.getElementById("inspectorSourceEditor");
async function loadSourceEditor() {
  if (!sourceHost) return;
  const [
    { EditorState },
    { EditorView, lineNumbers },
    { javascript },
    { syntaxHighlighting, defaultHighlightStyle },
    { oneDark },
  ] = await Promise.all([
    import("@codemirror/state"),
    import("@codemirror/view"),
    import("@codemirror/lang-javascript"),
    import("@codemirror/language"),
    import("@codemirror/theme-one-dark"),
  ]);
  let view: InstanceType<typeof EditorView>;
  const build = (text: string) => {
    view?.destroy();
    view = new EditorView({
      parent: sourceHost,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          EditorView.lineWrapping,
          EditorView.editable.of(false),
          javascript({ typescript: sourceLanguage.value === "typescript" }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          oneDark,
        ],
      }),
    });
  };
  updateSource = build;
  build(sourceText);
  sourceLanguage.addEventListener("change", () => build(sourceText));
}
function refreshSource() {
  const selected = samples[sample()];
  const error =
    selected instanceof Error
      ? selected
      : selected && typeof selected === "object" && "error" in selected && selected.error instanceof Error
        ? selected.error
        : null;
  sourceText =
    showStack && error
      ? (error.stack ?? error.message)
      : selected instanceof Element
        ? selected.outerHTML
        : safeSource(selected);
  updateSource?.(sourceText);
}
document
  .querySelectorAll<HTMLButtonElement>("[data-object]")
  .forEach((button) => button.addEventListener("click", refreshSource));
document.getElementById("inspectorShowStack")?.addEventListener("click", () => {
  showStack = !showStack;
  refreshSource();
});
document
  .getElementById("inspectorCopySource")
  ?.addEventListener("click", () => navigator.clipboard?.writeText(sourceText));
refreshSource();
void loadSourceEditor().catch((error) => {
  if (sourceHost) sourceHost.textContent = "CodeMirror unavailable: " + String(error);
});

const inspectorSourceStyle = document.createElement("style");
inspectorSourceStyle.textContent = sourceCss;
sourcePanel.prepend(inspectorSourceStyle);

// Live Button playground uses the real Solid components and the shared RodMenu dropdown.
const buttonStudio = document.createElement("section");
buttonStudio.id = "buttons";
buttonStudio.className = "section";
buttonStudio.innerHTML =
  '<h2>Buttons & ButtonGroup</h2><p>Componentes reais: variantes, badges, loading e dropdown usando RodMenu.</p><div id="buttonStudioMount"></div>';
document.querySelector("main.content")?.append(buttonStudio);
const buttonStyle = document.createElement("style");
buttonStyle.textContent = buttonCss;
document.head.append(buttonStyle);
const buttonMount = document.getElementById("buttonStudioMount");
if (buttonMount) {
  render(() => {
    const [variant, setVariant] = createSignal<
      "default" | "secondary" | "outline" | "ghost" | "destructive" | "success" | "warning"
    >("default");
    const [busy, setBusy] = createSignal(false);
    const [count, setCount] = createSignal(3);
    return (
      <div class="card" style={{ display: "grid", gap: "18px" }}>
        <div class="flex">
          <label>
            Variante{" "}
            <select
              value={variant()}
              onChange={(e) => setVariant(e.currentTarget.value as ReturnType<typeof variant>)}
            >
              {(
                ["default", "secondary", "outline", "ghost", "destructive", "success", "warning"] as const
              ).map((v) => (
                <option value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={busy()} onChange={(e) => setBusy(e.currentTarget.checked)} />{" "}
            Loading
          </label>
          <label>
            Accent{" "}
            <input
              type="color"
              value="#7c3aed"
              onInput={(e) => buttonMount?.style.setProperty("--button-accent", e.currentTarget.value)}
            />
          </label>
        </div>
        <div class="flex">
          <Button
            variant={variant()}
            icon="✓"
            badge={count()}
            loading={busy()}
            onClick={() => setCount((n) => n + 1)}
          >
            Salvar
          </Button>
          <ButtonGroup attached>
            <Button variant="outline" onClick={() => setCount((n) => n + 1)}>
              Adicionar
            </Button>
            <Button variant="outline" onClick={() => setCount(0)}>
              Limpar
            </Button>
          </ButtonGroup>
          <DropdownButton
            variant={variant()}
            items={[
              { label: "Adicionar", onSelect: () => setCount((n) => n + 1) },
              { label: "Zerar", onSelect: () => setCount(0) },
            ]}
          >
            Mais ações
          </DropdownButton>
        </div>
        <pre class="code">
          {JSON.stringify({ variant: variant(), loading: busy(), badge: count() }, null, 2)}
        </pre>
      </div>
    );
  }, buttonMount);
}
