import { createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeProvider, bindRuntime, useContext, useRuntime, useRuntimeWorld } from "./runtime-context-react.js";
import { createCoreRuntime, type ScriptDefinition, type RuntimeAPI } from "./runtime.js";
import { captureDiagnostic } from "../runtime/diagnostics.js";

const REACT_MOUNT_SOURCE = "react.mount";

export function createRuntime(
  definitions: ScriptDefinition[],
  bridge: { call: (method: string, payload: unknown) => Promise<unknown>; dispose?: () => void },
  host: Window & typeof globalThis = window,
  release?: { id: string; version: string; manifestURL: string },
): RuntimeAPI {
  const helpers = { useContext, useRuntime, useRuntimeWorld, bindRuntime };
  return createCoreRuntime(definitions, bridge, host, release, {
    installHelpers: () => {
      const installed: string[] = [];
      for (const name of Object.keys(helpers) as Array<keyof typeof helpers>) {
        if (name in host) continue;
        Object.defineProperty(host, name, { configurable: true, writable: false, value: helpers[name] });
        installed.push(name);
      }
      return installed;
    },
    removeHelpers: (installed) => {
      for (const name of installed) {
        if ((host as unknown as Record<string, unknown>)[name] === helpers[name as keyof typeof helpers])
          delete (host as unknown as Record<string, unknown>)[name];
      }
    },
    createSpecificContext: ({ definition, abort, onDispose, ensureUIRoot }) => {
      let scriptContext: import("./runtime.js").ScriptContext | undefined;
      return {
        __attachContext(context: import("./runtime.js").ScriptContext) {
          scriptContext = context;
        },
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
          mountReact(component: ReactElement, container?: HTMLElement) {
            if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
            const targetRoot = ensureUIRoot();
            if (container && container.getRootNode() !== targetRoot)
              throw new Error("React mount container must belong to this script ShadowRoot");
            const mountPoint = container || host.document.createElement("div");
            if (!container) targetRoot.append(mountPoint);

            try {
              if (!scriptContext) throw new Error("React runtime context not initialized");
              const root = createRoot(mountPoint, {
                onUncaughtError: (error) => captureDiagnostic(error, REACT_MOUNT_SOURCE, definition.id, host),
                onCaughtError: (error) => captureDiagnostic(error, REACT_MOUNT_SOURCE, definition.id, host),
              });
              root.render(createElement(RuntimeProvider, { context: scriptContext }, component));
              let disposed = false;
              const cleanup = () => {
                if (disposed) return;
                disposed = true;
                root.unmount();
                if (!container) mountPoint.remove();
              };
              onDispose(cleanup);
              return cleanup;
            } catch (error) {
              if (!container) mountPoint.remove();
              captureDiagnostic(error, REACT_MOUNT_SOURCE, definition.id, host);
              throw error;
            }
          },
        }),
      };
    },
  });
}
