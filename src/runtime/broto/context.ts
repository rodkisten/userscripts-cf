import { signal } from "@rodkisten/broto/reactivity";
import {
  createContext,
  createRequiredContext,
  provide,
  requireContext,
  useContext,
} from "@rodkisten/broto/owner";
import type {
  ContextToken,
  ReactiveContextToken,
  Signal,
} from "@rodkisten/broto/types";

/** Creates a context whose provided value is a writable Broto signal. */
export function createReactiveContext<Value>(
  initialValue: Value,
  description = "ReactiveContext",
): ReactiveContextToken<Value> {
  return Object.freeze({
    ...createContext(signal(initialValue), description),
    kind: "reactive-context" as const,
    initialValue,
  }) as ReactiveContextToken<Value>;
}

/** Provides either an existing signal or a value wrapped in a new signal. */
export function provideReactiveContext<Value>(
  context: ReactiveContextToken<Value>,
  value: Value | Signal<Value>,
): Signal<Value> {
  const state = typeof value === "function" && "set" in value
    ? value as Signal<Value>
    : signal(value as Value, { name: context.description });

  return provide(context, state);
}

/** Reads the nearest reactive context signal. */
export function useReactiveContext<Value>(
  context: ReactiveContextToken<Value>,
): Signal<Value> {
  return useContext(context);
}

/** Reads a required reactive context signal. */
export function requireReactiveContext<Value>(
  context: ReactiveContextToken<Value>,
): Signal<Value> {
  return requireContext(context);
}

export {
  createContext,
  createRequiredContext,
  provide,
  requireContext,
  useContext,
};

export type { ContextToken, ReactiveContextToken };
