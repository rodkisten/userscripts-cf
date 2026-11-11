import { RUNTIME_LIMITS } from "../../../config/runtime.js";
export let rodxToastTimer;

export function initializeDeckRodxToastTimer() {
  rodxToastTimer = 0;
}

export function showRodxToast(message, kind = "info") {
  let toast = document.getElementById("rodx-native-toast");
  if (!toast) {
    toast = (<div />) as HTMLDivElement;
    toast.id = "rodx-native-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.style.setProperty("background", kind === "error" ? "#b4232c" : "#202327", "important");
  toast.style.setProperty("color", "#fff", "important");
  toast.textContent = String(message || "");
  clearTimeout(rodxToastTimer);
  rodxToastTimer = setTimeout(() => toast.remove(), RUNTIME_LIMITS.uiToast.showRodxToastDelayMs);
}
