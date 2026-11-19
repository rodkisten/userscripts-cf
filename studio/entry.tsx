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

type ThemeState = { accent: string; radius: string; scale: string; presentation: string; menuSize: string; titleInput: string };
const themeDefaults: ThemeState = {
  accent: "#a78bfa", radius: "18", scale: "100", presentation: "bottom-sheet",
  menuSize: "md", titleInput: "Personalizar experiência",
};
const themeKeys = Object.keys(themeDefaults) as (keyof ThemeState)[];
const getTheme = (): ThemeState => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem("rod-ui-studio-theme") ?? "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored)
      ? Object.fromEntries(themeKeys.map((key) => [key, typeof (stored as Record<string, unknown>)[key] === "string"
        ? (stored as Record<string, string>)[key] : themeDefaults[key]])) as ThemeState
      : { ...themeDefaults };
  } catch { return { ...themeDefaults }; }
};
function ThemeController() {
  const [theme, setTheme] = useState<ThemeState>(getTheme);
  const [toast, setToast] = useState("");
  const update = (key: keyof ThemeState, value: string) => setTheme((previous) => ({ ...previous, [key]: value }));
  const tokens = `:root {\n  --accent: ${theme.accent};\n  --radius: ${theme.radius}px;\n  --scale: ${Number(theme.scale) / 100};\n  --bg: #101016;\n  --surface: #1b1a24;\n  --ink: #f8f7fc;\n}`;
  const schema = { id: "rod-ui-example", title: theme.titleInput, presentation: theme.presentation,
    size: theme.menuSize, fields: [
      { type: "text", name: "name", label: "Nome", value: "Minha configuração" },
      { type: "switch", name: "enabled", label: "Habilitado", value: true },
    ], actions: [{ id: "cancel", label: "Cancelar", role: "cancel" }, { id: "save", label: "Salvar", role: "submit" }] };
  const menuCode = `ctx.menu.open(${JSON.stringify(schema, null, 2)});`;
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--radius", theme.radius + "px");
    root.style.setProperty("--scale", String(Number(theme.scale) / 100));
    for (const key of themeKeys) {
      const control = document.getElementById(key) as HTMLInputElement | HTMLSelectElement | null;
      if (control && control.value !== theme[key]) control.value = theme[key];
    }
    const title = document.getElementById("menuTitle");
    if (title) title.textContent = theme.titleInput;
    const menu = document.getElementById("menuCode");
    if (menu) menu.textContent = menuCode;
    const tokenCode = document.getElementById("tokensCode");
    if (tokenCode) tokenCode.textContent = tokens;
    const preview = document.getElementById("menuPreview");
    if (preview) {
      const sizes: Record<string, string> = { sm: "300px", md: "430px", lg: "570px", xl: "690px", fullscreen: "100%" };
      preview.style.maxWidth = sizes[theme.menuSize] ?? sizes.md;
      preview.style.borderRadius = theme.presentation === "bottom-sheet"
        ? "var(--radius) var(--radius) 8px 8px" : "var(--radius)";
    }
    document.querySelectorAll<HTMLButtonElement>("#menuModes [data-mode]").forEach((button) =>
      button.setAttribute("aria-selected", String(button.dataset.mode === theme.presentation)));
    const swatches = document.getElementById("swatches");
    if (swatches) {
      swatches.replaceChildren();
      for (const [name, color] of [["Accent", theme.accent], ["Background", "#101016"],
        ["Surface", "#1b1a24"], ["Text", "#f8f7fc"]]) {
        const item = document.createElement("div");
        item.className = "swatch";
        const square = document.createElement("i");
        square.style.background = color;
        const label = document.createElement("strong");
        label.textContent = name;
        const value = document.createElement("div");
        value.className = "token";
        value.textContent = color;
        item.append(square, label, value);
        swatches.append(item);
      }
    }
    try { localStorage.setItem("rod-ui-studio-theme", JSON.stringify(theme)); } catch { /* storage optional */ }
  }, [theme, menuCode, tokens]);
  useEffect(() => {
    const cleanup: Array<() => void> = [];
    const listen = (selector: string, event: string, handler: EventListener) => {
      const element = document.querySelector(selector);
      if (!element) return;
      element.addEventListener(event, handler);
      cleanup.push(() => element.removeEventListener(event, handler));
    };
    for (const key of themeKeys) listen("#" + key, "input", (event) =>
      update(key, (event.target as HTMLInputElement).value));
    listen("#reset", "click", () => { setTheme({ ...themeDefaults }); setToast("Tema restaurado"); });
    listen("#menuModes", "click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-mode]");
      if (button?.dataset.mode) update("presentation", button.dataset.mode);
    });
    listen("#copyTheme", "click", () => void navigator.clipboard?.writeText(tokens));
    listen("#copyMenu", "click", () => void navigator.clipboard?.writeText(menuCode));
    listen("#cancelDemo", "click", () => setToast("Ação: cancelar"));
    listen("#saveDemo", "click", () => setToast("Ação: salvar"));
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-recipe]")) {
      const handler = () => {
        if (button.dataset.recipe === "network") {
          location.hash = "inspector";
          document.querySelector<HTMLButtonElement>('[data-object="response"]')?.click();
        } else {
          update("presentation", button.dataset.recipe === "mobile" ? "bottom-sheet" : "modal");
          location.hash = "menu";
        }
      };
      button.addEventListener("click", handler);
      cleanup.push(() => button.removeEventListener("click", handler));
    }
    return () => cleanup.forEach((remove) => remove());
  }, [tokens, menuCode]);
  useEffect(() => {
    const host = document.getElementById("toast");
    if (host) { host.textContent = toast; host.classList.toggle("hidden", !toast); }
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  return null;
}
const themeMount = document.createElement("div");
themeMount.id = "rod-studio-theme-root";
document.body.append(themeMount);
createRoot(themeMount).render(<ThemeController />);
const modeMount = document.getElementById("menuModes");
if (modeMount) {
  const modes = ["bottom-sheet", "modal", "drawer", "popover", "auto"];
  modeMount.replaceChildren(...modes.map((mode) => {
    const button = document.createElement("button");
    button.dataset.mode = mode;
    button.textContent = mode;
    return button;
  }));
}
