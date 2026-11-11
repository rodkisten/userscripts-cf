import { Studio } from "../core/studio.js";
import { connectStudioNetwork } from "../network/bridge.js";
import { createNetworkInspector } from "../network/inspector.tsx";
import { createStudioMenus } from "../ui/menu.js";

export function initializeRodX_outer_13() {
  Studio.menu = createStudioMenus(Studio);
}

export function initializeRodX_outer_14() {
  try {
    sessionStorage.removeItem("rodx:feed:routes");
  } catch {}
}

export function initializeRodX_outer_15() {
  connectStudioNetwork(Studio);
}

export function initializeRodX_outer_16() {
  createNetworkInspector(Studio);
}
