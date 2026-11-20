/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Drawer } from "vaul";
import * as Tabs from "@radix-ui/react-tabs";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Switch from "@radix-ui/react-switch";
import * as Select from "@radix-ui/react-select";
import * as Slider from "@radix-ui/react-slider";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Command } from "cmdk";
import Fuse from "fuse.js";
import { Settings2, Search, X, PanelRightOpen, RefreshCw, Activity, MousePointer2, Copy, Layers3, Terminal, Trash2 } from "lucide-react";
import { RodMenuHost } from "./index.js";
import {
  matches,
  readScriptRules,
  saveScriptRules,
  type ScriptRulesRecord,
} from "../../core/script-manager.js";
import { getDiagnostics } from "../diagnostics.js";

export type DockAction = { id: string; label: string; run: () => void };
export type DockModule = { id: string; name: string; actions: DockAction[] };
export type DockScript = {
  id: string;
  name?: string;
  matches?: string[];
  includes?: string[];
  exclude?: string[];
  excludeMatches?: string[];
  excludes?: string[];
};
type DockController = {
  modules: DockModule[];
  scripts: DockScript[];
  open: boolean;
  setOpen: (value: boolean) => void;
  portal: HTMLElement;
};
const css = `
:host{all:initial;color-scheme:dark;font-family:ui-sans-serif,system-ui,sans-serif}
*{box-sizing:border-box}
button,input{font:inherit}
.launcher{pointer-events:auto;position:fixed;border:1px solid #a78bfa55;border-radius:11px;width:32px;height:36px;padding:0;background:#6d28d9;color:white;box-shadow:0 3px 12px #0006;cursor:pointer;transition:opacity .18s ease;touch-action:none}
.overlay{position:fixed;inset:0;background:#0009;z-index:2147483646;pointer-events:auto}
.panel{pointer-events:auto;position:fixed;right:0;bottom:0;top:auto;width:min(440px,100vw);height:min(86dvh,780px);max-height:calc(100dvh - env(safe-area-inset-top));display:flex;flex-direction:column;overflow:hidden;background:#09090b;color:#fafafa;border:1px solid #3f3f46;border-radius:18px 18px 0 0;z-index:2147483647;box-shadow:0 0 48px #0008}
.handle{width:34px;height:4px;background:#71717a;border-radius:4px;margin:9px auto}
header{display:flex;align-items:center;justify-content:space-between;padding:4px 14px 10px;gap:8px}
.search{width:calc(100% - 28px);margin:0 14px 10px;padding:10px 12px;border:1px solid #3f3f46;border-radius:9px;background:#18181b;color:#fafafa;font-size:16px}
.tabs{display:flex;gap:3px;padding:0 10px 8px;overflow-x:auto;flex-shrink:0}
.tab{border:0;border-radius:8px;background:transparent;color:#a1a1aa;padding:8px 10px;font-size:12px;white-space:nowrap}
.tab[data-state=active]{background:#3b0764;color:white}
.scroll{flex:1;min-height:0;overflow:hidden}
.viewport{height:100%;width:100%;padding:8px 14px max(20px,env(safe-area-inset-bottom))}
.close,.action{border:1px solid #3f3f46;background:#27272a;color:#fafafa;border-radius:8px;padding:7px 9px;font-size:12px}
.module{margin:7px 0;padding:9px;border:1px solid #27272a;border-radius:10px;background:#18181b}
.module summary{cursor:pointer;font-weight:600;font-size:13px}
.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.script{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #27272a;font-size:13px}
.script small{display:block;color:#a1a1aa;margin-top:3px}
.setting{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;font-size:13px}
.setting input[type=range]{width:130px}
.searchWrap{display:flex;align-items:center;gap:8px;margin:0 14px 8px;padding:0 10px;border:1px solid #3f3f46;border-radius:9px;background:#18181b}
.searchWrap .search{margin:0;border:0;padding:10px 0;width:100%;outline:none;background:transparent}
.suggestions{max-height:135px;overflow:auto;padding:0 14px 8px}
.suggestion{padding:8px 10px;font-size:12px;cursor:pointer;border-radius:7px;color:#fafafa;outline:none}
.suggestion[data-selected=true],.suggestion[data-highlighted]{background:#3b0764}
.selectContent{background:#18181b;color:#fafafa;border:1px solid #3f3f46;border-radius:9px;padding:6px;z-index:2147483647}
.slider{position:relative;display:flex;align-items:center;width:125px;height:24px;touch-action:none}
.sliderTrack{position:relative;height:4px;background:#3f3f46;flex:1;border-radius:4px}
.sliderRange{position:absolute;height:100%;background:#a78bfa;border-radius:4px}
.sliderThumb{display:block;width:15px;height:15px;border-radius:50%;background:#fafafa;box-shadow:0 0 0 2px #6d28d9}
.networkHeader,.networkHeader span{display:flex;align-items:center;gap:8px;justify-content:space-between}
.networkHeader{font-size:12px}
.hint{font-size:11px;color:#a1a1aa;line-height:1.5}
.resourceDetail{font-size:11px;overflow-wrap:anywhere;color:#a1a1aa;margin-top:8px}
.action{display:inline-flex;align-items:center;gap:5px}
.domSearch{display:flex;gap:7px;margin:10px 0}
.domInput{min-width:0;flex:1;border:1px solid #3f3f46;border-radius:8px;padding:9px;background:#18181b;color:#fafafa;font-size:16px}
.domElement{display:block;width:100%;text-align:left;background:#18181b;color:#fafafa;border:1px solid #27272a;border-radius:8px;padding:9px;margin:5px 0;overflow-wrap:anywhere;font-size:12px}
.domElement small{display:block;color:#a1a1aa;margin-top:5px}
.domSource{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:230px;overflow:auto}
.consoleFilters{display:flex;gap:4px;overflow-x:auto;padding:8px 0}
.consoleFilters .action{font-size:11px;padding:5px 7px}
.consoleFilters [aria-pressed=true]{background:#581c87;border-color:#a78bfa}
.consoleLog{font-family:ui-monospace,monospace;font-size:11px;overflow-wrap:anywhere}
.consoleEntry{display:flex;align-items:flex-start;gap:7px;padding:7px 3px;border-bottom:1px solid #27272a}
.consoleEntry time{color:#71717a;white-space:nowrap}
.consoleEntry strong{min-width:32px}
.console-warn{color:#fbbf24}.console-error{color:#f87171}.console-info{color:#93c5fd}
@media(min-width:720px){.panel{top:8px;bottom:8px;right:8px;height:calc(100dvh - 16px);border-radius:16px}}
`;
function DockView({ controller }: { controller: DockController }) {
  const { scripts, modules, open, setOpen, portal } = controller;
  const [preferences, setPreferences] = useState<ScriptRulesRecord>(() => readScriptRules(localStorage));
  const [diagnostics, setDiagnostics] = useState(() => [...(getDiagnostics()?.history ?? [])]);
  const [search, setSearch] = useState("");
  type DockSide = "left" | "right";
  type DockSettings = { side: DockSide; position: number; scrollOpacity: number; fadeOnScroll: boolean };
  const storageKey = "rod:dock:settings:v2";
  const defaults: DockSettings = { side: "right", position: 46, scrollOpacity: 0.35, fadeOnScroll: true };
  const [settings, setSettings] = useState<DockSettings>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Partial<DockSettings>;
      return {
        side: stored.side === "left" ? "left" : "right",
        position: Math.max(10, Math.min(90, Number(stored.position ?? defaults.position))),
        scrollOpacity: Math.max(0.15, Math.min(1, Number(stored.scrollOpacity ?? defaults.scrollOpacity))),
        fadeOnScroll: stored.fadeOnScroll !== false,
      };
    } catch { return defaults; }
  });
  const [scrolling, setScrolling] = useState(false);
  const [tab, setTab] = useState("scripts");
  const [network, setNetwork] = useState<PerformanceResourceTiming[]>([]);
  type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
  type ConsoleEntry = { id: number; level: ConsoleLevel; time: number; message: string };
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleFilter, setConsoleFilter] = useState<ConsoleLevel | "all">("all");
  const [consoleExpression, setConsoleExpression] = useState("");
  const consoleSequence = useRef(0);
  const pushConsole = (level: ConsoleLevel, args: unknown[]) => {
    const message = args.map((value) => {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch { return String(value); }
    }).join(" ").slice(0, 4000);
    setConsoleEntries((previous) => [...previous.slice(-199), { id: ++consoleSequence.current, level, time: Date.now(), message }]);
  };
  const consoleListener = useRef(pushConsole);
  consoleListener.current = pushConsole;
  useEffect(() => {
    const methods: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];
    const originals = new Map<ConsoleLevel, (...args: unknown[]) => void>();
    const wrappers = new Map<ConsoleLevel, (...args: unknown[]) => void>();
    for (const level of methods) {
      const original = console[level];
      originals.set(level, original);
      const wrapped = (...args: unknown[]) => {
        original.apply(console, args);
        consoleListener.current(level, args);
      };
      wrappers.set(level, wrapped);
      try { console[level] = wrapped; } catch { /* console method may be immutable */ }
    }
    return () => {
      for (const level of methods) {
        const original = originals.get(level);
        if (original && console[level] === wrappers.get(level)) {
          try { console[level] = original; } catch { /* immutable console */ }
        }
      }
    };
  }, []);
  const inspectExpression = () => {
    const expression = consoleExpression.trim();
    if (!expression) return;
    pushConsole("info", [`> ${expression}`]);
    // Restricted property path inspection; no eval or arbitrary code execution.
    if (!/^(?:window|document|location|navigator)(?:\\.[a-zA-Z_$][\\w$]*){0,5}$/.test(expression)) {
      pushConsole("warn", ["Somente caminhos de propriedades globais são permitidos. Ex.: location.href"]);
      return;
    }
    try {
      const [root, ...keys] = expression.split(".");
      const roots: Record<string, unknown> = { window, document, location, navigator };
      const value = keys.reduce<unknown>((current, key) => current !== null && (typeof current === "object" || typeof current === "function") ? (current as Record<string, unknown>)[key] : undefined, roots[root]);
      pushConsole("log", [value]);
    } catch (error) { pushConsole("error", [error instanceof Error ? error.message : String(error)]); }
  };
  const [domSelector, setDomSelector] = useState("body");
  const [domMessage, setDomMessage] = useState("");
  const [domMatches, setDomMatches] = useState<Element[]>([]);
  const [domPicking, setDomPicking] = useState(false);
  const [drawerSide, setDrawerSide] = useState<"right" | "bottom">(() => window.innerWidth >= 720 ? "right" : "bottom");
  useEffect(() => {
    const onResize = () => setDrawerSide(window.innerWidth >= 720 ? "right" : "bottom");
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [domSelected, setDomSelected] = useState<Element | null>(null);
  const highlightRef = useRef<HTMLElement | null>(null);
  const queryDom = () => {
    try {
      const result = Array.from(document.querySelectorAll(domSelector)).slice(0, 100);
      setDomMatches(result);
      setDomMessage(result.length === 100 ? "Exibindo os primeiros 100 elementos." : `${result.length} elemento(s) encontrado(s).`);
    } catch (error) {
      setDomMatches([]);
      setDomMessage(error instanceof Error ? error.message : "Seletor inválido");
    }
  };
  const highlightElement = (element: Element | null) => {
    highlightRef.current?.remove();
    highlightRef.current = null;
    setDomSelected(element);
    if (!element?.isConnected) return;
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = `position:fixed;pointer-events:none;z-index:2147483645;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;outline:2px solid #a78bfa;background:#a78bfa33`;
    document.documentElement.append(overlay);
    highlightRef.current = overlay;
  };
  useEffect(() => () => highlightRef.current?.remove(), []);
  useEffect(() => { if (!open && !domPicking) highlightRef.current?.remove(); }, [open, domPicking]);
  useEffect(() => {
    if (!domPicking) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.composedPath()[0];
      if (!(target instanceof Element)) return;
      const root = target.getRootNode();
      if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot && root.host.hasAttribute("data-rod-dock")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = target.id ? `#${CSS.escape(target.id)}` : target.localName + Array.from(target.classList).slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("");
      setDomSelector(id);
      setDomMatches([target]);
      setDomMessage("Elemento selecionado da página.");
      highlightElement(target);
      setDomPicking(false);
      setTab("dom");
      setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setDomPicking(false); setOpen(true); } };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onPointer, true); document.removeEventListener("keydown", onKey, true); };
  }, [domPicking]);
  const refreshNetwork = () => setNetwork(performance.getEntriesByType("resource").filter((entry): entry is PerformanceResourceTiming => entry.entryType === "resource").slice(-100).reverse());
  useEffect(() => {
    if (!open || tab !== "network") return;
    refreshNetwork();
    if (typeof PerformanceObserver === "undefined") return;
    const observer = new PerformanceObserver(() => refreshNetwork());
    try { observer.observe({ type: "resource", buffered: true }); } catch { /* unsupported browser */ }
    return () => observer.disconnect();
  }, [open, tab]);
  const catalog = useMemo(() => [
    ...scripts.map((script) => ({ id: `script:${script.id}`, title: script.name ?? script.id, tab: "scripts" })),
    ...modules.flatMap((module) => module.actions.map((action) => ({ id: `action:${module.id}:${action.id}`, title: `${module.name} ${action.label}`, tab: "tools" }))),
    { id: "settings", title: "Configurações posição opacidade dock", tab: "settings" },
    { id: "diagnostics", title: "Diagnósticos exportar logs", tab: "diagnostics" },
    { id: "network", title: "Rede recursos requisições performance", tab: "network" },
    { id: "dom", title: "DOM inspecionar selecionar elemento CSS", tab: "dom" },
    { id: "console", title: "Console logs avisos erros depuração", tab: "console" },
  ], [scripts, modules]);
  const suggestions = useMemo(() => search.trim() ? new Fuse(catalog, { keys: ["title"], threshold: 0.38 }).search(search).slice(0, 8).map((hit) => hit.item) : [], [catalog, search]);
  const suppressClick = useRef(false);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* storage may be unavailable */ }
  }, [settings]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setScrolling(false), 240);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    const refresh = () => setDiagnostics([...(getDiagnostics()?.history ?? [])]);
    document.addEventListener("rod-diagnostics:change", refresh);
    const onRulesChange = () => setPreferences(readScriptRules(localStorage));
    document.addEventListener("rod-script-manager:change", onRulesChange);
    return () => {
      document.removeEventListener("rod-diagnostics:change", refresh);
      document.removeEventListener("rod-script-manager:change", onRulesChange);
    };
  }, []);
  const visibleModules = useMemo(() => {
    const grouped = new Map<string, DockModule>();
    for (const module of modules) {
      const key = module.name.trim().toLowerCase();
      const old = grouped.get(key);
      const actions = new Map((old?.actions ?? []).map((action) => [action.id, action]));
      for (const action of module.actions ?? []) actions.set(action.id, action);
      grouped.set(key, { ...module, actions: [...actions.values()] });
    }
    return [...grouped.values()];
  }, [modules]);
  const toggleScript = (id: string, enabled: boolean) => {
    const next = { ...preferences, [id]: { ...preferences[id], enabled } };
    setPreferences(next);
    saveScriptRules(localStorage, next);
    document.dispatchEvent(new CustomEvent("rod-script-manager:change"));
  };
  return (
    <>
      <style>{css}</style>
      <RodMenuHost />
      {!open && (
        <button className="launcher" style={{ top: `${settings.position}%`, [settings.side]: 0, opacity: scrolling && settings.fadeOnScroll ? settings.scrollOpacity : 1 }} aria-label="Abrir Rod Dock"
          onPointerDown={(event) => {
            const startY = event.clientY;
            const start = settings.position;
            let moved = false;
            const onMove = (next: PointerEvent) => {
              if (Math.abs(next.clientY - startY) > 6) moved = true;
              setSettings((prev) => ({ ...prev, position: Math.max(10, Math.min(90, start + ((next.clientY - startY) * 100) / innerHeight)) }));
            };
            const onEnd = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onEnd);
              if (moved) suppressClick.current = true;
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onEnd, { once: true });
          }}
          onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setOpen(true); }}
        ><PanelRightOpen size={16} /></button>
      )}
      <Drawer.Root open={open} onOpenChange={setOpen} direction={drawerSide}>
        <Drawer.Portal container={portal}>
          <Drawer.Overlay className="overlay" />
          <Drawer.Content className="panel" aria-describedby={undefined}>
            <div className="handle" aria-hidden="true" />
            <header><Drawer.Title>Rod Dock</Drawer.Title><button className="close" onClick={() => setOpen(false)} aria-label="Fechar Dock"><X size={16} /></button></header>
            <Drawer.Description style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>Ferramentas e configurações</Drawer.Description>
            <Command shouldFilter={false} label="Pesquisa global da Dock" style={{ flexShrink: 0 }}>
              <div className="searchWrap"><Search size={15} /><Command.Input className="search" aria-label="Buscar na Dock" placeholder="Buscar scripts, ações e ferramentas..." value={search} onValueChange={setSearch} /></div>
              {suggestions.length > 0 && <Command.List className="suggestions">{suggestions.map((item) => <Command.Item key={item.id} value={item.id} onSelect={() => { setTab(item.tab); if (item.id === "settings" || item.id === "diagnostics") setSearch(""); }} className="suggestion">{item.title}</Command.Item>)}</Command.List>}
            </Command>
            <Tabs.Root value={tab} onValueChange={setTab} style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
              <Tabs.List className="tabs" aria-label="Ferramentas da Dock">
                {["scripts", "tools", "console", "network", "dom", "diagnostics", "settings"].map((key) => <Tabs.Trigger className="tab" key={key} value={key}>{({ scripts: "Scripts", tools: "Ferramentas", console: "Console", network: "Rede", dom: "DOM", diagnostics: "Diagnósticos", settings: "Configurações" } as Record<string, string>)[key]}</Tabs.Trigger>)}
              </Tabs.List>
              <ScrollArea.Root className="scroll"><ScrollArea.Viewport className="viewport">
                <Tabs.Content value="scripts">
                  {scripts.filter((script) => `${script.name ?? ""} ${script.id}`.toLowerCase().includes(search.toLowerCase())).map((script) => {
                    const enabled = preferences[script.id]?.enabled !== false;
                    const permitted = matches({ ...script, name: script.name ?? script.id }, location.href, preferences[script.id]);
                    return <label className="script" key={script.id}><span>{script.name ?? script.id}<small>{!enabled ? "Desativado" : permitted ? "Permitido" : "Fora da página"}</small></span><input type="checkbox" checked={enabled} onChange={(event) => toggleScript(script.id, event.target.checked)} /></label>;
                  })}
                </Tabs.Content>
                <Tabs.Content value="tools">
                  {visibleModules.filter((module) => `${module.name} ${module.actions.map((a) => a.label).join(" ")}`.toLowerCase().includes(search.toLowerCase())).map((module) => <details className="module" key={module.id} open={Boolean(search)}><summary>{module.name}</summary><div className="actions">{module.actions.filter((action) => !search || `${module.name} ${action.label}`.toLowerCase().includes(search.toLowerCase())).map((action) => <button className="action" key={action.id} onClick={() => action.run()}>{action.label}</button>)}</div></details>)}
                </Tabs.Content>
                <Tabs.Content value="console">
                  <div className="networkHeader"><span><Terminal size={14} /> Console ({consoleEntries.length})</span><button className="action" onClick={() => setConsoleEntries([])}><Trash2 size={13} /> Limpar</button></div>
                  <div className="consoleFilters">{(["all", "log", "info", "warn", "error", "debug"] as const).map((level) => <button key={level} className="action" aria-pressed={consoleFilter === level} onClick={() => setConsoleFilter(level)}>{level}</button>)}</div>
                  <p className="hint">Captura mensagens emitidas após a montagem da Dock. O campo abaixo lê propriedades simples, sem executar JavaScript arbitrário.</p>
                  <form className="domSearch" onSubmit={(event) => { event.preventDefault(); inspectExpression(); }}><input className="domInput" value={consoleExpression} onChange={(event) => setConsoleExpression(event.target.value)} aria-label="Inspecionar propriedade global" placeholder="location.href" /><button className="action" type="submit">Inspecionar</button></form>
                  <div className="consoleLog" role="log" aria-live="off">{consoleEntries.filter((entry) => (consoleFilter === "all" || entry.level === consoleFilter) && entry.message.toLowerCase().includes(search.toLowerCase())).map((entry) => <div className={`consoleEntry console-${entry.level}`} key={entry.id}><time>{new Date(entry.time).toLocaleTimeString()}</time><strong>{entry.level}</strong><span>{entry.message}</span></div>)}</div>
                </Tabs.Content>
                <Tabs.Content value="network">
                  <div className="networkHeader"><span><Activity size={14} /> Recursos carregados ({network.length})</span><button className="action" onClick={refreshNetwork}><RefreshCw size={13} /> Atualizar</button></div>
                  <p className="hint">Resource Timing da página. Não inclui corpos, cabeçalhos ou todas as chamadas fetch/XHR.</p>
                  {network.filter((entry) => entry.name.toLowerCase().includes(search.toLowerCase())).map((entry, index) => <details className="module" key={`${entry.name}:${entry.startTime}:${index}`}><summary>{entry.initiatorType || "resource"} · {(() => { try { return new URL(entry.name).pathname || "/"; } catch { return entry.name; } })()}</summary><div className="resourceDetail">{entry.name}<p>Duração: {entry.duration.toFixed(1)} ms · Transferência: {entry.transferSize} bytes</p></div></details>)}
                  {network.length === 0 && <p className="hint">Nenhum recurso disponível no buffer de performance.</p>}
                </Tabs.Content>
                <Tabs.Content value="dom">
                  <div className="networkHeader"><span><Layers3 size={14} /> Inspetor DOM</span><button className="action" onClick={() => { setDomPicking(true); setOpen(false); }}><MousePointer2 size={13} /> Selecionar na página</button></div>
                  <p className="hint">Busque elementos por seletor CSS ou selecione um diretamente na página. Esc cancela a seleção.</p>
                  <form className="domSearch" onSubmit={(event) => { event.preventDefault(); queryDom(); }}><input className="domInput" aria-label="Seletor CSS" value={domSelector} onChange={(event) => setDomSelector(event.target.value)} placeholder="Ex.: main article" /><button className="action" type="submit">Buscar</button></form>
                  <p className="hint" role="status">{domMessage}</p>
                  {domMatches.filter((element) => element.isConnected).map((element, index) => <button key={index} className="domElement" onClick={() => highlightElement(element)}><span>{element.localName}{element.id ? `#${element.id}` : ""}{element.classList.length ? `.${Array.from(element.classList).slice(0, 2).join(".")}` : ""}</span><small>{element.textContent?.trim().slice(0, 90) || "(sem texto)"}</small></button>)}
                  {domSelected?.isConnected && <div className="module"><div className="networkHeader"><strong>Elemento selecionado</strong><button className="action" onClick={() => { void navigator.clipboard?.writeText(domSelected.outerHTML); }}><Copy size={13} /> Copiar HTML</button></div><pre className="domSource">{domSelected.outerHTML.slice(0, 12000)}</pre></div>}
                  <button className="action" onClick={() => { highlightRef.current?.remove(); highlightRef.current = null; setDomSelected(null); }}>Limpar destaque</button>
                </Tabs.Content>
                <Tabs.Content value="diagnostics">
                  <button className="action" onClick={() => {
                    const blob = new Blob([getDiagnostics()?.export() ?? JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "rod-script-diagnostics.json"; anchor.click();
                    queueMicrotask(() => URL.revokeObjectURL(url));
                  }}>Exportar JSON</button>
                  {diagnostics.filter((item) => item.message.toLowerCase().includes(search.toLowerCase())).slice(0, 30).map((item, index) => <details className="module" key={index}><summary>{item.message}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.stack ?? item.message}</pre></details>)}
                </Tabs.Content>
                <Tabs.Content value="settings">
                  <label className="setting">Lado<Select.Root value={settings.side} onValueChange={(value) => setSettings((prev) => ({ ...prev, side: value as DockSide }))}><Select.Trigger className="action" aria-label="Lado da Dock"><Select.Value /></Select.Trigger><Select.Portal container={portal}><Select.Content className="selectContent" position="popper"><Select.Viewport><Select.Item value="left" className="suggestion"><Select.ItemText>Esquerda</Select.ItemText></Select.Item><Select.Item value="right" className="suggestion"><Select.ItemText>Direita</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></label>
                  <label className="setting">Altura ({Math.round(settings.position)}%)<Slider.Root className="slider" min={10} max={90} value={[settings.position]} onValueChange={([value]) => setSettings((prev) => ({ ...prev, position: value }))}><Slider.Track className="sliderTrack"><Slider.Range className="sliderRange" /></Slider.Track><Slider.Thumb className="sliderThumb" aria-label="Altura da Dock" /></Slider.Root></label>
                  <label className="setting">Opacidade ao rolar ({Math.round(settings.scrollOpacity * 100)}%)<Slider.Root className="slider" min={15} max={100} value={[Math.round(settings.scrollOpacity * 100)]} onValueChange={([value]) => setSettings((prev) => ({ ...prev, scrollOpacity: value / 100 }))}><Slider.Track className="sliderTrack"><Slider.Range className="sliderRange" /></Slider.Track><Slider.Thumb className="sliderThumb" aria-label="Opacidade da Dock" /></Slider.Root></label>
                  <label className="setting">Diminuir opacidade ao rolar<Switch.Root checked={settings.fadeOnScroll} onCheckedChange={(value) => setSettings((prev) => ({ ...prev, fadeOnScroll: value }))} className="action">{settings.fadeOnScroll ? "Ativado" : "Desativado"}</Switch.Root></label>
                  <Tooltip.Provider><Tooltip.Root><Tooltip.Trigger asChild><button className="action" onClick={() => setSettings(defaults)}><Settings2 size={14} /> Restaurar posição padrão</button></Tooltip.Trigger><Tooltip.Portal container={portal}><Tooltip.Content className="selectContent">Restaurar preferências iniciais</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
                </Tabs.Content>
              </ScrollArea.Viewport></ScrollArea.Root>
            </Tabs.Root>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
type RegisterMenu = (caption: string, callback: () => void) => string | number | undefined;
type UnregisterMenu = (id: string | number) => void;
const gmMenu = globalThis as typeof globalThis & {
  GM_registerMenuCommand?: RegisterMenu;
  GM_unregisterMenuCommand?: UnregisterMenu;
};

export function installRodDock({
  modules = [],
  scripts = [],
  registerMenu = gmMenu.GM_registerMenuCommand,
  mountSharedReact,
}: {
  modules?: DockModule[];
  scripts?: DockScript[];
  registerMenu?: RegisterMenu;
  mountSharedReact: (
    component: ReactElement,
    container: HTMLElement,
  ) => { update: (component: ReactElement) => void; dispose: () => void };
}) {
  const host = document.createElement("div");
  host.dataset.rodDock = "";
  host.style.cssText = "position:fixed;inset:0;width:0;height:0;z-index:2147483646;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  const portalPoint = document.createElement("div");
  shadow.append(mountPoint, portalPoint);
  let sharedMount: ReturnType<NonNullable<typeof mountSharedReact>> | undefined;
  let disposed = false;
  let currentModules = modules;
  let isOpen = false;
  const render = () => {
    if (disposed) return;
    const view = (
      <DockView
        controller={{ modules: currentModules, scripts, open: isOpen, setOpen, portal: portalPoint }}
      />
    );
    if (sharedMount) sharedMount.update(view);
    else sharedMount = mountSharedReact(view, mountPoint);
  };
  const setOpen = (next: boolean) => {
    isOpen = next;
    render();
  };
  const setModules = (next: DockModule[]) => {
    currentModules = next;
    render();
  };
  const onRegistration = (event: Event) => {
    const detail = (event as CustomEvent<{ type: string; module?: DockModule; id?: string }>).detail;
    if (detail?.type === "register" && detail.module)
      setModules([...currentModules.filter((item) => item.id !== detail.module?.id), detail.module]);
    if (detail?.type === "unregister" && detail.id)
      setModules(currentModules.filter((item) => item.id !== detail.id));
  };
  const onMenu = (event: Event) => {
    const detail = (
      event as CustomEvent<{
        type: string;
        moduleId: string;
        id: string;
        label: string;
        callback: () => void;
      }>
    ).detail;
    if (!detail?.moduleId) return;
    const module = currentModules.find((item) => item.id === detail.moduleId) ?? {
      id: detail.moduleId,
      name: detail.moduleId,
      actions: [],
    };
    const actions = module.actions.filter((action) => action.id !== detail.id);
    if (detail.type === "register" && typeof detail.callback === "function")
      actions.push({ id: String(detail.id), label: detail.label, run: detail.callback });
    setModules([...currentModules.filter((item) => item.id !== module.id), { ...module, actions }]);
  };
  document.addEventListener("rod-dock:registry", onRegistration);
  document.addEventListener("rod-dock:menu", onMenu);
  (document.body ?? document.documentElement).append(host);
  render();
  const command =
    typeof registerMenu === "function" ? registerMenu("Abrir Rod Dock", () => setOpen(true)) : null;
  return {
    setModules,
    open: () => setOpen(true),
    close: () => setOpen(false),
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener("rod-dock:registry", onRegistration);
      document.removeEventListener("rod-dock:menu", onMenu);
      RodMenu.close();
      sharedMount?.dispose();
      host.remove();
      if (command != null && typeof gmMenu.GM_unregisterMenuCommand === "function")
        gmMenu.GM_unregisterMenuCommand(command);
    },
  };
}
