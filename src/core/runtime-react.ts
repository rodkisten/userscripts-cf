import React from "react";
import { createRoot } from "react-dom/client";
import {
  RuntimeProvider,
  bindRuntime,
  useContext,
  useRuntime,
  useRuntimeWorld,
} from "./runtime-context-react.js";
import { createCoreRuntime, type ScriptDefinition, type RuntimeAPI } from "./runtime.js";
import { captureDiagnostic } from "../runtime/diagnostics.js";
import { registerShadowStyles, type ShadowStyle } from "../runtime/react-ui/shadow-styles.js";

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
        Object.defineProperty(host, name, { configurable: true, value: helpers[name], writable: false });
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
    createSpecificContext: ({ definition, abort, onDispose, ensureUIRoot, getContext }) => ({
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
        registerStyles(...styles: ShadowStyle[]) {
          const dispose = registerShadowStyles(ensureUIRoot(), styles);
          onDispose(dispose);
          return dispose;
        },
        mountReact(component: React.ReactElement, container?: HTMLElement) {
          if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
          const mountPoint = container ?? host.document.createElement("div");
          const owned = !container;
          if (owned) ensureUIRoot().append(mountPoint);
          let root: ReturnType<typeof createRoot>;
          try {
            root = createRoot(mountPoint);
            root.render(React.createElement(RuntimeProvider, { context: getContext() }, component));
          } catch (error) {
            if (owned) mountPoint.remove();
            captureDiagnostic(error, REACT_MOUNT_SOURCE, definition.id, host);
            throw error;
          }
          let disposed = false;
          const dispose = () => {
            if (disposed) return;
            disposed = true;
            root.unmount();
            if (owned) mountPoint.remove();
          };
          onDispose(dispose);
          return dispose;
        },
      }),
    }),
  });
}
