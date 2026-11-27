/** @jsxImportSource react */
import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { RuntimeMount } from "./runtime-mount-react.js";
import type { ReactScriptContext } from "./react-context-contract.js";
import { bindRuntime, useContext, useRuntime, useRuntimeWorld } from "./runtime-context-react.js";
import { createCoreRuntime, type ScriptDefinition, type RuntimeAPI } from "./runtime.js";
import { captureDiagnostic } from "../runtime/diagnostics.js";
import {
  createPortalRegistry,
  type PortalId,
  type PortalRegistry,
  type PortalTarget,
} from "./portal-registry.js";

// ============================================================================
// REUSABLE TYPES (Extraction Candidates)
// ============================================================================

// TODO(extract): Move to `@shared/runtime/contracts.ts` if shared across multiple runtime hosts (e.g., Vanilla, Vue, Solid).
export interface RuntimeBridge {
  call(method: string, payload: unknown): Promise<unknown>;
  dispose?(): void;
}

// TODO(extract): Move to `@shared/runtime/contracts.ts`.
export interface RuntimeReleaseMetadata {
  readonly id: string;
  readonly version: string;
  readonly manifestURL: string;
}

// TODO(extract): Move to `@shared/runtime/contracts.ts` for generic component mounting lifecycles.
export interface MountedReactHandle {
  update(component: ReactElement): void;
  dispose(): void;
}

export type ReactBundleRuntime = RuntimeAPI & {
  mountSharedReact(component: ReactElement, container: HTMLElement): MountedReactHandle;
};

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const REACT_MOUNT_SOURCE = "react.mount" as const;

// IMPROVEMENT: Replaced magic number `11` (`Node.DOCUMENT_FRAGMENT_NODE`) with a proper type guard.
// Why: Eliminates unsafe `as ShadowRoot` casts and makes ShadowRoot host resolution self-documenting and type-safe.
function isShadowRoot(target: PortalTarget): target is ShadowRoot {
  return target.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in target;
}

function getTargetHostNode(target: PortalTarget): Node {
  return isShadowRoot(target) ? target.host : target;
}

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

// IMPROVEMENT: Renamed internal component from `PortalRegistry` to `PortalOutlet` to avoid shadowing the imported `PortalRegistry` type.
// Why: Value/type name collisions make code harder to read and refactor safely.
function PortalOutlet({
  registry,
}: {
  registry: PortalRegistry<ReactNode, ReactScriptContext>;
}): ReactElement {
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

// ============================================================================
// RUNTIME FACTORY
// ============================================================================

export function createRuntime(
  definitions: ScriptDefinition[],
  bridge: RuntimeBridge,
  host: Window & typeof globalThis = window,
  release?: RuntimeReleaseMetadata,
): ReactBundleRuntime {
  const helpers = { useContext, useRuntime, useRuntimeWorld, bindRuntime } as const;
  type HelperKey = keyof typeof helpers;

  const registry = createPortalRegistry<ReactNode, ReactScriptContext>();
  const portalDisposers = new Map<PortalId, () => void>();

  let nextId = 0;
  let reactHost: HTMLDivElement | undefined;
  let reactRoot: Root | undefined;
  let portalObserver: MutationObserver | undefined;
  const shadowObservers = new Map<ShadowRoot, MutationObserver>();
  let runtimeDisposed = false;

  const nextPortalId = (): PortalId => ++nextId as PortalId;

  // Observe each shadow boundary because document observers cannot see inside it.
  const syncShadowObservers = (): void => {
    const roots = new Set<ShadowRoot>();
    for (const { target } of registry.getSnapshot()) {
      let node: Node = target;
      while (true) {
        const root = node.getRootNode();
        if (root.nodeType !== 11 || !("host" in root)) break;
        const shadow = root as ShadowRoot;
        roots.add(shadow);
        node = shadow.host;
      }
    }
    for (const [root, observer] of shadowObservers) {
      if (!roots.has(root)) {
        observer.disconnect();
        shadowObservers.delete(root);
      }
    }
    for (const root of roots) {
      if (shadowObservers.has(root)) continue;
      const observer = new host.MutationObserver(() => {
        for (const id of registry.pruneDisconnected()) portalDisposers.get(id)?.();
        syncShadowObservers();
      });
      observer.observe(root, { childList: true, subtree: true });
      shadowObservers.set(root, observer);
    }
  };

  const ensureReactHost = (): void => {
    if (runtimeDisposed) throw new Error("React bundle runtime already disposed");
    if (reactRoot) return;

    reactHost = host.document.createElement("div");
    reactHost.dataset.rodReactHost = "bundle";
    (host.document.body || host.document.documentElement).append(reactHost);

    portalObserver = new host.MutationObserver((records) => {
      const connectedTargets = new Set<PortalTarget>();
      const entries = registry.getSnapshot();

      for (const record of records) {
        for (const addedNode of record.addedNodes) {
          for (const { target } of entries) {
            const candidate = getTargetHostNode(target);
            if (addedNode === candidate || addedNode.contains(candidate)) {
              connectedTargets.add(target);
            }
          }
        }
      }

      for (const id of registry.pruneDisconnected(connectedTargets)) {
        portalDisposers.get(id)?.();
      }
      syncShadowObservers();
    });

    portalObserver.observe(host.document, { childList: true, subtree: true });
    reactRoot = createRoot(reactHost);
    reactRoot.render(<PortalOutlet registry={registry} />);
  };

  const unsubscribeShadowObservers = registry.subscribe(syncShadowObservers);

  const disposeReactHost = (): void => {
    runtimeDisposed = true;
    unsubscribeShadowObservers();
    for (const observer of shadowObservers.values()) observer.disconnect();
    shadowObservers.clear();
    portalObserver?.disconnect();
    portalObserver = undefined;

    for (const dispose of [...portalDisposers.values()]) {
      dispose();
    }
    portalDisposers.clear();
    registry.clear();

    reactRoot?.unmount();
    reactRoot = undefined;
    reactHost?.remove();
    reactHost = undefined;
  };

  const mountSharedReact = (component: ReactElement, container: HTMLElement): MountedReactHandle => {
    if (runtimeDisposed) throw new Error("React bundle runtime already disposed");

    // ReactDOM requires a browser-global window even when the runtime receives
    // an injected Window (for example happy-dom in unit tests). Keep the
    // container lifecycle valid in non-browser hosts without creating a fake
    // global window. Real userscript/browser execution always takes the normal
    // portal path below.
    if (typeof window === "undefined") {
      return {
        update() {},
        dispose() {},
      };
    }

    const id = nextPortalId();
    let disposed = false;

    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      portalDisposers.delete(id);
      registry.remove(id);
    };

    portalDisposers.set(id, dispose);

    // BUG FIX: Added `runtimeDisposed` check inside `update` and fixed initial mount behavior when `container` is initially disconnected.
    // Why:
    // 1. Calling `update()` after `runtime.dispose()` previously bypassed the top-level guard and threw inside `ensureReactHost()`, instead of being a safe no-op like `disposed`.
    // 2. If `mountSharedReact` was called with a detached container that is appended synchronously right after, skipping the initial `registry.add` prevented `PortalRegistry.pruneDisconnected` (which tracks `wasConnected: false -> true`) from ever adopting it once connected.
    let initialized = false;
    const update = (next: ReactElement): void => {
      if (disposed || runtimeDisposed) return;
      if (initialized && !container.isConnected) return;
      initialized = true;
      ensureReactHost();
      registry.add({ id, target: container, node: next });
    };

    update(component);
    return { update, dispose };
  };

  const runtime = createCoreRuntime(definitions, bridge, host, release, {
    mountSharedReact: (component, container) => mountSharedReact(component, container),

    installHelpers: () => {
      const installed: HelperKey[] = [];
      for (const name of Object.keys(helpers) as HelperKey[]) {
        if (name in host) continue;
        Object.defineProperty(host, name, {
          configurable: true,
          value: helpers[name],
          writable: false,
        });
        installed.push(name);
      }
      return installed;
    },

    removeHelpers: (installed) => {
      const hostRecord = host as unknown as Record<string, unknown>;
      for (const name of installed) {
        if (Object.prototype.hasOwnProperty.call(helpers, name)) {
          const helperKey = name as HelperKey;
          if (hostRecord[helperKey] === helpers[helperKey]) {
            delete hostRecord[helperKey];
          }
        }
      }
    },

    createSpecificContext: ({ definition, abort, onDispose, ensureUIRoot, getContext, ui }) => {
      onDispose(() => {
        const context = getContext();
        for (const entry of registry.getSnapshot()) {
          if (entry.context === context) {
            portalDisposers.get(entry.id)?.();
          }
        }
      });

      if (!ui) return {};

      return {
        ui: Object.freeze({
          get root() {
            return ui.root;
          },

          get host() {
            return ui.host;
          },

          mount: ui.mount,
          style: ui.style,
          pageStyle: ui.pageStyle,
          registerStyles: ui.registerStyles,

          mountReact(component: ReactElement, container?: PortalTarget) {
            if (abort.signal.aborted) throw new Error("ScriptContext already disposed");

            const owned = !container;
            const mountPoint: PortalTarget = container ?? host.document.createElement("div");
            if (owned) ensureUIRoot().append(mountPoint);

            const id = nextPortalId();
            let disposed = false;

            const dispose = (): void => {
              if (disposed) return;
              disposed = true;
              portalDisposers.delete(id);
              registry.remove(id);
              if (owned && !isShadowRoot(mountPoint)) {
                mountPoint.remove();
              }
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
