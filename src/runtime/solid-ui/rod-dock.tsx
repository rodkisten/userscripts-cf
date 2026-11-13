import { createSignal, For, Show } from "solid-js";
import { render } from "@solidjs/web";

const style = `
:host{all:initial;color-scheme:dark;font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif}
*{box-sizing:border-box}
.launcher{position:fixed;right:0;top:46%;z-index:2147483646;transform:translateY(-50%);border:1px solid #52525b;border-right:0;border-radius:18px 0 0 18px;background:#18181b;color:#fafafa;padding:14px 11px;box-shadow:0 8px 30px #0007;touch-action:none}
.panel{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483646;width:min(360px,calc(100vw - 24px));max-height:min(72dvh,640px);display:flex;flex-direction:column;border:1px solid #3f3f46;border-radius:18px;background:#09090b;color:#fafafa;box-shadow:0 12px 45px #0009;overflow:hidden}
.header{display:flex;align-items:center;justify-content:space-between;padding:15px 16px;border-bottom:1px solid #27272a;font-weight:650}
.close{border:0;background:transparent;color:#a1a1aa;font-size:22px;padding:0 4px}
.content{overflow-y:auto;min-height:0;padding:10px;overscroll-behavior:contain}
.module{border:1px solid #27272a;border-radius:12px;margin:0 0 8px;overflow:hidden}
.module-title{width:100%;text-align:left;background:#18181b;border:0;color:#fafafa;padding:12px;display:flex;justify-content:space-between;font-weight:600}
.actions{padding:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.action{border:1px solid #3f3f46;background:#27272a;color:#fafafa;border-radius:8px;min-height:36px;padding:7px;text-align:left;overflow-wrap:anywhere}
.action:focus-visible,.close:focus-visible,.module-title:focus-visible,.launcher:focus-visible{outline:2px solid #fafafa;outline-offset:2px}
`;

type DockAction = { id: string; label: string; run: () => void };
type DockModule = { id: string; name: string; actions: DockAction[] };
type DockEvent = { type: "register" | "unregister"; module?: DockModule; id?: string };

export function installRodDock({ modules = [], registerMenu = globalThis.GM_registerMenuCommand } = {}) {
  // The adapter owns the only DOM boundary. Solid owns all UI inside it.
  const host = document.createElement("div");
  host.dataset.rodDock = "";
  const shadow = host.attachShadow({ mode: "open" });
  const [open, setOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [entries, setEntries] = createSignal<DockModule[]>(modules as DockModule[]);
  const [position, setPosition] = createSignal(46);
  const onRegistration = (event: Event) => {
    const detail = (event as CustomEvent<DockEvent>).detail;
    if (!detail) return;
    if (detail.type === "register" && detail.module) {
      setEntries((items) => [...items.filter((item) => item.id !== detail.module!.id), detail.module!]);
    } else if (detail.type === "unregister" && detail.id) {
      setEntries((items) => items.filter((item) => item.id !== detail.id));
    }
  };
  document.addEventListener("rod-dock:registry", onRegistration);
  const DockView = () => (
    <>
      <style>{style}</style>
      <Show when={!open()}>
        <button class="launcher" style={{ top: `${position()}%` }} aria-label="Abrir Rod Dock"
          onClick={() => setOpen(true)}
          onPointerDown={(event) => {
            const startY = event.clientY;
            const start = position();
            let moved = false;
            const move = (next: PointerEvent) => {
              if (Math.abs(next.clientY - startY) > 6) moved = true;
              setPosition(Math.max(12, Math.min(88, start + (next.clientY - startY) / innerHeight * 100)));
            };
            const end = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", end);
              if (moved) setOpen(false);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", end, { once: true });
          }}>☰</button>
      </Show>
      <Show when={open()}>
        <section class="panel" role="dialog" aria-label="Rod Dock">
          <header class="header"><span>Rod Dock</span><button class="close" aria-label="Fechar Rod Dock" onClick={() => setOpen(false)}>×</button></header>
          <div class="content">
            <For each={entries()}>{(module) => (
              <section class="module">
                <button class="module-title" aria-expanded={expanded() === module.id}
                  onClick={() => setExpanded(expanded() === module.id ? null : module.id)}>
                  <span>{module.name}</span><span>{expanded() === module.id ? "⌃" : "⌄"}</span>
                </button>
                <Show when={expanded() === module.id}>
                  <div class="actions">
                    <For each={module.actions}>{(action) => (
                      <button class="action" onClick={() => { setOpen(false); action.run(); }}>{action.label}</button>
                    )}</For>
                  </div>
                </Show>
              </section>
            )}</For>
          </div>
        </section>
      </Show>
    </>
  );
  (document.body || document.documentElement).append(host);
  const dispose = render(DockView, shadow);
  const command = typeof registerMenu === "function" ? registerMenu("Abrir Rod Dock", () => setOpen(true)) : null;
  return {
    setModules: setEntries,
    open: () => setOpen(true),
    close: () => setOpen(false),
    dispose() {
      document.removeEventListener("rod-dock:registry", onRegistration);
      dispose();
      host.remove();
      if (command != null && typeof globalThis.GM_unregisterMenuCommand === "function")
        globalThis.GM_unregisterMenuCommand(command);
    },
  };
}
