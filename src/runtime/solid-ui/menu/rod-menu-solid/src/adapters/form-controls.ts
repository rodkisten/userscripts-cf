import {
  isFieldVisible,
  isFieldDisabled,
  resolveFieldValue,
  validateField,
  transformFieldValue,
} from '../../../form-controls';
import type { BaseField as FormBaseField, FieldRuntime } from '../../../form-controls';
import type { BaseField, RodMenuContext, RodMenuField } from '../types';

/**
 * Bridge between legacy RodMenu field callbacks and the independent
 * form-controls runtime. Preserve the original context and callbacks.
 *
 * The trailing action stays owned by RodMenu: its handler and disabledWhen
 * depend on RodMenuContext and should not be silently rewritten.
 */
export function toFormControlField(field: BaseField): FormBaseField<RodMenuContext<any>> {
  const { trailingAction: _trailingAction, ...rest } = field;
  return rest;
}

function runtime(
  field: BaseField,
  context: RodMenuContext<any>,
  onError?: (error: unknown) => void,
): FieldRuntime<RodMenuContext<any>> {
  return {
    field: toFormControlField(field),
    values: context.values,
    context,
    onError,
  };
}

export function isMenuFieldVisible(
  field: RodMenuField,
  context: RodMenuContext<any>,
  onError?: (error: unknown) => void,
): boolean {
  return isFieldVisible(runtime(field, context, onError));
}

export function isMenuFieldDisabled(
  field: RodMenuField,
  context: RodMenuContext<any>,
  onError?: (error: unknown) => void,
): boolean {
  return isFieldDisabled(runtime(field, context, onError));
}

export function resolveMenuFieldValue(
  field: RodMenuField,
  context: RodMenuContext<any>,
): unknown {
  return resolveFieldValue(toFormControlField(field), context.values);
}

export function validateMenuField(
  field: RodMenuField,
  value: unknown,
  context: RodMenuContext<any>,
): Promise<string | null> {
  return validateField(toFormControlField(field), value, context.values, context);
}

export function transformMenuFieldValue(
  field: RodMenuField,
  value: unknown,
  context: RodMenuContext<any>,
): unknown {
  return transformFieldValue(toFormControlField(field), value, context);
}
