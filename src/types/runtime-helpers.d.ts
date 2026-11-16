import type { ScriptContext } from "../core/runtime.js";
import type { bindRuntime, useContext, useRuntime, useRuntimeWorld } from "../core/runtime-context.js";

/**
 * Runtime helpers are available without imports in userscript source.
 * These declarations do not install globals: the runtime must register
 * the implementations before executing script modules.
 */
declare global {
  function useContext(): ReturnType<typeof useContext>;
  function useRuntime(): ReturnType<typeof useRuntime>;
  function useRuntimeWorld(): ReturnType<typeof useRuntimeWorld>;
  function bindRuntime(ctx: ScriptContext): ReturnType<typeof bindRuntime>;
}

export {};
