/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { RodMenu, RodMenuHost } from "../src/runtime/react-ui/index";
import { ObjectInspector } from "../src/runtime/react-ui/src/ObjectInspector";
import type { FieldDefinition, MenuSchema, SurfaceType } from "../src/runtime/react-ui/types";
import studioCss from "./studio.css?inline";
const studioStyle = document.createElement("style");
studioStyle.textContent = studioCss;
document.head.append(studioStyle);

type Demo = { id: string; title: string; group: string; description: string; fields: FieldDefinition[] };
const demos: Demo[] = [
  {
    id: "text",
    title: "Inputs",
    group: "Formulários",
    description: "Texto, email, senha, busca, URL e telefone",
    fields: ["text", "email", "password", "search", "url", "tel"].map((type) => ({
      id: type,
      type: type as FieldDefinition["type"],
      label: type,
      placeholder: "Digite aqui",
    })),
  },
  {
    id: "numbers",
    title: "Números e range",
    group: "Formulários",
    description: "Valores numéricos e sliders com limites",
    fields: [
      { id: "number", type: "number", label: "Quantidade", min: 0, max: 100, defaultValue: 42 },
      { id: "range", type: "range", label: "Intensidade", min: 0, max: 100, step: 5, defaultValue: 35 },
    ],
  },
  {
    id: "textarea",
    title: "Textarea",
    group: "Formulários",
    description: "Conteúdo longo e multilinha",
    fields: [{ id: "notes", type: "textarea", label: "Anotações", defaultValue: "Escreva suas ideias…" }],
  },
  {
    id: "selection",
    title: "Seleção",
    group: "Controles",
    description: "Select, checkbox e switch",
    fields: [
      {
        id: "quality",
        type: "select",
        label: "Qualidade",
        defaultValue: "auto",
        options: [
          { value: "auto", label: "Automática" },
          { value: "high", label: "Alta" },
          { value: "low", label: "Econômica" },
        ],
      },
      { id: "enabled", type: "switch", label: "Ativado", defaultValue: true },
      { id: "remember", type: "checkbox", label: "Lembrar escolha" },
    ],
  },
  {
    id: "account",
    title: "Formulário completo",
    group: "Receitas",
    description: "Combina campos, persistência e ações",
    fields: [
      { id: "name", type: "text", label: "Nome", defaultValue: "Rod" },
      { id: "email", type: "email", label: "Email", placeholder: "nome@exemplo.com" },
      { id: "bio", type: "textarea", label: "Bio" },
      { id: "public", type: "switch", label: "Perfil público", defaultValue: true },
    ],
  },
];
const surfaces: SurfaceType[] = ["bottom-sheet", "modal", "drawer", "popover"];
function serialize(value: unknown) {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(
      value,
      (_key, item: unknown) => {
        if (typeof item === "bigint" || typeof item === "symbol" || typeof item === "function")
          return String(item);
        if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
        if (item instanceof Map) return { type: "Map", entries: [...item] };
        if (item instanceof Set) return { type: "Set", values: [...item] };
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
function CodeMirrorSource({ code }: { code: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          EditorView.lineWrapping,
          EditorView.editable.of(false),
          javascript({ typescript: true }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          oneDark,
        ],
      }),
    });
    return () => view.destroy();
  }, [code]);
  return <div className="studio-code" ref={host} aria-label="Código de exemplo no CodeMirror 6" />;
}
function Studio() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("account");
  const [surface, setSurface] = useState<SurfaceType>("bottom-sheet");
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [persist, setPersist] = useState(false);
  const [title, setTitle] = useState("Rod UI");
  const [tab, setTab] = useState<"code" | "inspector">("code");
  const [depth, setDepth] = useState(2);
  const [lastAction, setLastAction] = useState<Record<string, unknown>>({ status: "Pronto para testar" });
  const [copied, setCopied] = useState(false);
  const demo = demos.find((item) => item.id === selected) ?? demos[0]!;
  const schema: MenuSchema = useMemo(
    () => ({
      id: "studio-" + demo.id,
      title,
      description: demo.description,
      presentation: surface,
      persistKey: persist ? "studio-" + demo.id : undefined,
      fields: demo.fields,
      actions: [
        { id: "cancel", label: "Cancelar", role: "cancel", variant: "secondary" },
        { id: "reset", label: "Limpar", variant: "secondary", onClick: ({ reset }) => reset() },
        {
          id: "save",
          label: "Salvar",
          role: "submit",
          onClick: ({ values, close }) => {
            setLastAction({ action: "save", demo: demo.id, values });
            close();
          },
        },
      ],
    }),
    [demo, title, surface, persist],
  );
  const code = useMemo(
    () =>
      'import { RodMenu } from "@rod/runtime/react-ui";\n\nRodMenu.open(' +
      serialize({ ...schema, actions: schema.actions?.map(({ onClick, ...action }) => action) }) +
      ");",
    [schema],
  );
  const filtered = demos.filter((item) =>
    (item.title + " " + item.group + " " + item.description).toLowerCase().includes(query.toLowerCase()),
  );
  const open = () => RodMenu.open(schema);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };
  return (
    <div className="studio-shell">
      <aside className="studio-side">
        <div className="studio-brand">
          <span>✳</span> Rod UI <small>React Studio</small>
        </div>
        <label className="studio-label" htmlFor="studio-search">
          Buscar componentes
        </label>
        <input
          id="studio-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar…"
        />
        {["Formulários", "Controles", "Receitas"].map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            {filtered
              .filter((item) => item.group === group)
              .map((item) => (
                <button
                  key={item.id}
                  className={selected === item.id ? "studio-active" : ""}
                  onClick={() => setSelected(item.id)}
                >
                  {item.title}
                  <small>{item.description}</small>
                </button>
              ))}
          </section>
        ))}
        <div className="studio-side-note">React 19 · Radix · CodeMirror 6</div>
      </aside>
      <main className="studio-main">
        <header className="studio-top">
          <div>
            <span className="studio-eyebrow">COMPONENT PLAYGROUND</span>
            <h1>{demo.title}</h1>
            <p>{demo.description}</p>
          </div>
          <button className="studio-primary" onClick={open}>
            Abrir componente ↗
          </button>
        </header>
        <div className="studio-grid">
          <section className="studio-panel">
            <h2>Propriedades</h2>
            <label>
              Título
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              Apresentação
              <select value={surface} onChange={(event) => setSurface(event.target.value as SurfaceType)}>
                {surfaces.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={persist}
                onChange={(event) => setPersist(event.target.checked)}
              />{" "}
              Persistir valores
            </label>
            <h2>Viewport</h2>
            <div className="studio-segments">
              <button aria-pressed={device === "phone"} onClick={() => setDevice("phone")}>
                📱 Mobile
              </button>
              <button aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
                ▣ Desktop
              </button>
            </div>
            <p className="studio-hint">
              O menu é aberto como portal React real. O viewport é uma prévia das dimensões, não um iframe
              simulado.
            </p>
          </section>
          <section className="studio-panel studio-preview">
            <div className="studio-panel-head">
              <h2>Preview</h2>
              <span>{device === "phone" ? "390 × 720" : "Desktop"}</span>
            </div>
            <div className={"studio-device " + device}>
              <div className="studio-device-bar">
                <span>9:41</span>
                <span>●●●</span>
              </div>
              <div className="studio-device-content">
                <span className="studio-eyebrow">LIVE COMPONENT</span>
                <h3>{title}</h3>
                <p>{demo.description}</p>
                <button className="studio-primary" onClick={open}>
                  Testar {surface}
                </button>
                <small>
                  {demo.fields.length} campos · {schema.actions?.length} ações
                </small>
              </div>
            </div>
          </section>
        </div>
        <section className="studio-panel studio-output">
          <div className="studio-panel-head">
            <div className="studio-segments">
              <button aria-pressed={tab === "code"} onClick={() => setTab("code")}>
                Código
              </button>
              <button aria-pressed={tab === "inspector"} onClick={() => setTab("inspector")}>
                Inspector
              </button>
            </div>
            <button onClick={copy}>{copied ? "✓ Copiado" : "Copiar código"}</button>
          </div>
          {tab === "code" ? (
            <CodeMirrorSource code={code} />
          ) : (
            <>
              <div className="studio-segments">
                <button onClick={() => setDepth(20)}>Expandir</button>
                <button onClick={() => setDepth(0)}>Recolher</button>
              </div>
              <ObjectInspector
                key={depth}
                data={{ schema, lastAction }}
                options={{ expandDepth: depth, inspectDepth: 12, inspectItems: 1000, theme: "dark" }}
              />
            </>
          )}
        </section>
        <footer>Rod UI Studio · React-only · Componentes reais, sem legado Solid</footer>
      </main>
      <RodMenuHost />
    </div>
  );
}
const mount = document.getElementById("studio-root");
if (!mount) throw new Error("[Rod UI Studio] Missing #studio-root");
createRoot(mount).render(<Studio />);
