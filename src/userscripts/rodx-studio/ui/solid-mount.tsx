import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { flushSync } from "react-dom";

type MountTarget = HTMLElement | ShadowRoot | SVGElement;
type Mount = { node: ReactNode; connected: boolean };
const mounts = new Map<MountTarget, Mount>();
let root: Root | undefined;
let host: HTMLElement | undefined;
let observer: MutationObserver | undefined;

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
  if (!root && mounts.size === 0) return;
  const current = ensureRoot();
  flushSync(() =>
    current.render(
      <>
        {[...mounts].map(([target, mount]) =>
          createPortal(<>{mount.node}</>, target),
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
  for (const child of mounts.keys())
    if (child !== target && target.contains(child)) mounts.delete(child);
  mounts.set(target, { node: read(), connected: target.isConnected });
  render();
  releaseDetachedViews();
}

export function disposeView(target: MountTarget) {
  if (!mounts.delete(target)) return;
  render();
}

/** Release the entire shared root on userscript teardown or explicit restart. */
export function disposeAllViews() {
  observer?.disconnect();
  observer = undefined;
  mounts.clear();
  root?.unmount();
  root = undefined;
  host?.remove();
  host = undefined;
}
