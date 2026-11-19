import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { studioExamples } from "./examples";

type Sample = "response" | "dom" | "settings" | "syntax";
const samples: Record<Sample, unknown> = {
  response: { ok: true, status: 200, data: { user: { id: 42, name: "Rod" }, items: [1, 2, 3] } },
  dom: { element: "main", attributes: { role: "main" } },
  settings: { theme: { accent: "#a78bfa", radius: 18 }, features: ["inspector", "menu"] },
  syntax: { string: "Hello, syntax!", number: 42, boolean: true, nil: null, array: [1, "two", false] },
};
const sampleNames = Object.keys(samples) as Sample[];
const stringify = (value: unknown) => JSON.stringify(value, null, 2) ?? "undefined";

function Inspector() {
  const [sample, setSample] = useState<Sample>("response");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [depth, setDepth] = useState(2);
  const source = useMemo(() => {
    const value = samples[sample];
    if (!filter.trim() || !value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).filter(([key, item]) =>
        (key + " " + String(item)).toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    );
  }, [sample, filter]);
  const serialized = stringify(source);
  useEffect(() => {
    const listeners: Array<() => void> = [];
    const listen = (element: Element | null, event: string, handler: EventListener) => {
      if (!element) return;
      element.addEventListener(event, handler);
      listeners.push(() => element.removeEventListener(event, handler));
    };
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-object]")) {
      listen(button, "click", () => {
        const next = button.dataset.object;
        if (next && sampleNames.includes(next as Sample)) setSample(next as Sample);
      });
      button.setAttribute("aria-selected", String(button.dataset.object === sample));
    }
    const input = document.getElementById("filter") as HTMLInputElement | null;
    if (input) {
      input.value = filter;
      listen(input, "input", () => setFilter(input.value));
    }
    const selector = document.getElementById("depth") as HTMLSelectElement | null;
    if (selector) {
      selector.value = String(depth);
      listen(selector, "change", () => setDepth(Number(selector.value)));
    }
    listen(document.getElementById("expand"), "click", () => setExpanded(true));
    listen(document.getElementById("collapse"), "click", () => setExpanded(false));
    listen(document.getElementById("copyObject"), "click", () => {
      void navigator.clipboard?.writeText(serialized);
    });
    return () => listeners.forEach((remove) => remove());
  }, [sample, filter, depth, serialized]);
  return (
    <div data-rod-studio="react" data-depth={depth}>
      <div role="status" aria-live="polite">
        {sample} · {Object.keys(source as object).length} propriedades
      </div>
      {expanded ? (
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          <code>{serialized}</code>
        </pre>
      ) : (
        <p>Visualização recolhida. Use Expandir tudo para abrir.</p>
      )}
    </div>
  );
}

function Catalog() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(studioExamples.map((item) => item.category))], []);
  const filtered = useMemo(
    () =>
      studioExamples.filter(
        (item) =>
          (!category || item.category === category) &&
          (!search ||
            [item.title, item.description, item.category]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [search, category],
  );
  useEffect(() => {
    const input = document.getElementById("examplesSearch") as HTMLInputElement | null;
    const select = document.getElementById("examplesCategory") as HTMLSelectElement | null;
    if (select)
      select.replaceChildren(
        new Option("Todas as categorias", ""),
        ...categories.map((name) => new Option(name, name)),
      );
    const onSearch = () => setSearch(input?.value ?? "");
    const onCategory = () => setCategory(select?.value ?? "");
    input?.addEventListener("input", onSearch);
    select?.addEventListener("change", onCategory);
    return () => {
      input?.removeEventListener("input", onSearch);
      select?.removeEventListener("change", onCategory);
    };
  }, [categories]);
  useEffect(() => {
    const output = document.getElementById("exampleCode");
    if (output)
      output.textContent = selected
        ? stringify(studioExamples.find((item) => item.id === selected))
        : "Selecione um exemplo para inspecionar o schema.";
  }, [selected]);
  return (
    <div data-rod-catalog="react">
      <p>{filtered.length} exemplos de schema. A prévia interativa dos componentes ainda está em migração.</p>
      {filtered.map((item) => (
        <article className="card" key={item.id}>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <span className="token">{item.category}</span>
          <button type="button" onClick={() => setSelected(item.id)}>
            Inspecionar schema
          </button>
        </article>
      ))}
    </div>
  );
}

const inspectorMount = document.getElementById("tree");
if (!inspectorMount) throw new Error("[Rod UI Studio] Missing #tree mount");
createRoot(inspectorMount).render(<Inspector />);
const catalogMount = document.getElementById("examplesCatalog");
if (catalogMount) createRoot(catalogMount).render(<Catalog />);
