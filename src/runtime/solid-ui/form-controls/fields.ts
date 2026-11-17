import type { JSX } from "@solidjs/web";
import type { ControlOption } from "./options";

/**
 * Independent field contracts. Context is supplied by the consumer (RodMenu,
 * Dock, standalone form, etc.), never imported from an application package.
 */
export type FieldValue = unknown;
export type FieldValues = Readonly<Record<string, unknown>>;
export type Awaitable<T> = T | Promise<T>;

export interface FieldContext<TValues extends FieldValues = FieldValues> {
  readonly values: TValues;
  readonly errors?: Readonly<Record<string, string>>;
  set?(name: string, value: unknown): void;
}

export interface FieldAction<TContext = FieldContext> {
  label: string;
  title?: string;
  disabled?: boolean;
  handler: (context: TContext) => Awaitable<unknown>;
}

export interface BaseField<TContext = FieldContext> {
  type: string;
  name: string;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  hidden?: boolean;
  className?: string;
  chrome?: "default" | "bare";
  value?: FieldValue;
  defaultValue?: FieldValue;
  autoFocus?: boolean;
  help?: string;
  attributes?: Record<string, string | number | boolean | null | undefined>;
  visibleWhen?: (values: FieldValues, context: TContext) => boolean;
  disabledWhen?: (values: FieldValues, context: TContext) => boolean;
  validate?: (
    value: FieldValue,
    values: FieldValues,
    context: TContext,
  ) => Awaitable<string | null | undefined>;
  transform?: (value: FieldValue, context: TContext) => FieldValue;
  onChange?: (value: FieldValue, context: TContext) => void;
  trailingAction?: FieldAction<TContext>;
}

export interface OptionItem extends ControlOption {
  icon?: string | JSX.Element;
}

export type TextFieldType = "text" | "email" | "password" | "search" | "url" | "tel";
export type DateFieldType = "date" | "datetime-local" | "time" | "month" | "week";

export interface TextField<T = FieldContext> extends BaseField<T> {
  type: TextFieldType;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  autocomplete?: string;
  inputmode?: string;
  spellcheck?: boolean;
}
export interface NumberField<T = FieldContext> extends BaseField<T> {
  type: "number";
  min?: number;
  max?: number;
  step?: number | "any";
}
export interface TextareaField<T = FieldContext> extends BaseField<T> {
  type: "textarea";
  rows?: number;
  minLength?: number;
  maxLength?: number;
  resize?: "none" | "vertical" | "horizontal" | "both";
}
export interface SelectField<T = FieldContext> extends BaseField<T> {
  type: "select";
  options: readonly OptionItem[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  multiple?: false;
}
export interface MultiSelectField<T = FieldContext> extends BaseField<T> {
  type: "multiselect";
  options: readonly OptionItem[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
}
export interface ChoiceField<T = FieldContext> extends BaseField<T> {
  type: "radio" | "checkbox-group";
  options: readonly OptionItem[];
  direction?: "horizontal" | "vertical";
}
export interface BooleanField<T = FieldContext> extends BaseField<T> {
  type: "checkbox" | "switch";
}
export interface RangeField<T = FieldContext> extends BaseField<T> {
  type: "range";
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
}
export interface DateField<T = FieldContext> extends BaseField<T> {
  type: DateFieldType;
  min?: string;
  max?: string;
  step?: number;
}
export interface ColorField<T = FieldContext> extends BaseField<T> {
  type: "color";
  presets?: readonly string[];
}
export interface FileField<T = FieldContext> extends BaseField<T> {
  type: "file";
  accept?: string;
  multiple?: boolean;
  capture?: string;
}
export interface HiddenField<T = FieldContext> extends BaseField<T> {
  type: "hidden";
}
export interface SegmentedField<T = FieldContext> extends BaseField<T> {
  type: "segmented";
  options: readonly OptionItem[];
}
export interface RatingField<T = FieldContext> extends BaseField<T> {
  type: "rating";
  max?: number;
  allowZero?: boolean;
}
export interface ButtonField<T = FieldContext> extends BaseField<T> {
  type: "button";
  text?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  onPress?: (context: T) => Awaitable<void>;
}
export interface HtmlField<T = FieldContext> extends BaseField<T> {
  type: "html";
  html: string | ((context: T) => string);
}
export interface DividerField<T = FieldContext> extends BaseField<T> {
  type: "divider";
}
export interface CustomField<T = FieldContext> extends BaseField<T> {
  type: "custom";
  render: (context: T, field: CustomField<T>) => JSX.Element;
}

/** Shared form controls only; app-specific media and diagnostic fields remain extensions. */
export type FormField<T = FieldContext> =
  | TextField<T>
  | NumberField<T>
  | TextareaField<T>
  | SelectField<T>
  | MultiSelectField<T>
  | ChoiceField<T>
  | BooleanField<T>
  | RangeField<T>
  | DateField<T>
  | ColorField<T>
  | FileField<T>
  | HiddenField<T>
  | SegmentedField<T>
  | RatingField<T>
  | ButtonField<T>
  | HtmlField<T>
  | DividerField<T>
  | CustomField<T>;

export type FieldRenderer<T = FieldContext> = (props: {
  field: BaseField<T>;
  value: unknown;
  context: T;
  commit(value: unknown): void;
}) => JSX.Element;
