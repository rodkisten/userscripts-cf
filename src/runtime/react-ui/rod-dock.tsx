/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  matches,
  readScriptRules,
  saveScriptRules,
  type ScriptRulesRecord,
} from "../../core/script-manager.js";
import { getDiagnostics } from "../diagnostics.js";

export type DockAction = { id: string; label: string; run: () => void; reorder?: (targetId: string) => void };
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
const DOCK_POSITION_KEY = "rod-dock:position";
const css = `
:host{all:initial;color-scheme:dark;font-family:ui-sans-serif,system-ui,sans-serif;position:fixed;inset:0;z-index:2147483646;pointer-events:none}
*{box-sizing:border-box}\n.rod-dock-root{position:fixed;inset:0;pointer-events:none}\n.rod-dock-root>*{pointer-events:auto}
.launcher{pointer-events:auto;position:fixed;right:0;top:46%;border:0;border-radius:12px 0 0 12px;padding:13px 10px;background:#7c3aed;color:white;box-shadow:0 4px 22px #0006;cursor:pointer}
.overlay{position:fixed;inset:0;background:#0009;z-index:2147483646;pointer-events:auto}
.panel{pointer-events:auto;position:fixed;top:0;right:0;bottom:0;width:min(420px,94vw);background:#09090b;color:#fafafa;border-left:1px solid #3f3f46;padding:18px;overflow:auto;z-index:2147483647;box-shadow:-12px 0 48px #0007}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
button{font:inherit;cursor:pointer}
.close,.action{border:1px solid #3f3f46;background:#27272a;color:#fafafa;border-radius:8px;padding:8px 10px}
.module{margin:10px 0;padding:12px;border:1px solid #27272a;border-radius:12px;background:#18181b}
.module summary{cursor:pointer;font-weight:600}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.action{font-size:13px}
.action[draggable="true"]{touch-action:none;user-select:none;cursor:grab}
.action[draggable="true"]:active{cursor:grabbing}
.action.drop-target{outline:2px solid #a78bfa;outline-offset:2px}
.script{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #27272a}
.script small{display:block;color:#a1a1aa;margin-top:3px}
input[type=checkbox]{accent-color:#a78bfa;width:18px;height:18px}
`;
function DockView({ controller }: { controller: DockController }) {
  const { scripts, modules, open, setOpen, portal } = controller;
  const [preferences, setPreferences] = useState<ScriptRulesRecord>(() => readScriptRules(localStorage));
  const [diagnostics, setDiagnostics] = useState(() => [...(getDiagnostics()?.history ?? [])]);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [position, setPosition] = useState(() => {
    const saved = Number(localStorage.getItem(DOCK_POSITION_KEY));
    return Number.isFinite(saved) && saved >= 12 && saved <= 88 ? saved : 46;
  });
  useEffect(() => { localStorage.setItem(DOCK_POSITION_KEY, String(position)); }, [position]);
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
      {!open && (
        <button
          className="launcher"
          style={{ top: `${position}%`, touchAction: "none" }}
          aria-label="Abrir Rod Dock"
          onPointerDown={(event) => {
            const startY = event.clientY;
            const start = position;
            const onMove = (next: PointerEvent) =>
              setPosition(Math.max(12, Math.min(88, start + ((next.clientY - startY) * 100) / innerHeight)));
            const onEnd = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onEnd);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onEnd, { once: true });
          }}
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal container={portal}>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="panel">
            <header>
              <Dialog.Title>Rod Dock</Dialog.Title>
              <Dialog.Close className="close" aria-label="Fechar">
                ✕
              </Dialog.Close>
            </header>
            <Dialog.Description>Gerencie scripts, ações e diagnósticos desta página.</Dialog.Description>
            <button className="action" onClick={() => { setSettingsSearch(search); setSettingsOpen(true); }}>
              Preferências
            </button>
            <details className="module" open>
              <summary>Scripts ({scripts.length})</summary>
              <input
                aria-label="Filtrar scripts"
                placeholder="Buscar script..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  marginTop: 10,
                  borderRadius: 8,
                  background: "#27272a",
                  color: "white",
                  border: "1px solid #3f3f46",
                }}
              />
              {scripts
                .filter((script) =>
                  `${script.name ?? ""} ${script.id}`
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
                )
                .map((script) => {
                  const enabled = preferences[script.id]?.enabled !== false;
                  const permitted = matches(
                    { ...script, name: script.name ?? script.id },
                    location.href,
                    preferences[script.id],
                  );
                  return (
                    <label className="script" key={script.id}>
                      <span>
                        {script.name ?? script.id}
                        <small>{!enabled ? "Desativado" : permitted ? "Permitido" : "Fora da página"}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => toggleScript(script.id, event.target.checked)}
                      />
                    </label>
                  );
                })}
            </details>
            {visibleModules.map((module) => (
              <details className="module" key={module.id}>
                <summary>{module.name}</summary>
                <div className="actions">
                  {module.actions.map((action) => (
                    <button
                      className={`action${dropTarget === action.id ? " drop-target" : ""}`}
                      key={action.id}
                      onClick={() => action.run()}
                      onPointerDown={(event) => {
                        if (!action.reorder || event.pointerType === "mouse") return;
                        const source = event.currentTarget;
                        const startX = event.clientX;
                        const startY = event.clientY;
                        let moved = false;
                        source.setPointerCapture(event.pointerId);
                        const move = (next: PointerEvent) => {
                          if (!moved && Math.hypot(next.clientX - startX, next.clientY - startY) < 10) return;
                          moved = true;
                          setDragging(action.id);
                          const target = source.getRootNode() instanceof ShadowRoot
                            ? (source.getRootNode() as ShadowRoot).elementFromPoint(next.clientX, next.clientY)
                            : document.elementFromPoint(next.clientX, next.clientY);
                          setDropTarget(target?.closest?.("[data-reorder-id]")?.getAttribute("data-reorder-id") ?? null);
                        };
                        const finish = (next: PointerEvent) => {
                          source.removeEventListener("pointermove", move);
                          source.removeEventListener("pointerup", finish);
                          source.removeEventListener("pointercancel", cancel);
                          const target = (source.getRootNode() as ShadowRoot).elementFromPoint(next.clientX, next.clientY);
                          const targetId = target?.closest?.("[data-reorder-id]")?.getAttribute("data-reorder-id");
                          setDragging(null);
                          setDropTarget(null);
                          if (moved && targetId && targetId !== action.id) action.reorder?.(targetId);
                        };
                        const cancel = () => { setDragging(null); setDropTarget(null); source.removeEventListener("pointermove", move); source.removeEventListener("pointerup", finish); };
                        source.addEventListener("pointermove", move);
                        source.addEventListener("pointerup", finish);
                        source.addEventListener("pointercancel", cancel, { once: true });
                      }}
                      data-reorder-id={action.reorder ? action.id : undefined}
                      aria-grabbed={action.reorder ? dragging === action.id : undefined}
                      style={action.reorder ? { touchAction: "none" } : undefined}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </details>
            ))}
            <details className="module">
              <summary>Diagnósticos ({diagnostics.length})</summary>
              <button
                className="action"
                onClick={() => {
                  const blob = new Blob(
                    [getDiagnostics()?.export() ?? JSON.stringify(diagnostics, null, 2)],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = "rod-script-diagnostics.json";
                  anchor.click();
                  queueMicrotask(() => URL.revokeObjectURL(url));
                }}
              >
                Exportar JSON
              </button>
              {diagnostics.slice(0, 30).map((item, index) => (
                <details className="module" key={index}>
                  <summary>{item.message}</summary>
                  <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {item.stack ?? item.message}
                  </pre>
                </details>
              ))}
            </details>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Dialog.Portal container={portal}>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="panel" aria-describedby={undefined}>
            <header>
              <Dialog.Title>Preferências do Rod Dock</Dialog.Title>
              <Dialog.Close className="close" aria-label="Fechar preferências">✕</Dialog.Close>
            </header>
            <label htmlFor="rod-dock-filter">Filtrar scripts</label>
            <input
              id="rod-dock-filter"
              type="search"
              value={settingsSearch}
              onChange={(event) => setSettingsSearch(event.target.value)}
              placeholder="Buscar script..."
              style={{ width: "100%", padding: 10, marginBlock: 12, borderRadius: 8, background: "#27272a", color: "white", border: "1px solid #3f3f46" }}
            />
            <div className="actions">
              <button className="action" onClick={() => { setSearch(settingsSearch); setSettingsOpen(false); }}>Aplicar</button>
              <Dialog.Close className="close">Cancelar</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
  const existing = document.querySelector<HTMLElement>("[data-rod-dock]");
  if (existing) existing.remove();
  const host = document.createElement("div");
  host.dataset.rodDock = "";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  const portalPoint = document.createElement("div");
  mountPoint.className = "rod-dock-root";
  portalPoint.className = "rod-dock-root";
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
      sharedMount?.dispose();
      host.remove();
      if (command != null && typeof gmMenu.GM_unregisterMenuCommand === "function")
        gmMenu.GM_unregisterMenuCommand(command);
    },
  };
}
