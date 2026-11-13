import { createSignal } from "solid-js";
import { mountSolidShadow } from "../../../runtime/solid-ui/shadow-mount";
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
  (document.body || document.documentElement).append(host);
  const [toast, update] = createSignal<ToastState>({ message: "", kind: "info" });
  setToast = update;
  dispose = mountSolidShadow(
    () => (
      <div
        class={`${styles.toast} ${toast().kind === "error" ? styles.error : ""}`}
        role="status"
        aria-live={toast().kind === "error" ? "assertive" : "polite"}
      >
        {toast().message}
      </div>
    ),
    { target: host, styles: [css], id: "rodx-toast" },
  );
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
