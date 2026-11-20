/** @jsxImportSource react */
import { createContext, useContext as useReactContext, type ReactElement, type ReactNode } from "react";
import type { ReactScriptContext } from "./react-context-contract.js";

// TODO(extract): Move to `@shared/types/guards.ts` if other modules need to extract optional contract properties.
type SharedEventsOf<TEvents> = TEvents extends { readonly shared?: infer TShared }
  ? TShared
  : unknown;

/** React context propagation without a mutable global current-script pointer. */
const ScriptScope = createContext<ReactScriptContext | undefined>(undefined);

// IMPROVEMENT: Replaced `React.FC` with a directly typed function component.
// Why: `React.FC` couples the component to legacy global `React` namespace types and varies across `@types/react` versions, while keeping the exact `{ context, children }` prop contract intact.
export function RuntimeProvider({
  context,
  children,
}: {
  context: ReactScriptContext;
  children: ReactNode;
}): ReactElement {
  return <ScriptScope.Provider value={context}>{children}</ScriptScope.Provider>;
}

// IMPROVEMENT: Extracted single abort-signal validation guard.
// Why: Eliminates duplicated disposal checks and error message strings between `useContext` and `bindRuntime`, preventing future drift.
function assertActiveContext(ctx: ReactScriptContext): void {
  if (ctx.signal.aborted) {
    throw new Error("ScriptContext has been disposed");
  }
}

export function useContext(): ReactScriptContext {
  const ctx = useReactContext(ScriptScope);
  if (!ctx) {
    throw new Error("useContext() requires RuntimeProvider; bind callbacks with bindRuntime(ctx)");
  }
  assertActiveContext(ctx);
  return ctx;
}

export function useRuntime(): ReactScriptContext {
  return useContext();
}

// IMPROVEMENT: Replaced explicit `: unknown` return annotation with conditional type inference (`SharedEventsOf`).
// Why: Forcing `: unknown` erased the underlying `events.shared` type when defined in `ReactScriptContext`, without changing runtime behavior or breaking callers expecting `unknown`.
/** The shared-event bridge is optional and must be checked at runtime. */
function sharedEvents(ctx: ReactScriptContext): SharedEventsOf<ReactScriptContext["events"]> | undefined {
  const events = ctx.events;
  if (events && typeof events === "object" && "shared" in events) {
    return events.shared as SharedEventsOf<ReactScriptContext["events"]>;
  }
  return undefined;
}

/** Explicitly bind asynchronous or non-React callbacks to their owning script. */
export function bindRuntime(ctx: ReactScriptContext) {
  const current = (): ReactScriptContext => {
    assertActiveContext(ctx);
    return ctx;
  };

  return Object.freeze({
    useContext: current,
    useRuntime: current,
    useRuntimeWorld: () => sharedEvents(current()),
  });
}

/** Shared events only; never exposes other scripts' private stores. */
export function useRuntimeWorld() {
  return sharedEvents(useContext());
}
