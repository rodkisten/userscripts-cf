import { createCoreRuntime, type RuntimeAPI, type ScriptDefinition } from "./runtime.js";

export interface RuntimeBridge {
  call(method: string, payload: unknown): Promise<unknown>;
  dispose?(): void;
}

export interface RuntimeReleaseMetadata {
  readonly id: string;
  readonly version: string;
  readonly manifestURL: string;
}

/**
 * Framework-free runtime entrypoint for userscripts that do not need shared
 * React UI capabilities. Keeping this entry isolated prevents react-dom/client
 * from becoming a fixed cost of every userscript bundle.
 */
export function createRuntime(
  definitions: ScriptDefinition[],
  bridge: RuntimeBridge,
  host: Window & typeof globalThis = window,
  release?: RuntimeReleaseMetadata,
): RuntimeAPI {
  return createCoreRuntime(definitions, bridge, host, release);
}
