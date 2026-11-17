import { createEffect, createSignal, onCleanup, untrack } from "solid-js";
import type { BaseField, FieldContext, FieldValues } from "./fields";

/** Async field validation with stale-result protection and optional debounce. */
export function createFieldValidation<TContext = FieldContext>(options: {
  field(): BaseField<TContext>;
  value(): unknown;
  context(): TContext;
  debounceMs?: number;
  onError?(error: unknown): void;
}) {
  const [error, setError] = createSignal<string | undefined>();
  const [pending, setPending] = createSignal(false);
  let generation = 0;
  createEffect(() => {
    const field = options.field();
    const value = options.value();
    const context = options.context();
    const validate = field.validate;
    const current = ++generation;
    setError(undefined);
    setPending(false);
    if (!validate || field.disabled || field.readonly) return;
    setPending(true);
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => untrack(() => validate(value, (context as FieldContext).values as FieldValues, context)))
        .then((message) => {
          if (current === generation) {
            setError(message ?? undefined);
            setPending(false);
          }
        })
        .catch((reason: unknown) => {
          if (current === generation) {
            setPending(false);
            options.onError?.(reason);
          }
        });
    }, options.debounceMs ?? 250);
    onCleanup(() => {
      ++generation;
      clearTimeout(timer);
    });
  }, undefined);
  return { error, pending };
}
