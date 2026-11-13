import { render } from "@solidjs/web";
import { ActionsLauncher } from "./Launcher.tsx";
import { mountActionsPanel, type ActionsModule } from "./Panel.tsx";

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

export function installRodActions(menu: {
  open: (options: any) => { result: Promise<any> };
  configure?: (options: any) => void;
}): RodActionsHub {
  if (window.__RodActions) return window.__RodActions;

  const modules = new Map<string, RodActionsModule>();
  const listeners = new Set<() => void>();
  const entries = () =>
    [...modules.values()].flatMap((module) =>
      module.tabs.map((tab) => ({
        ...tab,
        key: `${module.id}:${tab.id}`,
        label: `${module.title} · ${tab.title}`,
      })),
    );
  const launcher = document.createElement("div");
  launcher.dataset.rodActionsLauncher = "";
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const hub: RodActionsHub = {
    register(module) {
      if (!module.id || !module.tabs?.length) throw Error("Rod Actions requires module id and tabs");
      modules.set(module.id, module);
      notify();
      return () => {
        if (modules.get(module.id) === module) {
          modules.delete(module.id);
          notify();
        }
      };
    },
    open(tabId) {
      const tabs = entries();
      if (!tabs.length) return;
      const root = document.createElement("div");
      const content = document.createElement("div");
      root.append(content);
      const dispose = mountActionsPanel(
        content,
        entries,
        tabs.some((tab) => tab.key === tabId) ? tabId! : tabs[0].key,
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      );
      menu.configure?.({ defaultPresentation: "bottom-sheet" });
      const handle = menu.open({
        id: "rod-actions-hub",
        title: "Rod Actions",
        presentation: "bottom-sheet",
        fields: [{ type: "custom", name: "actions", chrome: "bare", render: () => root }],
        actions: [{ id: "close", label: "Fechar", role: "cancel" }],
      });
      void handle.result.finally(dispose);
    },
  };
  document.documentElement.append(launcher);
  render(
    () =>
      ActionsLauncher({
        open: () => hub.open(),
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        count: () => modules.size,
      }),
    launcher,
  );
  window.__RodActions = hub;
  return hub;
}
