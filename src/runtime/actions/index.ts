export type RodActionsTab = {
  id: string;
  title: string;
  render: () => HTMLElement;
};

export type RodActionsModule = {
  id: string;
  title: string;
  tabs: RodActionsTab[];
};

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
  if (window.__RodActions) {
    return window.__RodActions;
  }

  const modules = new Map<string, RodActionsModule>();
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "⚙";
  button.setAttribute("aria-label", "Abrir Rod Actions");
  button.title = "Rod Actions";
  button.style.cssText = [
    "position:fixed",
    "right:max(12px,env(safe-area-inset-right))",
    "bottom:calc(78px + env(safe-area-inset-bottom))",
    "z-index:2147483000",
    "width:36px",
    "height:36px",
    "border-radius:50%",
    "border:1px solid rgba(255,255,255,.2)",
    "background:#252525",
    "color:#f5f5f5",
    "font-size:18px",
    "box-shadow:0 2px 12px rgba(0,0,0,.3)",
    "display:none",
  ].join(";");

  function updateButton(): void {
    button.style.display = modules.size ? "block" : "none";
  }

  const hub: RodActionsHub = {
    register(module) {
      if (!module.id || !module.tabs?.length) {
        throw new Error("Rod Actions: module id and tabs are required");
      }
      modules.set(module.id, module);
      updateButton();
      return () => {
        if (modules.get(module.id) === module) {
          modules.delete(module.id);
          updateButton();
        }
      };
    },
    open(tabId) {
      const tabs = [...modules.values()].flatMap((module) =>
        module.tabs.map((tab) => ({
          ...tab,
          key: `${module.id}:${tab.id}`,
          label: `${module.title} · ${tab.title}`,
        })),
      );
      if (!tabs.length) {
        return;
      }
      const selected = tabs.find((tab) => tab.key === tabId) || tabs[0];
      const openTab = (tab: typeof selected): void => {
        const element = tab.render();
        menu.configure?.({ defaultPresentation: "bottom-sheet" });
        menu.open({
          id: `rod-actions-${tab.key}`,
          title: tab.label,
          presentation: "bottom-sheet",
          fields: [{ type: "custom", name: "content", chrome: "bare", render: () => element }],
          actions: [
            ...tabs.filter((item) => item.key !== tab.key).map((item) => ({
              id: item.key,
              label: item.label,
              role: "custom",
              close: true,
            })),
            { id: "close", label: "Fechar", role: "cancel" },
          ],
        }).result.then((result) => {
          const next = tabs.find((item) => item.key === (result?.action || result?.actionId));
          if (next) {
            openTab(next);
          }
        }).catch((error) => console.error("[Rod Actions]", error));
      };
      openTab(selected);
    },
  };

  button.addEventListener("click", () => hub.open());
  document.documentElement.append(button);
  window.__RodActions = hub;
  return hub;
}
