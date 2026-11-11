import { initializeNetwork } from "./bootstrap/initializeNetwork.js";
import { initializeDeck } from "./bootstrap/initializeDeck.js";
export function startRodX() {
  if (window.__rodxStudioV3) return;
  window.__rodxStudioV3 = true;
  initializeNetwork();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initializeDeck, { once: true });
  else initializeDeck();
}
export default {
  init() {
    startRodX();
  },
};
