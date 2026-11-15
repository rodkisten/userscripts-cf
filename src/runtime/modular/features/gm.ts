import { createGMBridge } from "../../gm-bridge.js";

export function createGMFeature(host: Window & typeof globalThis, moduleId: string) {
  return createGMBridge(host, moduleId);
}
