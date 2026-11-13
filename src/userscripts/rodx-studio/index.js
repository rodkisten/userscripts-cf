import { initializeNetwork } from "./bootstrap/initializeNetwork.js";
import { initializeDeck } from "./bootstrap/initializeDeck.js";
import { openPanel } from "./ui/preferences.js";
export function startRodX() {
  if (window.__rodxStudioV3) return;
  window.__rodxStudioV3 = true;
  initializeNetwork();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initializeDeck, { once: true });
  else initializeDeck();
}
export default {
  init(ctx) {
    ctx.dock.register([
      { id: "saved", label: "Pesquisas", run: () => openPanel("saved") },
      { id: "editor", label: "Editor", run: () => openPanel("editor") },
      { id: "presets", label: "Presets", run: () => openPanel("presets") },
    ]);
    startRodX();
  },
};
