import { Studio } from "./core/studio.js";
import { ScriptContext } from "../../core/runtime";
import { initializeNetwork } from "./bootstrap/initializeNetwork.js";
import { initializeDeck } from "./bootstrap/initializeDeck.js";
import { openPanel, Preferences } from "./ui/preferences.js";


export function startRodX(ctx: ScriptContext) {
  if (window.__rodxStudioV3) return;
  window.__rodxStudioV3 = true;
  initializeNetwork();
  Studio.ctx = ctx;
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initializeDeck, { once: true });
  else initializeDeck();
}

export default {
  init(ctx: ScriptContext) {
    ctx.dock?.register([
      { id: "saved", label: "Pesquisas", run: () => openPanel("saved") },
      { id: "editor", label: "Editor", run: () => openPanel("editor") },
      { id: "presets", label: "Presets", run: () => openPanel("presets") },
      { id: "rodx-settings", label: "Preferências do X", run: () => openPanel("visual") },
      { id: "rodx-feed-filters", label: "Filtros do feed", run: () => Preferences?.filters() },
    ]);
    startRodX(ctx);
  },
};
