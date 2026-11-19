/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Dialog from "@radix-ui/react-dialog";
import { RodMenu, RodMenuHost } from "./index.js";
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
.script{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #27272a}
.script small{display:block;color:#a1a1aa;margin-top:3px}
input[type=checkbox]{accent-color:#a78bfa;width:18px;height:18px}
`;
function DockView({ controller }: { controller: DockController }) {
  const { scripts, modules, open, setOpen, portal } = controller;
  const [preferences, setPreferences] = useState<ScriptRulesRecord>(() => readScriptRules(localStorage));
  const [diagnostics, setDiagnostics] = useState(() => [...(getDiagnostics()?.history ?? [])]);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState(46);
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
            <button
              className="action"
              onClick={() => {
                setOpen(false);
                RodMenu.open({
                  id: "rod-dock-settings",
                  title: "Preferências do Rod Dock",
                  surface: "modal",
                  fields: [{ id: "filter", type: "search", label: "Filtrar scripts", defaultValue: search }],
                  actions: [
                    {
                      id: "apply",
                      label: "Aplicar",
                      onClick: ({ values, close }) => {
                        setSearch(String(values.filter ?? ""));
                        close();
                      },
                    },
                    { id: "cancel", label: "Cancelar", role: "cancel", variant: "secondary" },
                  ],
                });
              }}
            >
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
                    <button className="action" key={action.id} onClick={() => action.run()}>
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
}: {
  modules?: DockModule[];
  scripts?: DockScript[];
  registerMenu?: RegisterMenu;
} = {}) {
  const host = document.createElement("div");
  host.dataset.rodDock = "";
  host.style.cssText = "position:fixed;inset:0;width:0;height:0;z-index:2147483646;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  const portalPoint = document.createElement("div");
  shadow.append(mountPoint, portalPoint);
  const root = createRoot(mountPoint);
  let disposed = false;
  let currentModules = modules;
  let isOpen = false;
  const render = () => {
    if (disposed) return;
    root.render(
      <DockView
        controller={{ modules: currentModules, scripts, open: isOpen, setOpen, portal: portalPoint }}
      />,
    );
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
      root.unmount();
      host.remove();
      if (command != null && typeof gmMenu.GM_unregisterMenuCommand === "function")
        gmMenu.GM_unregisterMenuCommand(command);
    },
  };
}
