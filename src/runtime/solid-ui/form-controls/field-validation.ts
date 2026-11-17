import { createEffect, createSignal, onCleanup, untrack } from "solid-js";
import type { BaseField, FieldContext, FieldValues } from "./fields";

/** Async field validation with stale-result protection and optional debounce. */
export function createFieldValidation<TContext = FieldContext>(options: {
  field(): BaseField<TContext>;
  value(): unknown;
  context(): TContext;
  debounceMs?: number;
  mode?: "change" | "blur";
  getMode?(): "change" | "blur";
  enabled?(): boolean;
  onError?(error: unknown): void;
}) {
  const [error, setError] = createSignal<string | undefined>();
  const [pending, setPending] = createSignal(false);
  const [touched, setTouched] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [blurRevision, setBlurRevision] = createSignal(0);
  const markChanged = () => setDirty(true);
  const markBlurred = () => {
    setTouched(true);
    setBlurRevision((n) => n + 1);
  };
  let generation = 0;
  createEffect(() => {
    const field = options.field();
    const value = options.value();
    const context = options.context();
    const validate = field.validate;
    const revision = blurRevision();
    const enabled = options.enabled?.() ?? true;
    const shouldValidate = (options.getMode?.() ?? options.mode) !== "blur" || (touched() && revision > 0);
    const current = ++generation;
    setError(undefined);
    setPending(false);
    if (!validate || !enabled || !shouldValidate || field.disabled || field.readonly) return;
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
  });
  return { error, pending, touched, dirty, markChanged, markBlurred };
}
