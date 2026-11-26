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

export type DockAction = {
  id: string;
  label: string;
  run: () => void;
  reorder?: (targetId: string) => void;
};

export type DockModule = {
  id: string;
  name: string;
  actions: DockAction[];
};

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

type RegisterMenu = (caption: string, callback: () => void) => string | number | undefined;
type UnregisterMenu = (id: string | number) => void;

const DOCK_POSITION_KEY = "rod-dock:position";

const css = `
  :host {
    --rd-bg-panel: #09090b;
    --rd-bg-surface: #18181b;
    --rd-bg-control: #27272a;
    --rd-bg-control-hover: #323238;
    --rd-bg-overlay: rgba(0, 0, 0, 0.6);

    --rd-glass-bg: rgba(24, 24, 27, 0.58);
    --rd-glass-bg-hover: rgba(39, 39, 42, 0.78);
    --rd-glass-border: rgba(255, 255, 255, 0.16);
    --rd-glass-highlight: rgba(255, 255, 255, 0.22);

    --rd-border-subtle: #27272a;
    --rd-border-strong: #3f3f46;

    --rd-text-primary: #fafafa;
    --rd-text-secondary: #a1a1aa;
    --rd-text-muted: #71717a;

    --rd-accent: #7c3aed;
    --rd-accent-hover: #6d28d9;
    --rd-accent-soft: #a78bfa;

    --rd-font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --rd-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --rd-font-xs: 11px;
    --rd-font-sm: 12px;
    --rd-font-base: 13px;
    --rd-font-title: 15px;

    --rd-radius-sm: 6px;
    --rd-radius-md: 8px;
    --rd-radius-lg: 10px;
    --rd-radius-launcher: 11px 0 0 11px;

    --rd-z-base: 2147483646;
    --rd-z-top: 2147483647;

    --rd-shadow-panel: -12px 0 40px rgba(0, 0, 0, 0.55);
    --rd-shadow-launcher:
      0 6px 20px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 var(--rd-glass-highlight);

    all: initial;
    color-scheme: dark;
    font-family: var(--rd-font-family);
    font-size: var(--rd-font-base);
    line-height: 1.4;
    color: var(--rd-text-primary);
    position: fixed;
    inset: 0;
    z-index: var(--rd-z-base);
    pointer-events: none;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .rod-dock-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .rod-dock-root > * {
    pointer-events: auto;
  }

  button,
  input {
    font-family: inherit;
    font-size: var(--rd-font-sm);
    color: inherit;
  }

  button {
    cursor: pointer;
  }

  .launcher {
    pointer-events: auto;
    position: fixed;
    right: 0;
    top: 46%;
    z-index: var(--rd-z-top);
    touch-action: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 30px;
    padding: 0 2px 0 4px;
    border: 1px solid var(--rd-glass-border);
    border-right: 0;
    border-radius: var(--rd-radius-launcher);
    background: var(--rd-glass-bg);
    -webkit-backdrop-filter: blur(14px) saturate(160%);
    backdrop-filter: blur(14px) saturate(160%);
    color: rgba(250, 250, 250, 0.9);
    font-size: 11px;
    line-height: 1;
    box-shadow: var(--rd-shadow-launcher);
    opacity: 0.92;
    transform: translateX(0);
    transition:
      opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      background-color 0.18s ease,
      border-color 0.18s ease;
  }

  .launcher.launcher--scrolling {
    opacity: 0.14;
    transform: translateX(4px);
  }

  .launcher:hover,
  .launcher:focus-visible,
  .launcher:active {
    opacity: 1;
    transform: translateX(0);
    background: var(--rd-glass-bg-hover);
    border-color: rgba(167, 139, 250, 0.45);
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: var(--rd-bg-overlay);
    z-index: var(--rd-z-base);
    pointer-events: auto;
  }

  .overlay--secondary {
    z-index: var(--rd-z-top);
  }

  .panel {
    pointer-events: auto;
    position: fixed;
    top: 0;
    right: 0;
    width: min(390px, 94vw);
    height: 100vh;
    max-height: 100vh;
    height: 100dvh;
    max-height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--rd-bg-panel);
    color: var(--rd-text-primary);
    border-left: 1px solid var(--rd-border-strong);
    z-index: var(--rd-z-top);
    box-shadow: var(--rd-shadow-panel);
  }

  .panel-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: calc(14px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 10px 16px;
    border-bottom: 1px solid var(--rd-border-subtle);
  }

  .panel-title {
    margin: 0;
    font-size: var(--rd-font-title);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .panel-description {
    margin: 0 0 12px;
    font-size: var(--rd-font-sm);
    color: var(--rd-text-secondary);
  }

  .panel-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    padding: 14px calc(16px + env(safe-area-inset-right, 0px)) calc(24px + env(safe-area-inset-bottom, 0px)) 16px;
  }

  .panel-body::-webkit-scrollbar {
    width: 6px;
  }

  .panel-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .panel-body::-webkit-scrollbar-thumb {
    background: var(--rd-border-strong);
    border-radius: 999px;
  }

  .btn {
    border: 1px solid var(--rd-border-strong);
    background: var(--rd-bg-control);
    color: var(--rd-text-primary);
    border-radius: var(--rd-radius-md);
    padding: 6px 10px;
    font-size: var(--rd-font-sm);
    line-height: 1.3;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .btn:hover {
    background: var(--rd-bg-control-hover);
  }

  .btn--icon {
    padding: 5px 8px;
    font-size: var(--rd-font-base);
    line-height: 1;
  }

  .btn[data-reorder-id] {
    touch-action: none;
    user-select: none;
    cursor: grab;
  }

  .btn[data-reorder-id]:active {
    cursor: grabbing;
  }

  .btn.drop-target {
    outline: 2px solid var(--rd-accent-soft);
    outline-offset: 2px;
  }

  .input {
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--rd-radius-md);
    background: var(--rd-bg-control);
    color: var(--rd-text-primary);
    border: 1px solid var(--rd-border-strong);
    font-size: var(--rd-font-sm);
    outline: none;
  }

  @media (pointer: coarse) {
    .input { font-size: 16px; }
    .launcher { min-width: 32px; min-height: 44px; }
  }

  .launcher[hidden] { display: none; }

  .input:focus {
    border-color: var(--rd-accent-soft);
  }

  .input--spaced {
    margin-top: 10px;
  }

  .input--block {
    margin-block: 10px;
  }

  .module {
    margin: 10px 0;
    padding: 10px 12px;
    border: 1px solid var(--rd-border-subtle);
    border-radius: var(--rd-radius-lg);
    background: var(--rd-bg-surface);
  }

  .module summary {
    cursor: pointer;
    font-size: var(--rd-font-base);
    font-weight: 600;
    user-select: none;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .script-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--rd-border-subtle);
    font-size: var(--rd-font-base);
    cursor: pointer;
  }

  .script-row:last-child {
    border-bottom: 0;
    padding-bottom: 2px;
  }

  .script-info {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .script-status {
    display: block;
    font-size: var(--rd-font-xs);
    color: var(--rd-text-secondary);
    margin-top: 2px;
  }

  .checkbox {
    flex-shrink: 0;
    accent-color: var(--rd-accent-soft);
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .diagnostic-item {
    margin: 8px 0 0;
    padding: 8px 10px;
    border: 1px solid var(--rd-border-subtle);
    border-radius: var(--rd-radius-md);
    background: var(--rd-bg-panel);
  }

  .diagnostic-item summary {
    font-size: var(--rd-font-xs);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .diagnostic-stack {
    margin: 8px 0 0;
    font-family: var(--rd-font-mono);
    font-size: var(--rd-font-xs);
    color: var(--rd-text-secondary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .field-label {
    display: block;
    font-size: var(--rd-font-sm);
    font-weight: 500;
    color: var(--rd-text-secondary);
  }

  @media (max-width: 600px) {
    .panel input:not([type="checkbox"]),
    .panel textarea,
    .panel select {
      font-size: 16px;
    }
  }
`;

function getElementFromPoint(root: Node, x: number, y: number): Element | null {
  if (root instanceof ShadowRoot) {
    return root.elementFromPoint(x, y);
  }
  return document.elementFromPoint(x, y);
}

/** Presentation-only primitive; independent of userscript runtime state. */
function DockHeader({ title, closeLabel }: { title: string; closeLabel: string }) {
  return (
    <header className="panel-header">
      <Dialog.Title className="panel-title">{title}</Dialog.Title>
      <Dialog.Close className="btn btn--icon" aria-label={closeLabel}>✕</Dialog.Close>
    </header>
  );
}

function DockView({ controller }: { controller: DockController }) {
  const { scripts, modules, open, setOpen, portal } = controller;
  const [preferences, setPreferences] = useState<ScriptRulesRecord>(() => readScriptRules(localStorage));
  const [diagnostics, setDiagnostics] = useState(() => [...(getDiagnostics()?.history ?? [])]);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [suppressClick, setSuppressClick] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setDiagnostics([...(getDiagnostics()?.history ?? [])]);
    const onRulesChange = () => setPreferences(readScriptRules(localStorage));

    document.addEventListener("rod-diagnostics:change", refresh);
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
      for (const action of module.actions ?? []) {
        actions.set(action.id, action);
      }
      grouped.set(key, { ...module, actions: [...actions.values()] });
    }
    return [...grouped.values()];
  }, [modules]);

  const filteredScripts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return scripts;
    return scripts.filter((script) => `${script.name ?? ""} ${script.id}`.toLocaleLowerCase().includes(term));
  }, [scripts, search]);

  const toggleScript = (id: string, enabled: boolean) => {
    const next = { ...preferences, [id]: { ...preferences[id], enabled } };
    setPreferences(next);
    saveScriptRules(localStorage, next);
    document.dispatchEvent(new CustomEvent("rod-script-manager:change"));
  };

  return (
    <>
      <Dialog.Root modal={false} open={open} onOpenChange={(next) => {
        if (!next) setSettingsOpen(false);
        setOpen(next);
      }}>
        <Dialog.Portal container={portal}>
          {open && <div className="overlay" aria-hidden="true" onClick={() => { setSettingsOpen(false); setOpen(false); }} />}
          <Dialog.Content className="panel">
            <DockHeader title="Rod Dock" closeLabel="Fechar" />

            <div className="panel-body">
              <Dialog.Description className="panel-description">
                Gerencie scripts, ações e diagnósticos desta página.
              </Dialog.Description>

              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSettingsSearch(search);
                  setSettingsOpen(true);
                }}
              >
                Preferências
              </button>

              <details className="module" open>
                <summary>Scripts ({scripts.length})</summary>
                <input
                  className="input input--spaced"
                  type="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Filtrar scripts"
                  placeholder="Buscar script..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div>
                  {filteredScripts.map((script) => {
                    const enabled = preferences[script.id]?.enabled !== false;
                    const permitted = matches(
                      { ...script, name: script.name ?? script.id },
                      location.href,
                      preferences[script.id],
                    );

                    return (
                      <label className="script-row" key={script.id}>
                        <span className="script-info">
                          {script.name ?? script.id}
                          <small className="script-status">
                            {!enabled ? "Desativado" : permitted ? "Permitido" : "Fora da página"}
                          </small>
                        </span>
                        <input
                          className="checkbox"
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) => toggleScript(script.id, event.target.checked)}
                        />
                      </label>
                    );
                  })}
                </div>
              </details>

              {visibleModules.map((module) => (
                <details className="module" key={module.id}>
                  <summary>{module.name}</summary>
                  <div className="actions">
                    {module.actions.map((action) => (
                      <button
                        type="button"
                        className={`btn${dropTarget === action.id ? " drop-target" : ""}`}
                        key={action.id}
                        onClick={(event) => {
                          if (suppressClick === action.id) {
                            event.preventDefault();
                            setSuppressClick(null);
                            return;
                          }
                          action.run();
                        }}
                        onPointerDown={(event) => {
                          if (!action.reorder || (event.pointerType === "mouse" && event.button !== 0)) {
                            return;
                          }

                          const source = event.currentTarget;
                          const root = source.getRootNode();
                          const startX = event.clientX;
                          const startY = event.clientY;
                          let moved = false;

                          source.setPointerCapture(event.pointerId);

                          const cleanup = () => {
                            source.removeEventListener("pointermove", onMove);
                            source.removeEventListener("pointerup", onFinish);
                            source.removeEventListener("pointercancel", onCancel);
                          };

                          const onMove = (next: PointerEvent) => {
                            if (!moved && Math.hypot(next.clientX - startX, next.clientY - startY) < 10) {
                              return;
                            }
                            moved = true;
                            setDragging(action.id);
                            const target = getElementFromPoint(root, next.clientX, next.clientY);
                            setDropTarget(
                              target?.closest?.("[data-reorder-id]")?.getAttribute("data-reorder-id") ?? null,
                            );
                          };

                          const onFinish = (next: PointerEvent) => {
                            cleanup();
                            const target = getElementFromPoint(root, next.clientX, next.clientY);
                            const targetId = target
                              ?.closest?.("[data-reorder-id]")
                              ?.getAttribute("data-reorder-id");

                            setDragging(null);
                            setDropTarget(null);

                            if (moved) {
                              setSuppressClick(action.id);
                              if (targetId && targetId !== action.id) {
                                action.reorder?.(targetId);
                              }
                            }
                          };

                          const onCancel = () => {
                            cleanup();
                            setDragging(null);
                            setDropTarget(null);
                          };

                          source.addEventListener("pointermove", onMove);
                          source.addEventListener("pointerup", onFinish);
                          source.addEventListener("pointercancel", onCancel, { once: true });
                        }}
                        data-reorder-id={action.reorder ? action.id : undefined}
                        aria-grabbed={action.reorder ? dragging === action.id : undefined}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </details>
              ))}

              <details className="module">
                <summary>Diagnósticos ({diagnostics.length})</summary>
                <div className="actions">
                  <button
                    type="button"
                    className="btn"
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
                </div>

                {diagnostics.slice(0, 30).map((item, index) => (
                  <details className="diagnostic-item" key={index}>
                    <summary>{item.message}</summary>
                    <pre className="diagnostic-stack">{item.stack ?? item.message}</pre>
                  </details>
                ))}
              </details>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root modal={false} open={open && settingsOpen} onOpenChange={setSettingsOpen}>
        <Dialog.Portal container={portal}>
          {open && settingsOpen && <div className="overlay overlay--secondary" aria-hidden="true" onClick={() => setSettingsOpen(false)} />}
          <Dialog.Content
            className="panel"
            aria-describedby={undefined}
          >
            <DockHeader title="Preferências do Rod Dock" closeLabel="Fechar preferências" />

            <div className="panel-body">
              <label className="field-label" htmlFor="rod-dock-filter">
                Filtrar scripts
              </label>
              <input
                id="rod-dock-filter"
                className="input input--block"
                type="search"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={settingsSearch}
                onChange={(event) => setSettingsSearch(event.target.value)}
                placeholder="Buscar script..."
              />
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSearch(settingsSearch);
                    setSettingsOpen(false);
                  }}
                >
                  Aplicar
                </button>
                <Dialog.Close className="btn">Cancelar</Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

const gmMenu = globalThis as typeof globalThis & {
  GM_registerMenuCommand?: RegisterMenu;
  GM_unregisterMenuCommand?: UnregisterMenu;
  __rodDockCleanup?: () => void;
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
  gmMenu.__rodDockCleanup?.();
  // Coordinate replacement across isolated userscript execution worlds.
  for (const previous of document.querySelectorAll<HTMLElement>("[data-rod-dock]")) {
    previous.dispatchEvent(new Event("rod-dock:dispose"));
    previous.remove();
  }

  const host = document.createElement("div");
  host.dataset.rodDock = "";

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.dataset.rodDockStyles = "";
  style.textContent = css;

  const mountPoint = document.createElement("div");
  mountPoint.className = "rod-dock-root";

  const portalPoint = document.createElement("div");
  portalPoint.className = "rod-dock-root";

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.textContent = "☰";
  launcher.setAttribute("aria-label", "Abrir Rod Dock");

  let savedPosition = NaN;
  try {
    savedPosition = Number(localStorage.getItem(DOCK_POSITION_KEY));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  const initialTop =
    Number.isFinite(savedPosition) && savedPosition >= 12 && savedPosition <= 88 ? savedPosition : 46;
  launcher.style.top = `${initialTop}%`;

  shadow.append(style, mountPoint, portalPoint, launcher);

  let scrollFadeTimer: number | null = null;
  let dragStart: { x: number; y: number; top: number; moved: boolean } | null = null;

  const onPageScroll = () => {
    if (launcher.hidden || dragStart) return;
    launcher.classList.add("launcher--scrolling");
    if (scrollFadeTimer !== null) {
      window.clearTimeout(scrollFadeTimer);
    }
    scrollFadeTimer = window.setTimeout(() => {
      launcher.classList.remove("launcher--scrolling");
      scrollFadeTimer = null;
    }, 650);
  };

  window.addEventListener("scroll", onPageScroll, { capture: true, passive: true });

  launcher.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    launcher.classList.remove("launcher--scrolling");
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      top: parseFloat(launcher.style.top) || 46,
      moved: false,
    };
    launcher.setPointerCapture(event.pointerId);
  });

  launcher.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    if (!dragStart.moved && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) < 10) {
      return;
    }
    dragStart.moved = true;
    const nextTop = Math.max(
      12,
      Math.min(88, dragStart.top + ((event.clientY - dragStart.y) * 100) / window.innerHeight),
    );
    launcher.style.top = `${nextTop}%`;
  });

  launcher.addEventListener("pointerup", () => {
    if (!dragStart) return;
    const { moved } = dragStart;
    dragStart = null;
    if (moved) {
      try {
        localStorage.setItem(DOCK_POSITION_KEY, String(parseFloat(launcher.style.top)));
      } catch {
        // Keep the current position even when persistence is unavailable.
      }
    } else {
      setOpen(true);
    }
  });

  launcher.addEventListener("pointercancel", () => {
    dragStart = null;
  });

  launcher.addEventListener("click", (event) => {
    if (event.detail === 0) setOpen(true);
  });

  let sharedMount: ReturnType<typeof mountSharedReact> | undefined;
  let disposed = false;
  let currentModules = modules;
  let isOpen = false;

  const render = () => {
    if (disposed) return;
    const view = (
      <DockView
        controller={{
          modules: currentModules,
          scripts,
          open: isOpen,
          setOpen,
          portal: portalPoint,
        }}
      />
    );
    if (sharedMount) {
      sharedMount.update(view);
    } else {
      sharedMount = mountSharedReact(view, mountPoint);
    }
  };

  const setOpen = (next: boolean) => {
    if (disposed) return;
    isOpen = next;
    launcher.hidden = next;
    if (next) {
      launcher.classList.remove("launcher--scrolling");
    }
    render();
  };

  const setModules = (next: DockModule[]) => {
    currentModules = next;
    render();
  };

  const onRegistration = (event: Event) => {
    const detail = (event as CustomEvent<{ type: string; module?: DockModule; id?: string }>).detail;
    if (detail?.type === "register" && detail.module) {
      setModules([...currentModules.filter((item) => item.id !== detail.module?.id), detail.module]);
    }
    if (detail?.type === "unregister" && detail.id) {
      setModules(currentModules.filter((item) => item.id !== detail.id));
    }
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

    const existingModule = currentModules.find((item) => item.id === detail.moduleId) ?? {
      id: detail.moduleId,
      name: detail.moduleId,
      actions: [],
    };
    const actions = existingModule.actions.filter((action) => action.id !== detail.id);
    if (detail.type === "register" && typeof detail.callback === "function") {
      actions.push({ id: String(detail.id), label: detail.label, run: detail.callback });
    }
    setModules([
      ...currentModules.filter((item) => item.id !== existingModule.id),
      { ...existingModule, actions },
    ]);
  };

  document.addEventListener("rod-dock:registry", onRegistration);
  document.addEventListener("rod-dock:menu", onMenu);

  (document.body ?? document.documentElement).append(host);
  render();

  document.dispatchEvent(new CustomEvent("rod-dock:ready"));

  const command =
    typeof registerMenu === "function" ? registerMenu("Abrir Rod Dock", () => setOpen(true)) : null;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (scrollFadeTimer !== null) {
      window.clearTimeout(scrollFadeTimer);
    }
    window.removeEventListener("scroll", onPageScroll, { capture: true });
    document.removeEventListener("rod-dock:registry", onRegistration);
    document.removeEventListener("rod-dock:menu", onMenu);
    host.removeEventListener("rod-dock:dispose", dispose);
    sharedMount?.dispose();
    host.remove();
    if (command != null && typeof gmMenu.GM_unregisterMenuCommand === "function") {
      gmMenu.GM_unregisterMenuCommand(command);
    }
    if (gmMenu.__rodDockCleanup === dispose) {
      delete gmMenu.__rodDockCleanup;
    }
  };

  host.addEventListener("rod-dock:dispose", dispose, { once: true });
  gmMenu.__rodDockCleanup = dispose;

  return {
    setModules,
    open: () => setOpen(true),
    close: () => setOpen(false),
    dispose,
  };
}
