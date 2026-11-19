/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RodMenu, RodMenuHost } from "../src/runtime/react-ui/index";
import { ObjectInspector } from "../src/runtime/react-ui/src/ObjectInspector";
import { studioExamples, schemaForExample } from "./examples";
import type { MenuSchema } from "../src/runtime/react-ui/types";

type InspectorSample = "response" | "dom" | "settings" | "syntax";
const samples: Record<InspectorSample, unknown> = {
  response: { ok: true, status: 200, data: { user: { id: 42, name: "Rod", roles: ["developer", "admin"] }, items: [{ id: "a", active: true }, { id: "b", active: false }] }, durationMs: 127 },
  dom: document.querySelector("main") ?? document.body,
  settings: { theme: { accent: "#a78bfa", radius: 18 }, menu: { presentation: "bottom-sheet", size: "lg" }, features: ["dock", "inspector", "menu"] },
  syntax: { string: "Hello, syntax!", number: 42, bigint: 9007199254740993n, boolean: true, nil: null, missing: undefined, array: [1, "two", false], map: new Map([["key", 12]]), set: new Set(["one", "two"]), date: new Date("2026-11-15T12:00:00Z"), regexp: /syntax\\s+highlight/gi, error: new TypeError("Example error") },
};
const root = document.getElementById("tree");
if (!root) throw new Error("[Rod UI Studio] Missing inspector mount");
const inspectorControls = ["inspectDepth", "inspectItems", "previewItems", "virtualize", "theme"] as const;
const defaultOptions = { inspectDepth: 12, inspectItems: 1000, previewItems: 5, virtualize: true, theme: "dark" as const };
function safeSource(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "bigint" || typeof item === "symbol" || typeof item === "function") return String(item);
    if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
    if (item instanceof Map) return Object.fromEntries(item);
    if (item instanceof Set) return [...item];
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  }, 2) ?? "undefined";
}
function SourceEditor({ text }: { text: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;
    void Promise.all([
      import("@codemirror/state"),
      import("@codemirror/view"),
      import("@codemirror/lang-javascript"),
      import("@codemirror/language"),
      import("@codemirror/theme-one-dark"),
    ]).then(([{ EditorState }, { EditorView, lineNumbers }, { javascript }, { syntaxHighlighting, defaultHighlightStyle }, { oneDark }]) => {
      if (disposed || !host.current) return;
      const view = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: text,
          extensions: [lineNumbers(), EditorView.lineWrapping, EditorView.editable.of(false), javascript(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }), oneDark],
        }),
      });
      destroy = () => view.destroy();
    }).catch(error => { if (host.current && !disposed) host.current.textContent = String(error); });
    return () => { disposed = true; destroy?.(); };
  }, [text]);
  return <div ref={host} aria-label="CodeMirror Source Editor" />;
}
function StudioInspector() {
  const [sample, setSample] = useState<InspectorSample>("response");
  const [depth, setDepth] = useState(2);
  const [filter, setFilter] = useState("");
  const [revision, setRevision] = useState(0);
  const [inspectorOptions, setInspectorOptions] = useState(defaultOptions);
  const selected = samples[sample];
  const value = filter.trim() && selected && typeof selected === "object" && !(selected instanceof Element)
    ? Object.fromEntries(Object.entries(selected).filter(([key]) => key.toLowerCase().includes(filter.trim().toLowerCase())))
    : selected;
  return <div>
    <div data-studio-inspector-revision={revision}>
      <ObjectInspector key={revision + ":" + sample} data={value} options={{ ...inspectorOptions, expandDepth: depth }} />
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      <input aria-label="Filtrar propriedades" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar propriedades" />
      <button onClick={() => setDepth(20)}>Expandir</button>
      <button onClick={() => { setDepth(0); setRevision(v => v + 1); }}>Recolher</button>
      <button onClick={() => navigator.clipboard?.writeText(safeSource(selected))}>Copiar JSON</button>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      {(Object.keys(samples) as InspectorSample[]).map(key => <button key={key} aria-selected={sample === key} onClick={() => setSample(key)}>{key}</button>)}
    </div>
    <details style={{ marginTop: 16 }}><summary>Configurações do inspector</summary>
      {inspectorControls.map(key => <label key={key} style={{ display: "block", margin: 8 }}>{key}: <input type={key === "virtualize" ? "checkbox" : key === "theme" ? "text" : "number"} checked={key === "virtualize" ? inspectorOptions.virtualize : undefined} value={key === "virtualize" ? undefined : String(inspectorOptions[key])} onChange={event => setInspectorOptions(previous => ({ ...previous, [key]: key === "virtualize" ? event.target.checked : key === "theme" ? event.target.value as "dark" : Number(event.target.value) }))} /></label>)}
      <button onClick={() => setInspectorOptions(defaultOptions)}>Restaurar</button>
      <pre>{JSON.stringify({ ...inspectorOptions, expandDepth: depth }, null, 2)}</pre>
    </details>
    <details><summary>CodeMirror · Source / Stack trace</summary><SourceEditor text={safeSource(selected)} /></details>
  </div>;
}
createRoot(root).render(<><StudioInspector /><RodMenuHost /></>);

function presentation(): MenuSchema["presentation"] {
  const value = (document.getElementById("presentation") as HTMLSelectElement | null)?.value;
  return value === "modal" || value === "drawer" || value === "popover" || value === "bottom-sheet" ? value : "bottom-sheet";
}
document.getElementById("menuLive")?.addEventListener("click", () => {
  const title = (document.getElementById("titleInput") as HTMLInputElement | null)?.value || "RodMenu";
  RodMenu.open({
    id: "rod-ui-studio-live-menu", title, presentation: presentation(),
    description: "Instância real do RodMenu React",
    fields: [
      { type: "text", name: "name", label: "Nome", value: "Minha configuração" },
      { type: "switch", name: "enabled", label: "Habilitado", value: true },
      { type: "select", name: "quality", label: "Qualidade", options: [{ value: "auto", label: "Automática" }, { value: "high", label: "Alta" }] },
    ],
    actions: [{ id: "cancel", label: "Cancelar", role: "cancel" }, { id: "save", label: "Salvar", role: "submit", onClick: ({ close }) => close() }],
  });
});
const catalog = document.getElementById("examplesCatalog");
const search = document.getElementById("examplesSearch") as HTMLInputElement | null;
const category = document.getElementById("examplesCategory") as HTMLSelectElement | null;
for (const name of new Set(studioExamples.map(example => example.category))) {
  if (!category) break;
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  category.append(option);
}
function renderExamples() {
  if (!catalog) return;
  catalog.replaceChildren();
  const query = search?.value.trim().toLocaleLowerCase() ?? "";
  const selectedCategory = category?.value ?? "";
  for (const example of studioExamples.filter(item => (!selectedCategory || item.category === selectedCategory) && (!query || [item.title, item.description, item.category].join(" ").toLocaleLowerCase().includes(query)))) {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = example.title;
    const description = document.createElement("p");
    description.textContent = example.description;
    const button = document.createElement("button");
    button.className = "primary";
    button.textContent = "Abrir instância real";
    button.addEventListener("click", () => {
      const schema = schemaForExample(example, presentation(), (document.getElementById("menuSize") as HTMLSelectElement | null)?.value);
      RodMenu.open(schema);
      const output = document.getElementById("exampleCode");
      if (output) output.textContent = safeSource(schema);
    });
    card.append(title, description, button);
    catalog.append(card);
  }
}
search?.addEventListener("input", renderExamples);
category?.addEventListener("change", renderExamples);
renderExamples();
