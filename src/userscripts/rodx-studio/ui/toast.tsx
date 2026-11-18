import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import styles, { css } from "./toast.module.css";

type ToastKind = "info" | "success" | "warning" | "error";
type ToastState = { message: string; kind: ToastKind };
let host: HTMLDivElement | undefined;
let root: Root | undefined;
export let rodxToastTimer: ReturnType<typeof setTimeout> | undefined;

export function initializeDeckRodxToastTimer() {
  clearTimeout(rodxToastTimer);
  rodxToastTimer = undefined;
}

function disposeToast() {
  root?.unmount();
  root = undefined;
  host?.remove();
  host = undefined;
}

function ensureToast() {
  if (host?.isConnected && root) return;
  disposeToast();
  host = document.createElement("div");
  host.id = "rodx-native-toast";
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  sheet.textContent = css;
  shadow.append(sheet);
  const container = document.createElement("div");
  container.id = "rodx-toast";
  shadow.append(container);
  (document.body || document.documentElement).append(host);
  root = createRoot(container);
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
  flushSync(() => root?.render(<ToastView message={String(message || "")} kind={kind} />));
  clearTimeout(rodxToastTimer);
  rodxToastTimer = setTimeout(() => {
    disposeToast();
    rodxToastTimer = undefined;
  }, RUNTIME_LIMITS.uiToast.showRodxToastDelayMs);
}
