import { css as dockStyles } from "./rod-dock.module.css";
import { matches, readScriptRules, saveScriptRules } from "../../core/script-manager.js";
import { createSignal, For, Show } from "solid-js";
import { render } from "@solidjs/web";



type DockAction = { id: string; label: string; run: () => void };
type DockModule = { id: string; name: string; actions: DockAction[] };
type DockEvent = { type: "register" | "unregister"; module?: DockModule; id?: string };

type ScriptDefinition = { id: string; name: string; matches: string[]; exclude?: string[] };
export function installRodDock({ modules = [], scripts = [], registerMenu = globalThis.GM_registerMenuCommand }: { modules?: DockModule[]; scripts?: ScriptDefinition[]; registerMenu?: typeof globalThis.GM_registerMenuCommand } = {}) {
  // The adapter owns the only DOM boundary. Solid owns all UI inside it.
  const host = document.createElement("div");
  // A userscript must not inherit layout/stacking from the host page.
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("inset", "0", "important");
  host.style.setProperty("z-index", "2147483646", "important");
  host.style.setProperty("pointer-events", "none", "important");
  host.dataset.rodDock = "";
  const shadow = host.attachShadow({ mode: "open" });
  const [open, setOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [entries, setEntries] = createSignal<DockModule[]>([...new Map((modules as DockModule[]).map(m => [m.id, m])).values()]);
  const [position, setPosition] = createSignal(46);
  const [managerOpen, setManagerOpen] = createSignal(false);
  const [selectedScript, setSelectedScript] = createSignal<string | null>(null);
  const [ruleKind, setRuleKind] = createSignal<"includes" | "excludes">("excludes");
  const [rulePattern, setRulePattern] = createSignal("");
  const [preferences, setPreferences] = createSignal<Record<string, { enabled?: boolean; includes?: string[]; excludes?: string[] }>>(readScriptRules(localStorage));
  function updatePreference(id: string, patch: Partial<{enabled: boolean; includes: string[]; excludes: string[]}>) {
    const next = { ...preferences(), [id]: { ...(preferences()[id] || {}), ...patch } };
    setPreferences(next);
    saveScriptRules(localStorage, next);
    document.dispatchEvent(new CustomEvent("rod-script-manager:change"));
  }
  const currentScript = () => scripts.find((script) => script.id === selectedScript());
  const scriptStatus = (script: ScriptDefinition) => {
    if (preferences()[script.id]?.enabled === false) return "Desativado";
    return matches(script, location.href, preferences()[script.id]) ? "Permitido" : "Fora da página";
  };
  const menuEntries = new Map<string, Map<unknown, DockAction>>();
  const onRegistration = (event: Event) => {
    const detail = (event as CustomEvent<DockEvent>).detail;
    if (!detail) return;
    if (detail.type === "register" && detail.module) {
      setEntries((items) => [...items.filter((item) => item.id !== detail.module!.id), { ...detail.module!, actions: [...(detail.module!.actions || []), ...(menuEntries.get(detail.module!.id)?.values() || [])] }]);
    } else if (detail.type === "unregister" && detail.id) {
      setEntries((items) => items.filter((item) => item.id !== detail.id));
    }
  };
  document.addEventListener("rod-dock:registry", onRegistration);
  const onMenu = (event: Event) => {
    const { type, moduleId, id, label, callback } = (event as CustomEvent).detail || {};
    if (!moduleId) return;
    if (type === "register" && !entries().some((item) => item.id === moduleId)) {
      setEntries((items) => [...items.filter(item => item.id !== moduleId), { id: moduleId, name: moduleId, actions: [] }]);
    }
    let commands = menuEntries.get(moduleId);
    if (!commands) menuEntries.set(moduleId, (commands = new Map()));
    if (type === "register" && typeof callback === "function")
      commands.set(id, { id: String(id), label, run: callback });
    if (type === "unregister") commands.delete(id);
    setEntries((items) => items.map((module) => module.id === moduleId
      ? { ...module, actions: [...new Map([...(module.actions || []).filter(action => ![...commands!.values()].some(command => command.id === action.id)).map(action => [action.id, action] as const), ...[...commands!.values()].map(action => [action.id, action] as const)]).values()] }
      : module));
  };
  document.addEventListener("rod-dock:menu", onMenu);
  // Multiple registries may publish the same visible module under different IDs.
  // Merge them at presentation time while preserving every distinct action.
  const visibleModules = () => {
    const grouped = new Map<string, DockModule>();
    for (const module of entries()) {
      const key = module.name.trim().toLocaleLowerCase();
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...module, actions: [...module.actions] });
        continue;
      }
      const actions = new Map(existing.actions.map(action => [action.label.trim().toLocaleLowerCase(), action]));
      for (const action of module.actions) actions.set(action.label.trim().toLocaleLowerCase(), action);
      grouped.set(key, { ...existing, actions: [...actions.values()] });
    }
    return [...grouped.values()];
  };
  const DockView = () => (
    <>
      <style>{dockStyles}</style>
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
          <header class="header"><span>Rod Dock</span><button class="close" aria-label="Gerenciar scripts" onClick={() => { setManagerOpen(!managerOpen()); setSelectedScript(null); }}>⚙</button><button class="close" aria-label="Fechar Rod Dock" onClick={() => setOpen(false)}>×</button></header>
          <div class="content">
            <Show when={managerOpen()}>
              <nav class="manager-toolbar" aria-label="Navegação do gerenciador"><button class="action" onClick={() => setSelectedScript(null)}>Todos os scripts</button><button class="action" onClick={() => setManagerOpen(false)}>Módulos</button></nav>
              <Show when={!currentScript()} fallback={
                <section class="manager-list">
                  <button class="action" onClick={() => setSelectedScript(null)}>‹ Voltar</button>
                  <strong>{currentScript()?.name}</strong>
                  <div class="manager-status">Regras do manifest são obrigatórias e não podem ser removidas.</div>
                  <For each={currentScript()?.matches || []}>{(pattern) => <div class="manager-status">Manifest: {pattern}</div>}</For>
                  <For each={currentScript()?.exclude || []}>{(pattern) => <div class="manager-status">Exclusão obrigatória: {pattern}</div>}</For>
                  <div class="manager-toolbar" role="tablist" aria-label="Tipo de regra">
                    <button class="action" role="tab" aria-selected={ruleKind() === "includes"} onClick={() => { setRuleKind("includes"); setRulePattern(""); }}>Incluir URL</button>
                    <button class="action" role="tab" aria-selected={ruleKind() === "excludes"} onClick={() => { setRuleKind("excludes"); setRulePattern(""); }}>Excluir URL</button>
                  </div>
                  <p class="manager-status">{ruleKind() === "includes" ? "Permite páginas adicionais dentro do escopo do Tampermonkey." : "Bloqueia páginas mesmo quando correspondem ao manifest."}</p>
                  <label class="manager-field">
                    <span>{ruleKind() === "includes" ? "Nova inclusão" : "Nova exclusão"}</span>
                    <input class="manager-input" value={rulePattern()} placeholder="https://example.com/*" onInput={(event) => setRulePattern(event.currentTarget.value)} />
                  </label>
                  <button class="action" disabled={!rulePattern().trim()} onClick={() => {
                    const id = selectedScript();
                    if (!id) return;
                    const pattern = rulePattern().trim();
                    if (!/^https?:\/\//.test(pattern)) return;
                    updatePreference(id, { [ruleKind()]: [...new Set([...(preferences()[id]?.[ruleKind()] || []), pattern])] });
                    setRulePattern("");
                  }}>Adicionar {ruleKind() === "includes" ? "inclusão" : "exclusão"}</button>
                  <For each={["includes", "excludes"] as const}>{(kind) =>
                    <div class="manager-rules">
                      <strong>{kind === "includes" ? "Inclusões" : "Exclusões"}</strong>
                      <For each={preferences()[selectedScript() || ""]?.[kind] || []}>{(pattern) =>
                        <div class="manager-rule"><span>{pattern}</span><button class="action" onClick={() => {
                          const id = selectedScript();
                          if (id) updatePreference(id, { [kind]: (preferences()[id]?.[kind] || []).filter((item) => item !== pattern) });
                        }}>×</button></div>
                      }</For>
                    </div>
                  }</For>
                </section>
              }>
                <div class="manager-list">
                  <For each={scripts}>{(script) =>
                    <div class="manager-item">
                      <div class="manager-details"><div class="manager-name">{script.name}</div><div class="manager-status">{scriptStatus(script)}</div></div>
                      <label class="manager-switch">
                        <input class="manager-checkbox" type="checkbox" aria-label={`Ativar ${script.name}`} checked={preferences()[script.id]?.enabled !== false} onChange={(event) => updatePreference(script.id, { enabled: event.currentTarget.checked })} />
                        <span class="manager-switch-control" aria-hidden="true"><span class="manager-switch-thumb" /></span>
                      </label>
                      <button class="action" aria-label={`Configurar ${script.name}`} onClick={() => setSelectedScript(script.id)}>⚙</button>
                    </div>
                  }</For>
                </div>
              </Show>
            </Show>
            <Show when={!managerOpen()}>
            <For each={visibleModules()}>{(module) => (
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
            </Show>
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
      document.removeEventListener("rod-dock:menu", onMenu);
      dispose();
      host.remove();
      if (command != null && typeof globalThis.GM_unregisterMenuCommand === "function")
        globalThis.GM_unregisterMenuCommand(command);
    },
  };
}
