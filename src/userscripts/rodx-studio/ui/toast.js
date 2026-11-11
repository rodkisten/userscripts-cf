export let rodxToastTimer;

export function initializeDeckRodxToastTimer() {
  rodxToastTimer = 0;
}

export function showRodxToast(message, kind = "info") {
  let toast = document.getElementById("rodx-native-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "rodx-native-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.style.background = kind === "error" ? "#b4232c" : "#202327";
  toast.style.color = "#fff";
  toast.textContent = String(message || "");
  clearTimeout(rodxToastTimer);
  rodxToastTimer = setTimeout(() => toast.remove(), 2600);
}
