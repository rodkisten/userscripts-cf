import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal, flushSync } from "react-dom";

type MountTarget = HTMLElement | ShadowRoot | SVGElement;
type Mount = { id: number; node: ReactNode; connected: boolean; dispose?: () => void; listeners?: Set<() => void> };
let nextMountId = 0;
const mounts = new Map<MountTarget, Mount>();
let root: Root | undefined;
let host: HTMLElement | undefined;
let observer: MutationObserver | undefined;
let sharedMount: ((component: ReactElement, target: HTMLElement) => () => void) | undefined;

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
export function configureSharedMount(mount: (component: ReactElement, target: HTMLElement) => () => void) {
  if (mounts.size || root) throw new Error("RodX mount adapter already initialized");
  sharedMount = mount;
}


function ensureRoot() {
  if (root) return root;
  host = document.createElement("div");
  host.dataset.rodxReactHost = "shared";
  host.style.display = "none";
  (document.body || document.documentElement).append(host);
  root = createRoot(host);
  return root;
}

function render() {
  if (sharedMount) return;
  if (!mounts.size) {
    if (root) flushSync(() => root?.render(null));
    return;
  }
  const current = ensureRoot();
  flushSync(() =>
    current.render(
      <>
        {[...mounts].map(([target, mount]) =>
          createPortal(<>{mount.node}</>, target, String(mount.id)),
        )}
      </>,
    ),
  );
}

function releaseDetachedViews() {
  let changed = false;
  for (const [target, record] of mounts) {
    if (target.isConnected) record.connected = true;
    else if (record.connected) {
      record.dispose?.();
      mounts.delete(target);
      changed = true;
    }
  }
  if (changed) render();
}

function observeMounts() {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver(releaseDetachedViews);
  observer.observe(document, { childList: true, subtree: true });
}

/** One React root per RodX execution world, with a portal for each integration target. */
export function mountView(target: MountTarget, read: () => ReactNode) {
  observeMounts();
  for (const [child, record] of mounts)
    if (child !== target && target.contains(child)) {
      record.dispose?.();
      mounts.delete(child);
    }
  const previous = mounts.get(target);
  if (previous) {
    previous.node = read();
    previous.listeners?.forEach((listener) => listener());
  } else {
    const record: Mount = { id: ++nextMountId, node: read(), connected: target.isConnected };
    if (sharedMount) {
      // Runtime mount targets must be HTMLElements; ShadowRoot/SVG use the legacy portal registry.
      if (!(target instanceof HTMLElement)) throw new Error("RodX shared runtime mount requires HTMLElement target");
      record.listeners = new Set();
      record.dispose = sharedMount(<SharedView record={record} />, target);
    }
    mounts.set(target, record);
  }
  render();
  releaseDetachedViews();
}

export function disposeView(target: MountTarget) {
  const record = mounts.get(target);
  if (!record) return;
  record.dispose?.();
  mounts.delete(target);
  render();
}

/** Release the entire shared root on userscript teardown or explicit restart. */
export function disposeAllViews() {
  observer?.disconnect();
  observer = undefined;
  for (const record of mounts.values()) record.dispose?.();
  mounts.clear();
  sharedMount = undefined;
  if (root) flushSync(() => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
}
