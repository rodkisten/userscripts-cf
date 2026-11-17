import { createContext, createElement, useContext as useReactContext, type ReactNode } from "react";
import type { ScriptContext } from "./runtime.js";

/** React context propagation without a mutable global current-script pointer. */
const ScriptScope = createContext<ScriptContext | undefined>(undefined);

export const RuntimeProvider: React.FC<{ context: ScriptContext; children: ReactNode }> = ({
  context,
  children,
}) => createElement(ScriptScope.Provider, { value: context }, children);

export function useContext(): ScriptContext {
  const ctx = useReactContext(ScriptScope);
  if (!ctx) throw new Error("useContext() requires RuntimeProvider; bind callbacks with bindRuntime(ctx)");
  if (ctx.signal.aborted) throw new Error("ScriptContext has been disposed");
  return ctx;
}

export function useRuntime(): ScriptContext {
  return useContext();
}

/** Explicitly bind asynchronous or non-React callbacks to their owning script. */
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
