import { createSignal } from "solid-js";
import { render } from "@solidjs/web";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import styles, { css } from "./toast.module.css";

type ToastKind = "info" | "success" | "warning" | "error";
type ToastState = { message: string; kind: ToastKind };
let host: HTMLDivElement | undefined;
let dispose: (() => void) | undefined;
let setToast: ((next: ToastState) => void) | undefined;
export let rodxToastTimer: ReturnType<typeof setTimeout> | undefined;

export function initializeDeckRodxToastTimer() {
  clearTimeout(rodxToastTimer);
  rodxToastTimer = undefined;
}

function ensureToast() {
  if (host?.isConnected && setToast) return;
  dispose?.();
  host?.remove();
  host = document.createElement("div");
  host.id = "rodx-native-toast";
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = document.createElement("style");
  sheet.textContent = css;
  shadow.append(sheet);
  const container = document.createElement("div");
  shadow.append(container);
  (document.body || document.documentElement).append(host);
  const [toast, update] = createSignal<ToastState>({ message: "", kind: "info" });
  setToast = update;
  dispose = render(() => (
    <div
      class={styles.toast}
      classList={{ [styles.error]: toast().kind === "error" }}
      role="status"
      aria-live={toast().kind === "error" ? "assertive" : "polite"}
    >
      {toast().message}
    </div>
  ), container);
}

export function showRodxToast(message: unknown, kind: ToastKind = "info") {
  ensureToast();
  setToast?.({ message: String(message || ""), kind });
  clearTimeout(rodxToastTimer);
  rodxToastTimer = setTimeout(() => {
    dispose?.();
    dispose = undefined;
    setToast = undefined;
    host?.remove();
    host = undefined;
    rodxToastTimer = undefined;
  }, RUNTIME_LIMITS.uiToast.showRodxToastDelayMs);
}
