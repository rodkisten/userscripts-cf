import { createSignal } from "solid-js";
import { render } from "@solidjs/web";
import { ObjectInspector } from "../src/runtime/solid-ui/object-inspector";
import { RodMenu } from "../src/runtime/solid-ui/menu";
import { studioExamples, schemaForExample } from "./examples";
import type { RodInspectorOptions } from "../src/runtime/solid-ui/object-inspector/types";
import type { Presentation, RodMenuSchema } from "../src/runtime/solid-ui/menu/types";

type InspectorSample = "response" | "dom" | "settings" | "syntax";
const samples: Record<InspectorSample, unknown> = {
  response: { ok: true, status: 200, data: { user: { id: 42, name: "Rod", roles: ["developer", "admin"] }, items: [{ id: "a", active: true }, { id: "b", active: false }] }, durationMs: 127 },
  dom: document.querySelector("main") ?? document.body,
  syntax: (() => {
    const circular: Record<string, unknown> = { label: "Circular" };
    circular.self = circular;
    return {
      string: "Hello, syntax!", number: 42, bigint: 9007199254740993n,
      boolean: true, nil: null, missing: undefined, symbol: Symbol("token"),
      callable: function inspect() {}, array: [1, "two", false],
      map: new Map([["key", 12]]), set: new Set(["one", "two"]),
      date: new Date("2026-11-15T12:00:00Z"),
      regexp: /syntax\s+highlight/gi,
      error: new TypeError("Example error"), circular,
    };
  })(),
  settings: { theme: { accent: "#a78bfa", radius: 18 }, menu: { presentation: "bottom-sheet", size: "lg", scrollLock: true }, features: ["dock", "inspector", "menu"] },
};
const root = document.getElementById("tree");
if (!root) throw new Error("[Rod UI Studio] Missing inspector mount");
const [sample, setSample] = createSignal<InspectorSample>("response");
const [depth, setDepth] = createSignal(2);
const [filter, setFilter] = createSignal("");
const [revision, setRevision] = createSignal(0);
const [inspectorOptions, setInspectorOptions] = createSignal<RodInspectorOptions>({ inspectDepth: 12, inspectItems: 1000, previewItems: 5, virtualize: true, theme: "dark" });
render(() => {
  const value = () => {
    const selected = samples[sample()];
    const term = filter().trim().toLowerCase();
    if (!term || !selected || typeof selected !== "object" || selected instanceof Element) return selected;
    return Object.fromEntries(Object.entries(selected).filter(([key, value]) => (key + " " + JSON.stringify(value)).toLowerCase().includes(term)));
  };
  return <div data-studio-inspector-revision={revision()}><ObjectInspector value={value()} options={{ ...inspectorOptions(), expandDepth: depth() }} /></div>;
}, root);
document.querySelectorAll<HTMLButtonElement>("[data-object]").forEach(button => button.addEventListener("click", () => {
  const next = button.dataset.object as InspectorSample;
  if (!(next in samples)) return;
  setSample(next);
  document.querySelectorAll("[data-object]").forEach(item => item.setAttribute("aria-selected", String(item === button)));
}));
document.getElementById("filter")?.addEventListener("input", event => setFilter((event.target as HTMLInputElement).value));
document.getElementById("depth")?.addEventListener("change", event => setDepth(Number((event.target as HTMLSelectElement).value)));
document.getElementById("expand")?.addEventListener("click", () => setDepth(20));
document.getElementById("collapse")?.addEventListener("click", () => { setDepth(0); setRevision(value => value + 1); });
document.getElementById("copyObject")?.addEventListener("click", () => navigator.clipboard?.writeText(JSON.stringify(samples[sample()] instanceof Element ? { outerHTML: (samples[sample()] as Element).outerHTML } : samples[sample()], null, 2)));
document.getElementById("menuLive")?.addEventListener("click", () => {
  const title = (document.getElementById("titleInput") as HTMLInputElement)?.value || "RodMenu";
  const presentation = (document.getElementById("presentation") as HTMLSelectElement)?.value as Presentation;
  const size = (document.getElementById("menuSize") as HTMLSelectElement)?.value as RodMenuSchema["size"];
  RodMenu.open({
    id: "rod-ui-studio-live-menu", title, presentation, size, description: "Instância real do RodMenu SolidJS 2",
    fields: [
      { type: "text", name: "name", label: "Nome", value: "Minha configuração" },
      { type: "switch", name: "enabled", label: "Habilitado", value: true },
      { type: "select", name: "quality", label: "Qualidade", options: [{ value: "auto", label: "Automática" }, { value: "high", label: "Alta" }] },
    ],
    actions: [{ id: "cancel", label: "Cancelar", role: "cancel" }, { id: "save", label: "Salvar", role: "submit" }],
  });
});

const catalog = document.getElementById("examplesCatalog");
const search = document.getElementById("examplesSearch") as HTMLInputElement | null;
const category = document.getElementById("examplesCategory") as HTMLSelectElement | null;
const categories = [...new Set(studioExamples.map(example => example.category))];
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
  for (const example of studioExamples.filter(item =>
    (!selectedCategory || item.category === selectedCategory) &&
    (!query || [item.title, item.description, item.category].join(" ").toLocaleLowerCase().includes(query))
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
      const presentation = (document.getElementById("presentation") as HTMLSelectElement)?.value as Presentation;
      const size = (document.getElementById("menuSize") as HTMLSelectElement)?.value as RodMenuSchema["size"];
      RodMenu.open(schemaForExample(example, presentation, size));
      const output = document.getElementById("exampleCode");
      if (output) output.textContent = JSON.stringify(schemaForExample(example, presentation, size), (_key, value) => typeof value === "function" ? "[callback]" : value instanceof Element ? `[Element: ${value.tagName}]` : value, 2);
    });
    card.append(title, description, categoryTag, document.createElement("hr"), button);
    catalog.appendChild(card);
  }
}
search?.addEventListener("input", renderExamples);
category?.addEventListener("change", renderExamples);
renderExamples();

const inspectorControls: Array<{ key: keyof RodInspectorOptions; label: string; kind: "boolean" | "number" | "select"; min?: number; max?: number }> = [
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
];
const inspectorPanel = document.getElementById("inspectorAdvanced");
if (inspectorPanel) {
  for (const control of inspectorControls) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:160px;flex:1";
    const caption = document.createElement("span");
    caption.textContent = control.label;
    const input = control.kind === "select" ? document.createElement("select") : document.createElement("input");
    if (control.kind === "select") {
      for (const theme of ["auto", "dark", "light"]) {
        const option = document.createElement("option");
        option.value = theme; option.textContent = theme;
        input.append(option);
      }
    } else {
      (input as HTMLInputElement).type = control.kind === "boolean" ? "checkbox" : "number";
      if (control.kind === "number") {
        (input as HTMLInputElement).min = String(control.min ?? 0);
        (input as HTMLInputElement).max = String(control.max ?? 10000);
      }
    }
    input.style.cssText = "background:var(--surface2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px;min-height:38px";
    const current = inspectorOptions()[control.key];
    if (control.kind === "boolean") (input as HTMLInputElement).checked = Boolean(current);
    else if (current !== undefined) input.value = String(current);
    input.addEventListener("change", () => {
      const value = control.kind === "boolean" ? (input as HTMLInputElement).checked :
        control.kind === "number" ? Number(input.value) : input.value;
      setInspectorOptions(previous => ({ ...previous, [control.key]: value }));
      const preview = document.getElementById("inspectorOptionsCode");
      if (preview) preview.textContent = JSON.stringify({ ...inspectorOptions(), expandDepth: depth() }, null, 2);
    });
    label.append(caption, input);
    inspectorPanel.append(label);
  }
}
document.getElementById("inspectorReset")?.addEventListener("click", () => {
  setInspectorOptions({ inspectDepth: 12, inspectItems: 1000, previewItems: 5, virtualize: true, theme: "dark" });
  inspectorPanel?.querySelectorAll("input,select").forEach((element, index) => {
    const control = inspectorControls[index];
    if (!control) return;
    const value = inspectorOptions()[control.key];
    if (element instanceof HTMLInputElement && element.type === "checkbox") element.checked = Boolean(value);
    else (element as HTMLInputElement | HTMLSelectElement).value = value === undefined ? "" : String(value);
  });
});
