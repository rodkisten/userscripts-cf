import { initializeOuterXDOM } from "../platform/selectors.js";
import { initializeOuterStudio, Studio } from "../core/studio.js";
import { connectStudioNetwork } from "../network/bridge.js";
import { createNetworkInspector } from "../network/inspector.tsx";
import { createStudioMenus } from "../ui/menu.js";

export function initializeNetwork() {
  initializeOuterXDOM();
  initializeOuterStudio();
  Studio.menu = createStudioMenus(Studio);

  try {
    sessionStorage.removeItem("rodx:feed:routes");
  } catch {}

  connectStudioNetwork(Studio);
  createNetworkInspector(Studio);
}
