/** @jsxImportSource react */
import React, { createContext, useContext as useReactContext, type ReactNode } from "react";
import type { ReactScriptContext } from "./react-context-contract.js";

/** React context propagation without a mutable global current-script pointer. */
const ScriptScope = createContext<ReactScriptContext | undefined>(undefined);

export const RuntimeProvider: React.FC<{ context: ReactScriptContext; children: ReactNode }> = ({
  context,
  children,
}) => <ScriptScope.Provider value={context}>{children}</ScriptScope.Provider>;

export function useContext(): ReactScriptContext {
  const ctx = useReactContext(ScriptScope);
  if (!ctx) throw new Error("useContext() requires RuntimeProvider; bind callbacks with bindRuntime(ctx)");
  if (ctx.signal.aborted) throw new Error("ScriptContext has been disposed");
  return ctx;
}

export function useRuntime(): ReactScriptContext {
  return useContext();
}

/** Explicitly bind asynchronous or non-React callbacks to their owning script. */
export function bindRuntime(ctx: ReactScriptContext) {
  const current = () => {
    if (ctx.signal.aborted) throw new Error("ScriptContext has been disposed");
    return ctx;
  };
  return Object.freeze({
    useContext: current,
    useRuntime: current,
    useRuntimeWorld: () => current().events?.shared,
  });
}

/** Shared events only; never exposes other scripts' private stores. */
export function useRuntimeWorld() {
  return useContext().events?.shared;
}
