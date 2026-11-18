/** Framework-neutral shape required by the React provider.
 * Keep this module free of runtime.ts imports: that module pulls legacy UI
 * implementations into the React-only TypeScript graph.
 */
export interface ReactScriptContext {
  readonly id: string;
  readonly signal: AbortSignal;
  readonly events?: unknown;
  readonly [key: string]: unknown;
}
