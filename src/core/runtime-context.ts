import { createComponent, createContext, useContext as useSolidContext, type ParentComponent } from "solid-js";
import type { ScriptContext } from "./runtime.js";

/** Solid context propagation without a mutable global current-script pointer. */
const ScriptScope = createContext<ScriptContext>();

export const RuntimeProvider: ParentComponent<{ context: ScriptContext }> = (props) =>
  createComponent(ScriptScope.Provider, { get value() { return props.context; }, get children() { return props.children; } });

export function useContext(): ScriptContext {
  const ctx = useSolidContext(ScriptScope);
  if (!ctx) throw new Error("useContext() requires RuntimeProvider; bind callbacks with bindRuntime(ctx)");
  if (ctx.signal.aborted) throw new Error("ScriptContext has been disposed");
  return ctx;
}

export function useRuntime(): ScriptContext {
  return useContext();
}

/** Explicitly bind asynchronous or non-Solid callbacks to their owning script. */
export function bindRuntime(ctx: ScriptContext) {
  const current = () => {
    if (ctx.signal.aborted) throw new Error("ScriptContext has been disposed");
    return ctx;
  };
  return Object.freeze({
    useContext: current,
    useRuntime: current,
    useRuntimeWorld: () => current().events.shared,
  });
}

/** Shared events only; never exposes other scripts' private stores. */
export function useRuntimeWorld() {
  return useContext().events.shared;
}
