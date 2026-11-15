/**
 * Compile-time runtime composition. Import only the factories selected by the
 * entry generator: unreferenced features must never enter the module graph.
 */
export type RuntimeFeature<Context extends object, Value> = {
  readonly key: string;
  readonly create: (context: Readonly<Context>) => Value;
  readonly dispose?: (value: Value) => void | Promise<void>;
};

export interface ComposedRuntime<Context extends object> {
  readonly context: Context;
  dispose(): Promise<void>;
}

export function composeRuntime<
  Base extends object,
  Features extends Record<string, RuntimeFeature<any, any>>,
>(
  base: Base,
  features: Features,
): ComposedRuntime<Base & { [K in keyof Features]: ReturnType<Features[K]["create"]> }> {
  const context: Record<string, unknown> = { ...base };
  const cleanup: Array<() => void | Promise<void>> = [];
  let disposed = false;
  try {
    for (const [key, feature] of Object.entries(features)) {
      if (key in context) throw new Error(`Runtime feature collision: ${key}`);
      const value = feature.create(context);
      context[key] = value;
      if (feature.dispose) cleanup.push(() => feature.dispose!(value));
    }
  } catch (error) {
    // Factory errors must not leave already-created features alive.
    void Promise.allSettled(cleanup.reverse().map((dispose) => dispose()));
    throw error;
  }
  return {
    context: context as Base & { [K in keyof Features]: ReturnType<Features[K]["create"]> },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const results = await Promise.allSettled(cleanup.reverse().map((dispose) => dispose()));
      const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (errors.length) throw new AggregateError(errors.map((result) => result.reason), "Runtime disposal failed");
    },
  };
}
