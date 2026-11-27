import type { BrotoDebugOptions, BrotoDebugSnapshot } from "@rodkisten/broto/types";

/** Mutable debug counters for Broto. */
export const brotoDebugState: BrotoDebugSnapshot = {
  enabled: false,
  signals: 0,
  effects: 0,
  computed: 0,
  stores: 0,
  resources: 0,
  flushes: 0,
  updates: 0,
  retainDisposed: false,
  maxEntries: 1000,
};

/** Enables or disables debug counters. */
export function setDebug(enabled: boolean): void {
  brotoDebugState.enabled = enabled;
}

/**
 * Configures Broto debug retention.
 *
 * @remarks
 * This is additive and keeps production fast by allowing disposed diagnostics to
 * be aggressively pruned. Counters remain cheap even when debug is disabled.
 *
 * @param options - Debug configuration.
 * @returns void.
 *
 * @example
 * ```ts
 * configureDebug({ enabled: true, retainDisposed: false, maxEntries: 500 });
 * ```
 */
export function configureDebug(options: BrotoDebugOptions = {}): void {
  if (typeof options.enabled === "boolean") brotoDebugState.enabled = options.enabled;
  if (typeof options.retainDisposed === "boolean") brotoDebugState.retainDisposed = options.retainDisposed;
  if (typeof options.maxEntries === "number" && Number.isFinite(options.maxEntries)) {
    brotoDebugState.maxEntries = Math.max(1, Math.floor(options.maxEntries));
  }
}

/** Returns a readonly debug snapshot. */
export function debug(): Readonly<BrotoDebugSnapshot> {
  return { ...brotoDebugState };
}
