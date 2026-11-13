import { createSignal, createStore, Show } from "solid-js";
import { mountPoint } from "../solid-ui/mount-point.tsx";
import { Dialog } from "../solid-ui/Dialog.tsx";
import { ActionsPanel, type ActionsModule } from "./Panel.tsx";
import { ClipboardPanel } from "./ClipboardPanel.tsx";
import styles, { css } from "./Launcher.module.css";
export type RodActionsTab = ActionsModule["tabs"][number];
export type RodActionsModule = ActionsModule;
export type RodActionsHub = {
  register: (module: RodActionsModule) => () => void;
  open: (tabId?: string) => void;
};
declare global {
  interface Window {
    __RodActions?: RodActionsHub;
  }
}
export function installRodActions(_menu?: unknown): RodActionsHub {
  if (window.__RodActions) return window.__RodActions;
  const [state, setState] = createStore({ modules: [] as RodActionsModule[] });
  const [open, setOpen] = createSignal(false),
    [initial, setInitial] = createSignal("");
  const registrations = new Map<string, symbol>();
  const entries = () =>
    state.modules.flatMap((module) =>
      module.tabs.map((tab) => ({
        ...tab,
        key: `${module.id}:${tab.id}`,
        label: `${module.title} · ${tab.title}`,
      })),
    );
  const hub: RodActionsHub = {
    register(module) {
      if (!module.id || !module.tabs.length) throw Error("Rod Actions requires module id and tabs");
      const token = Symbol(module.id);
      registrations.set(module.id, token);
      setState((draft) => {
        draft.modules = draft.modules.filter((item) => item.id !== module.id);
        draft.modules.push(module);
      });
      return () => {
        if (registrations.get(module.id) !== token) return;
        registrations.delete(module.id);
        setState((draft) => {
          draft.modules = draft.modules.filter((item) => item.id !== module.id);
        });
        if (!state.modules.length) setOpen(false);
      };
    },
    open(tabId) {
      const tabs = entries();
      if (!tabs.length) return;
      setInitial(tabs.some((tab) => tab.key === tabId) ? tabId! : tabs[0].key);
      setOpen(true);
    },
  };
  mountPoint(
    document.body || document.documentElement,
    () => (
      <>
        <style>{css}</style>
        <Show when={state.modules.length}>
          <button
            class={styles.launcher}
            type="button"
            title="Rod Actions"
            aria-label="Abrir Rod Actions"
            onClick={() => hub.open()}
          >
            ⚙
          </button>
        </Show>
        <Show when={open()}>
          <Dialog title="Rod Actions" close={() => setOpen(false)}>
            <ActionsPanel entries={entries()} initial={initial()} />
          </Dialog>
        </Show>
      </>
    ),
    { id: "rod-actions-hub", shadow: true },
  );
  window.__RodActions = hub;
  const clipboard = (window as Window & { __RodClipboard?: Parameters<typeof ClipboardPanel>[0]["clipboard"] }).__RodClipboard;
  if (clipboard) {
    hub.register({
      id: "clipboard",
      title: "Clipboard",
      tabs: [{ id: "history", title: "Histórico", icon: "▤", render: () => <ClipboardPanel clipboard={clipboard} /> }],
    });
  }
  return hub;
}
