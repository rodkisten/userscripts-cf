import { createClipboardManager } from "../../clipboard-manager.js";

export function createClipboardFeature(host: Window & typeof globalThis) {
  return host.indexedDB ? createClipboardManager({ host }) : null;
}
