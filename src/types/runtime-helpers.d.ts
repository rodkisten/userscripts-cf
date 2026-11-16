import type { ScriptContext } from "../core/runtime.js";
import type { bindRuntime as bindRuntimeHelper, useContext as useContextHelper, useRuntime as useRuntimeHelper, useRuntimeWorld as useRuntimeWorldHelper } from "../core/runtime-context.js";

/**
 * Runtime helpers are available without imports in userscript source.
 * These declarations do not install globals: the runtime must register
 * the implementations before executing script modules.
 */
declare global {
  function useContext(): ReturnType<typeof useContextHelper>;
  function useRuntime(): ReturnType<typeof useRuntimeHelper>;
  function useRuntimeWorld(): ReturnType<typeof useRuntimeWorldHelper>;
  function bindRuntime(ctx: ScriptContext): ReturnType<typeof bindRuntimeHelper>;
}

export {};
