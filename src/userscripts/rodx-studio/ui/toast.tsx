import { mountView, disposeView } from "./react-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import styles, { css } from "./toast.module.css";

type ToastKind = "info" | "success" | "warning" | "error";
type ToastState = { message: string; kind: ToastKind };
let host: HTMLDivElement | undefined;
let container: HTMLDivElement | undefined;
let currentToast: ToastState = { message: "", kind: "info" };
export let rodxToastTimer: ReturnType<typeof setTimeout> | undefined;

export function initializeDeckRodxToastTimer() {
  disposeRodxToast();
}

/** Release pending timeout and portal before the runtime context is torn down. */
export function disposeRodxToast() {
  clearTimeout(rodxToastTimer);
  rodxToastTimer = undefined;
  disposeToast();
}

function disposeToast() {
  if (container) disposeView(container);
  container = undefined;
  host?.remove();
  host = undefined;
}

function ensureToast() {
  if (host?.isConnected && container) return;
  disposeToast();
  host = document.createElement("div");
  host.id = "rodx-native-toast";
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  sheet.textContent = css;
  shadow.append(sheet);
  container = document.createElement("div");
  container.id = "rodx-toast";
  shadow.append(container);
  (document.body || document.documentElement).append(host);
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
  if (container) mountView(container, () => <ToastView {...currentToast} />);
  clearTimeout(rodxToastTimer);
  rodxToastTimer = setTimeout(() => {
    disposeToast();
    rodxToastTimer = undefined;
  }, RUNTIME_LIMITS.uiToast.showRodxToastDelayMs);
}
