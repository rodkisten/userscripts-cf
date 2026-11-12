import { createSignal, flush, type Element } from "solid-js";
import { render } from "@solidjs/web";

type MountTarget = HTMLElement | ShadowRoot | SVGElement;
type View = { read: () => Element };
type Mount = { update: (view: View) => void; dispose: () => void };
const mounts = new WeakMap<MountTarget, Mount>();
const active = new Map<MountTarget, { mount: Mount; connected: boolean }>();
let observer: MutationObserver;
function releaseDetachedViews() {
  for (const [target, record] of [...active]) {
    if (target.isConnected) record.connected = true;
    else if (record.connected) record.mount.dispose();
  }
}
function observeMounts() {
  if (observer) return;
  observer = new MutationObserver(releaseDetachedViews);
  observer.observe(document, { childList: true, subtree: true });
}

/** Own one Solid root per integration point in X or a shadow tree. */
export function mountView(target: MountTarget, read: () => Element) {
  observeMounts();
  // A parent view owns the integration roots mounted inside its old content.
  for (const [child, record] of [...active]) {
    if (child !== target && target.contains(child)) record.mount.dispose();
  }
  const existing = mounts.get(target);
  if (existing) {
    existing.update({ read });
  } else {
    const [view, setView] = createSignal<View>({ read });
    const dispose = render(() => <>{view().read()}</>, target);
    const mount = {
      update: (next: View) => setView(next),
      dispose: () => {
        dispose();
        mounts.delete(target);
        active.delete(target);
      },
    };
    mounts.set(target, mount);
    active.set(target, { mount, connected: target.isConnected });
  }
  // Existing integration handlers query refs immediately after a view update.
  flush();
  releaseDetachedViews();
}

export function disposeView(target: MountTarget) {
  mounts.get(target)?.dispose();
}
