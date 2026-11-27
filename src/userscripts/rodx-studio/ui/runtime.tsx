import { useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import styles, { css } from "./components.module.css";

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

export function configureSharedMount(
  mount: (component: ReactElement, target: Element | ShadowRoot) => () => void,
) {
  if (mounts.size) {
    throw new Error("RodX mount adapter already initialized");
  }
  sharedMount = mount;
}

function releaseDetachedViews() {
  for (const [target, record] of mounts) {
    if (target.isConnected) {
      record.connected = true;
    } else if (record.connected) {
      record.dispose?.();
      mounts.delete(target);
    }
  }
}

function observeMounts() {
  if (observer || typeof MutationObserver === "undefined") {
    return;
  }
  observer = new MutationObserver(releaseDetachedViews);
  observer.observe(document, { childList: true, subtree: true });
}

export function mountView(target: MountTarget, read: () => ReactNode) {
  if (!sharedMount) {
    throw new Error("RodX React mount adapter must be configured before mounting views");
  }
  observeMounts();
  for (const [child, record] of mounts) {
    if (child !== target && target.contains(child)) {
      record.dispose?.();
      mounts.delete(child);
    }
  }
  const previous = mounts.get(target);
  if (previous) {
    previous.node = read();
    if (previous.listeners?.size) {
      flushSync(() => previous.listeners?.forEach((listener) => listener()));
    }
  } else {
    const record: Mount = { id: ++nextMountId, node: read(), connected: target.isConnected };
    record.listeners = new Set();
    mounts.set(target, record);
    try {
      flushSync(() => {
        record.dispose = sharedMount!(<SharedView record={record} />, target);
      });
    } catch (error) {
      record.dispose?.();
      mounts.delete(target);
      throw error;
    }
  }
  releaseDetachedViews();
}

export function disposeView(target: MountTarget) {
  const record = mounts.get(target);
  if (!record) {
    return;
  }
  record.dispose?.();
  mounts.delete(target);
}

export function disposeAllViews() {
  observer?.disconnect();
  observer = undefined;
  for (const record of mounts.values()) {
    record.dispose?.();
  }
  mounts.clear();
  sharedMount = undefined;
}

type ToastKind = "info" | "success" | "warning" | "error";
type ToastState = { message: string; kind: ToastKind };

let toastHost: HTMLDivElement | undefined;
let toastContainer: HTMLDivElement | undefined;
let currentToast: ToastState = { message: "", kind: "info" };
export let rodxToastTimer: ReturnType<typeof setTimeout> | undefined;

export function initializeDeckRodxToastTimer() {
  disposeRodxToast();
}

function disposeToast() {
  if (toastContainer) {
    disposeView(toastContainer);
  }
  toastContainer = undefined;
  toastHost?.remove();
  toastHost = undefined;
}

export function disposeRodxToast() {
  clearTimeout(rodxToastTimer);
  rodxToastTimer = undefined;
  disposeToast();
}

function ensureToast() {
  if (toastHost?.isConnected && toastContainer) {
    return;
  }
  disposeToast();
  toastHost = document.createElement("div");
  toastHost.id = "rodx-native-toast";
  const shadow = toastHost.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  sheet.textContent = css;
  shadow.append(sheet);
  toastContainer = document.createElement("div");
  toastContainer.id = "rodx-toast";
  shadow.append(toastContainer);
  (document.body || document.documentElement).append(toastHost);
}

function ToastView({ message, kind }: ToastState) {
  return (
    <div
      className={`${styles.toast} ${kind === "error" ? styles.error : ""}`}
      role="status"
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      {message}
    </div>
  );
}

export function showRodxToast(message: unknown, kind: ToastKind = "info") {
  ensureToast();
  currentToast = { message: String(message || ""), kind };
  if (toastContainer) {
    mountView(toastContainer, () => <ToastView {...currentToast} />);
  }
  clearTimeout(rodxToastTimer);
  rodxToastTimer = setTimeout(() => {
    disposeToast();
    rodxToastTimer = undefined;
  }, RUNTIME_LIMITS.uiToast.showRodxToastDelayMs);
}
