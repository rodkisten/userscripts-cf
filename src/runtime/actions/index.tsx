import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import styles, { css } from "./Launcher.module.css";
import { ClipboardPanel, type ClipboardApi } from "./ClipboardPanel.tsx";

export type RodActionsTab = { id: string; title: string; icon?: string; render: () => ReactNode };
export type RodActionsModule = { id: string; title: string; tabs: RodActionsTab[] };
export type RodActionsHub = {
  register: (module: RodActionsModule) => () => void;
  open: (tabId?: string) => void;
};
declare global {
  interface Window {
    __RodActions?: RodActionsHub;
  }
}

type Entry = RodActionsTab & { key: string; label: string };
function ActionsView({
  hub,
  subscribe,
  getEntries,
  getSelection,
  portal,
}: {
  hub: RodActionsHub;
  subscribe: (notify: () => void) => () => void;
  getEntries: () => Entry[];
  getSelection: () => string;
  portal: HTMLElement;
}) {
  const [, redraw] = useState(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  useEffect(
    () =>
      subscribe(() => {
        redraw((value) => value + 1);
        const next = getSelection();
        if (next) {
          setSelected(next);
          setOpen(true);
        } else if (!getEntries().length) {
          setOpen(false);
        }
      }),
    [subscribe, getEntries, getSelection],
  );
  const entries = getEntries();
  const active = entries.find((item) => item.key === selected) ?? entries[0];
  return (
    <Dialog.Root open={open && entries.length > 0} onOpenChange={setOpen}>
      {entries.length > 0 && (
        <button
          className={styles.launcher}
          type="button"
          aria-label="Abrir Rod Actions"
          onClick={() => hub.open()}
        >
          ⚙
        </button>
      )}
      <Dialog.Portal container={portal}>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "#0009" }} />
        <Dialog.Content
          style={{
            position: "fixed",
            zIndex: 2147483601,
            inset: "auto 0 0",
            maxHeight: "85dvh",
            overflow: "auto",
            background: "#18181b",
            color: "#fafafa",
            borderRadius: "16px 16px 0 0",
            padding: 16,
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          }}
        >
          <Dialog.Title>Rod Actions</Dialog.Title>
          <Dialog.Description
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}
          >
            Ferramentas disponíveis para esta página
          </Dialog.Description>
          <Dialog.Close aria-label="Fechar" style={{ position: "absolute", top: 12, right: 16 }}>
            ×
          </Dialog.Close>
          <nav
            role="tablist"
            aria-label="Ferramentas"
            style={{ display: "flex", gap: 8, overflowX: "auto", paddingBlock: 12 }}
          >
            {entries.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={active?.key === tab.key}
                onClick={() => setSelected(tab.key)}
              >
                {tab.icon ?? ""} {tab.title}
              </button>
            ))}
          </nav>
          <section role="tabpanel" aria-label={active?.label}>
            {active?.render()}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function installRodActions(
  _menu?: unknown,
  mountSharedReact?: (component: ReactElement, container: HTMLElement) => { dispose: () => void },
): RodActionsHub {
  if (window.__RodActions) return window.__RodActions;
  const modules = new Map<string, RodActionsModule>();
  const registrations = new Map<string, symbol>();
  const listeners = new Set<() => void>();
  let selected = "";
  const entries = (): Entry[] =>
    [...modules.values()].flatMap((module) =>
      module.tabs.map((tab) => ({
        ...tab,
        key: `${module.id}:${tab.id}`,
        label: `${module.title} · ${tab.title}`,
      })),
    );
  const notify = () => listeners.forEach((listener) => listener());
  const hub: RodActionsHub = {
    register(module) {
      if (!module.id || !module.tabs.length) throw Error("Rod Actions requires module id and tabs");
      const token = Symbol(module.id);
      registrations.set(module.id, token);
      modules.set(module.id, module);
      notify();
      return () => {
        if (registrations.get(module.id) !== token) return;
        registrations.delete(module.id);
        modules.delete(module.id);
        notify();
      };
    },
    open(tabId) {
      const tabs = entries();
      if (!tabs.length) return;
      selected = tabs.some((tab) => tab.key === tabId) ? tabId! : tabs[0].key;
      notify();
    },
  };
  const host = document.createElement("div");
  host.id = "rod-actions-hub";
  (document.body || document.documentElement).append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  sheet.textContent = css;
  shadow.append(sheet);
  const mount = document.createElement("div");
  shadow.append(mount);
  const view = (
    <ActionsView
      hub={hub}
      portal={mount}
      getEntries={entries}
      getSelection={() => selected}
      subscribe={(listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }}
    />
  );
  if (mountSharedReact) mountSharedReact(view, mount);
  else createRoot(mount).render(view);
  window.__RodActions = hub;
  const clipboard = (window as Window & { __RodClipboard?: ClipboardApi }).__RodClipboard;
  if (clipboard)
    hub.register({
      id: "clipboard",
      title: "Clipboard",
      tabs: [
        {
          id: "history",
          title: "Histórico",
          icon: "▤",
          render: () => <ClipboardPanel clipboard={clipboard} />,
        },
      ],
    });
  return hub;
}
