import type { BaseField, FieldContext, FieldValues, FieldValue, Awaitable } from "./fields";

export interface FieldRuntime<TContext = FieldContext> {
  field: BaseField<TContext>;
  values: FieldValues;
  context: TContext;
  onError?: (error: unknown) => void;
}

export function isFieldVisible<TContext>(runtime: FieldRuntime<TContext>): boolean {
  if (runtime.field.hidden) return false;
  try {
    return runtime.field.visibleWhen?.(runtime.values, runtime.context) ?? true;
  } catch (error) {
    runtime.onError?.(error);
    return true;
  }
}

export function isFieldDisabled<TContext>(runtime: FieldRuntime<TContext>): boolean {
  if (runtime.field.disabled) return true;
  try {
    return runtime.field.disabledWhen?.(runtime.values, runtime.context) ?? false;
  } catch (error) {
    runtime.onError?.(error);
    return false;
  }
}

export function resolveFieldValue<TContext>(field: BaseField<TContext>, values: FieldValues): FieldValue {
  return Object.prototype.hasOwnProperty.call(values, field.name)
    ? values[field.name]
    : (field.value ?? field.defaultValue);
}

export async function validateField<TContext>(
  field: BaseField<TContext>,
  value: FieldValue,
  values: FieldValues,
  context: TContext,
): Promise<string | null> {
  if (field.required && (value == null || value === "" || (Array.isArray(value) && value.length === 0))) {
    return "Required";
  }
  return (await field.validate?.(value, values, context)) ?? null;
}

export function transformFieldValue<TContext>(
  field: BaseField<TContext>,
  value: FieldValue,
  context: TContext,
): FieldValue {
  return field.transform ? field.transform(value, context) : value;
}
