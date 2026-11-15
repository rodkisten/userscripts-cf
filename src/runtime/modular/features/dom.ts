import { createDomEngine } from "../../dom-engine.js";

export function createDomFeature(host: Window & typeof globalThis, signal: AbortSignal) {
  return createDomEngine({ root: host.document, signal });
}
