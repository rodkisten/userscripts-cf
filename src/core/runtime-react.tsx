/** @jsxImportSource react */
import type { ReactElement } from "react";
import { RuntimeMount } from "./runtime-mount-react.js";
import type { ReactScriptContext } from "./react-context-contract.js";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { useSyncExternalStore, type ReactNode } from "react";
import { bindRuntime, useContext, useRuntime, useRuntimeWorld } from "./runtime-context-react.js";
import { createCoreRuntime, type ScriptDefinition, type RuntimeAPI } from "./runtime.js";
import { captureDiagnostic } from "../runtime/diagnostics.js";
import { registerShadowStyles, type ShadowStyle } from "../runtime/react-ui/shadow-styles.js";
import { createPortalRegistry } from "./portal-registry.js";

const REACT_MOUNT_SOURCE = "react.mount";

function PortalRegistry({ registry }: { registry: ReturnType<typeof createPortalRegistry> }) {
  const entries = useSyncExternalStore(registry.subscribe, registry.getSnapshot);
  return (
    <>
      {entries.map(({ id, target, node, context }) =>
        createPortal(
          context ? <RuntimeMount context={context}>{node}</RuntimeMount> : node,
          target,
          String(id),
        ),
      )}
    </>
  );
}

export function createRuntime(
  definitions: ScriptDefinition[],
  bridge: { call: (method: string, payload: unknown) => Promise<unknown>; dispose?: () => void },
  host: Window & typeof globalThis = window,
  release?: { id: string; version: string; manifestURL: string },
): RuntimeAPI & {
  mountSharedReact: (
    component: ReactElement,
    container: HTMLElement,
  ) => { update: (component: ReactElement) => void; dispose: () => void };
} {
  const helpers = { useContext, useRuntime, useRuntimeWorld, bindRuntime };
  const registry = createPortalRegistry<ReactNode, ReactScriptContext>();
  const portalDisposers = new Map<number, () => void>();
  let nextId = 0;
  let reactHost: HTMLDivElement | undefined;
  let reactRoot: ReturnType<typeof createRoot> | undefined;
  let portalObserver: MutationObserver | undefined;
  let runtimeDisposed = false;
  const ensureReactHost = () => {
    if (runtimeDisposed) throw new Error("React bundle runtime already disposed");
    if (reactRoot) return;
    reactHost = host.document.createElement("div");
    reactHost.dataset.rodReactHost = "bundle";
    (host.document.body || host.document.documentElement).append(reactHost);
    portalObserver = new host.MutationObserver(() => {
      for (const id of registry.pruneDisconnected()) portalDisposers.get(id)?.();
    });
    portalObserver.observe(host.document, { childList: true, subtree: true });
    reactRoot = createRoot(reactHost);
    reactRoot.render(<PortalRegistry registry={registry} />);
  };
  const disposeReactHost = () => {
    runtimeDisposed = true;
    portalObserver?.disconnect();
    portalObserver = undefined;
    for (const dispose of [...portalDisposers.values()]) dispose();
    portalDisposers.clear();
    registry.clear();
    reactRoot?.unmount();
    reactRoot = undefined;
    reactHost?.remove();
    reactHost = undefined;
  };
  const mountSharedReact = (component: ReactElement, container: HTMLElement) => {
    if (runtimeDisposed) throw new Error("React bundle runtime already disposed");
    const id = ++nextId;
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      portalDisposers.delete(id);
      registry.remove(id);
    };
    portalDisposers.set(id, dispose);
    const update = (next: ReactElement) => {
      if (disposed || !container.isConnected) return;
      ensureReactHost();
      registry.add({ id, target: container, node: next });
    };
    update(component);
    return { update, dispose };
  };
  const runtime = createCoreRuntime(definitions, bridge, host, release, {
    mountSharedReact: (component, container) => mountSharedReact(component, container),
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
    createSpecificContext: ({ definition, abort, onDispose, ensureUIRoot, getContext }) => {
      return {
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
          pageStyle(css: string, options?: { id?: string }) {
            const target = host.document.head || host.document.documentElement;
            const id = options?.id;
            const existing = id ? host.document.getElementById(id) : null;
            if (existing instanceof HTMLStyleElement) {
              existing.textContent = String(css);
              return existing;
            }
            const node = host.document.createElement("style");
            if (id) node.id = id;
            node.textContent = String(css);
            target.append(node);
            onDispose(() => node.remove());
            return node;
          },
          registerStyles(...styles: ShadowStyle[]) {
            const dispose = registerShadowStyles(ensureUIRoot(), styles);
            onDispose(dispose);
            return dispose;
          },
          mountReact(component: ReactElement, container?: Element | ShadowRoot) {
            if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
            const mountPoint = container ?? host.document.createElement("div");
            const owned = !container;
            if (owned) ensureUIRoot().append(mountPoint);
            const id = ++nextId;
            let disposed = false;
            const dispose = () => {
              if (disposed) return;
              disposed = true;
              portalDisposers.delete(id);
              registry.remove(id);
              if (owned) (mountPoint as Element).remove();
            };
            portalDisposers.set(id, dispose);
            try {
              ensureReactHost();
              registry.add({ id, target: mountPoint, node: component, context: getContext() });
              onDispose(dispose);
            } catch (error) {
              dispose();
              captureDiagnostic(error, REACT_MOUNT_SOURCE, definition.id, host);
              throw error;
            }
            return dispose;
          },
        }),
      };
    },
  });
  const disposeRuntime = runtime.dispose.bind(runtime);
  return {
    mountSharedReact,
    get ready() {
      return runtime.ready;
    },
    get active() {
      return runtime.active;
    },
    navigate: () => runtime.navigate(),
    dispose: async () => {
      try {
        await disposeRuntime();
      } finally {
        disposeReactHost();
      }
    },
  };
}
