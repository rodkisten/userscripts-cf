import { createSignal } from "solid-js";
import type { FieldContext, FieldValues, FormField } from "./fields";

/** Form-level validation: await every validator before submitting. */
export function createFormSubmit<TValues extends FieldValues>(options: {
  fields(): readonly FormField<FieldContext<TValues>>[];
  values(): TValues;
  onSubmit(values: TValues): void | Promise<void>;
  focusInvalid?(name: string): void;
  onError?(error: unknown): void;
}) {
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [submitting, setSubmitting] = createSignal(false);
  const [submitted, setSubmitted] = createSignal(false);
  let revision = 0;
  let submittedSnapshot: TValues | undefined;
  const validate = async () => {
    const current = ++revision;
    const values = options.values();
    submittedSnapshot = values;
    const context: FieldContext<TValues> = { values };
    const fields = options
      .fields()
      .filter(
        (field) => !field.disabled && !field.hidden && field.type !== "button" && field.type !== "divider",
      );
    const results = await Promise.all(
      fields.map(async (field) => {
        try {
          if (
            field.required &&
            (values[field.name] == null ||
              values[field.name] === "" ||
              (Array.isArray(values[field.name]) && values[field.name].length === 0))
          ) {
            return [field.name, "Campo obrigatório."] as const;
          }
          const message = await field.validate?.(values[field.name], values, context);
          return [field.name, message ?? undefined] as const;
        } catch (reason) {
          options.onError?.(reason);
          return [field.name, "Não foi possível validar este campo."] as const;
        }
      }),
    );
    if (
      current !== revision ||
      (options.values() !== values && JSON.stringify(options.values()) !== JSON.stringify(values))
    )
      return false;
    const next: Record<string, string> = {};
    for (const [name, message] of results) if (message) next[name] = message;
    setErrors(next);
    if (Object.keys(next).length) {
      options.focusInvalid?.(fields.find((field) => next[field.name])!.name);
      return false;
    }
    return true;
  };
  const submit = async () => {
    if (submitting()) return false;
    setSubmitted(true);
    setSubmitting(true);
    try {
      if (!(await validate())) return false;
      if (!submittedSnapshot) return false;
      await options.onSubmit(submittedSnapshot);
      return true;
    } catch (reason) {
      options.onError?.(reason);
      return false;
    } finally {
      setSubmitting(false);
    }
  };
  return { errors, submitting, submitted, validate, submit };
}
