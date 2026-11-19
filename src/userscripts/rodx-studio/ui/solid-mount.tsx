import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { flushSync } from "react-dom";

type MountTarget = HTMLElement | ShadowRoot | SVGElement;
type Mount = {
  id: number;
  node: ReactNode;
  connected: boolean;
  dispose?: () => void;
  listeners?: Set<() => void>;
};
let nextMountId = 0;
const mounts = new Map<MountTarget, Mount>();
let observer: MutationObserver | undefined;
let sharedMount: ((component: ReactElement, target: Element | ShadowRoot) => () => void) | undefined;

function SharedView({ record }: { record: Mount }) {
  const node = useSyncExternalStore(
    (listener) => {
      record.listeners?.add(listener);
      return () => record.listeners?.delete(listener);
    },
    () => record.node,
  );
  return <>{node}</>;
}

/** Attach RodX portals to the owning userscript runtime when available. */
export function configureSharedMount(
  mount: (component: ReactElement, target: Element | ShadowRoot) => () => void,
) {
  if (mounts.size) throw new Error("RodX mount adapter already initialized");
  sharedMount = mount;
}

function releaseDetachedViews() {
  for (const [target, record] of mounts) {
    if (target.isConnected) record.connected = true;
    else if (record.connected) {
      record.dispose?.();
      mounts.delete(target);
    }
  }
}

function observeMounts() {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver(releaseDetachedViews);
  observer.observe(document, { childList: true, subtree: true });
}

/** One React root per RodX execution world, with a portal for each integration target. */
export function mountView(target: MountTarget, read: () => ReactNode) {
  if (!sharedMount) throw new Error("RodX React mount adapter must be configured before mounting views");
  observeMounts();
  for (const [child, record] of mounts)
    if (child !== target && target.contains(child)) {
      record.dispose?.();
      mounts.delete(child);
    }
  const previous = mounts.get(target);
  if (previous) {
    previous.node = read();
    if (previous.listeners?.size) {
      flushSync(() => previous.listeners?.forEach((listener) => listener()));
    }
  } else {
    const record: Mount = { id: ++nextMountId, node: read(), connected: target.isConnected };
    // The runtime portal registry owns all RodX views, including Shadow DOM targets.
    record.listeners = new Set();
    flushSync(() => {
      record.dispose = sharedMount(<SharedView record={record} />, target);
    });
    mounts.set(target, record);
  }
  releaseDetachedViews();
}

export function disposeView(target: MountTarget) {
  const record = mounts.get(target);
  if (!record) return;
  record.dispose?.();
  mounts.delete(target);
}

/** Release the entire shared root on userscript teardown or explicit restart. */
export function disposeAllViews() {
  observer?.disconnect();
  observer = undefined;
  for (const record of mounts.values()) record.dispose?.();
  mounts.clear();
  sharedMount = undefined;
}
