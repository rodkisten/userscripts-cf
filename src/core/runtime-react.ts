import React from "react";
import { createCoreRuntime, ScriptDefinition, RuntimeAPI } from "./runtime.js";
import { captureDiagnostic } from "../runtime/diagnostics.js";

const REACT_MOUNT_SOURCE = "react.mount";

export function createRuntime(
  definitions: ScriptDefinition[],
  bridge: { call: (method: string, payload: unknown) => Promise<unknown>; dispose?: () => void },
  host: Window & typeof globalThis = window,
  release?: { id: string; version: string; manifestURL: string },
): RuntimeAPI {
  return createCoreRuntime(definitions, bridge, host, release, {
    createSpecificContext: ({ definition, abort, onDispose, ensureUIRoot }) => {
      return {
        // Implementações exclusivas e ganchos específicos para React (se houver hooks, context, etc.)
        ui: Object.freeze({
          get root() {
            return ensureUIRoot();
          },
          get host() {
            return ensureUIRoot().host as unknown as HTMLDivElement;
          },
          mount(node: Node) {
            ensureUIRoot().append(node);
            return node;
          },
          style(css: string) {
            const node = host.document.createElement("style");
            node.textContent = String(css);
            ensureUIRoot().append(node);
            onDispose(() => node.remove());
            return node;
          },
          mountReact(component: React.ReactElement, container?: HTMLElement) {
            // Exemplo de integração nativa com ReactDOM para montagem em ShadowRoot
            if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
            const targetRoot = ensureUIRoot();
            const mountPoint = container || host.document.createElement("div");
            if (!container) targetRoot.append(mountPoint);

            try {
              // Simulação/exemplo de renderização React 18+ em Shadow DOM
              // (Dependendo de como o ecossistema React do projeto consome renderização)
              const ReactDomClient = (React as any).version?.startsWith("18")
                ? require("react-dom/client")
                : null;

              if (ReactDomClient) {
                const root = ReactDomClient.createRoot(mountPoint);
                root.render(component);
                onDispose(() => {
                  root.unmount();
                  if (!container) mountPoint.remove();
                });
              } else {
                const ReactDOM = require("react-dom");
                ReactDOM.render(component, mountPoint);
                onDispose(() => {
                  ReactDOM.unmountComponentAtNode(mountPoint);
                  if (!container) mountPoint.remove();
                });
              }
            } catch (error) {
              captureDiagnostic(error, REACT_MOUNT_SOURCE, definition.id, host);
              throw error;
            }
          },
        }),
      };
    },
  });
}
