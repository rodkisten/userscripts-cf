import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";

type MountTarget = HTMLElement | ShadowRoot | SVGElement;
type Mount = { root: Root; dispose: () => void };
const mounts = new WeakMap<MountTarget, Mount>();
const active = new Map<MountTarget, { mount: Mount; connected: boolean }>();
let observer: MutationObserver | undefined;

function releaseDetachedViews() {
  for (const [target, record] of active) {
    if (target.isConnected) record.connected = true;
    else if (record.connected) record.mount.dispose();
  }
}

function observeMounts() {
  if (observer || typeof MutationObserver === "undefined") return;
  observer = new MutationObserver(releaseDetachedViews);
  observer.observe(document, { childList: true, subtree: true });
}

/** React root owned by each integration target. */
export function mountView(target: MountTarget, read: () => ReactNode) {
  observeMounts();
  for (const [child, record] of active)
    if (child !== target && target.contains(child)) record.mount.dispose();
  let mount = mounts.get(target);
  if (!mount) {
    const root = createRoot(target);
    mount = {
      root,
      dispose: () => {
        root.unmount();
        mounts.delete(target);
        active.delete(target);
      },
    };
    mounts.set(target, mount);
    active.set(target, { mount, connected: target.isConnected });
  }
  // Legacy integration code reads the mounted DOM immediately.
  flushSync(() => mount.root.render(<>{read()}</>));
  releaseDetachedViews();
}

export function disposeView(target: MountTarget) {
  mounts.get(target)?.dispose();
}
