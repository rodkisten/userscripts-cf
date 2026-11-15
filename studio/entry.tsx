import { createSignal } from "solid-js";
import { render } from "@solidjs/web";
import { ObjectInspector } from "../src/runtime/solid-ui/object-inspector";
import { RodMenu } from "../src/runtime/solid-ui/menu";
import { studioExamples, schemaForExample } from "./examples";
import type { Presentation, RodMenuSchema } from "../src/runtime/solid-ui/menu/types";

type InspectorSample = "response" | "dom" | "settings";
const samples: Record<InspectorSample, unknown> = {
  response: { ok: true, status: 200, data: { user: { id: 42, name: "Rod", roles: ["developer", "admin"] }, items: [{ id: "a", active: true }, { id: "b", active: false }] }, durationMs: 127 },
  dom: document.querySelector("main") ?? document.body,
  settings: { theme: { accent: "#a78bfa", radius: 18 }, menu: { presentation: "bottom-sheet", size: "lg", scrollLock: true }, features: ["dock", "inspector", "menu"] },
};
const root = document.getElementById("tree");
if (!root) throw new Error("[Rod UI Studio] Missing inspector mount");
const [sample, setSample] = createSignal<InspectorSample>("response");
const [depth, setDepth] = createSignal(2);
const [filter, setFilter] = createSignal("");
const [revision, setRevision] = createSignal(0);
render(() => {
  const value = () => {
    const selected = samples[sample()];
    const term = filter().trim().toLowerCase();
    if (!term || !selected || typeof selected !== "object" || selected instanceof Element) return selected;
    return Object.fromEntries(Object.entries(selected).filter(([key, value]) => (key + " " + JSON.stringify(value)).toLowerCase().includes(term)));
  };
  return <div data-studio-inspector-revision={revision()}><ObjectInspector value={value()} options={{ expandDepth: depth(), inspectDepth: 12, inspectItems: 1000, previewItems: 5, virtualize: true, theme: "dark" }} /></div>;
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
      if (output) output.textContent = JSON.stringify({ ...schemaForExample(example, presentation, size), fields: example.fields.map(field => Object.fromEntries(Object.entries(field).filter(([,value]) => typeof value !== "function"))) }, null, 2);
    });
    card.append(title, description, categoryTag, document.createElement("hr"), button);
    catalog.appendChild(card);
  }
}
search?.addEventListener("input", renderExamples);
category?.addEventListener("change", renderExamples);
renderExamples();
