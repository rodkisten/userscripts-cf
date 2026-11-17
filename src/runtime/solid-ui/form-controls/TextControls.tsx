import { Show } from "solid-js";
import styles from "./Controls.module.css";

export interface TextControlProps {
  id?: string;
  name?: string;
  value: string;
  label?: string;
  description?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  autocomplete?: string;
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  spellcheck?: boolean;
  autoFocus?: boolean;
  onChange(value: string): void;
}

function FieldHelp(props: { id?: string; description?: string; error?: string }) {
  return (
    <>
      <Show when={props.description && !props.error}>
        <small id={props.id ? `${props.id}-description` : undefined} class={styles.fieldHelp}>
          {props.description}
        </small>
      </Show>
      <Show when={props.error}>
        <small id={props.id ? `${props.id}-error` : undefined} class={styles.fieldError} role="alert">
          {props.error}
        </small>
      </Show>
    </>
  );
}

function describedBy(props: TextControlProps): string | undefined {
  return props.id && (props.error || props.description)
    ? `${props.id}-${props.error ? "error" : "description"}`
    : undefined;
}

export function Input(
  props: TextControlProps & { type?: "text" | "email" | "password" | "search" | "url" | "tel" },
) {
  return (
    <div class={styles.textField}>
      <Show when={props.label}>
        <label for={props.id}>{props.label}</label>
      </Show>
      <input
        id={props.id}
        name={props.name}
        class={styles.textInput}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readonly}
        required={props.required}
        minLength={props.minLength}
        maxLength={props.maxLength}
        pattern={props.pattern}
        autocomplete={props.autocomplete}
        inputMode={props.inputMode}
        spellcheck={props.spellcheck}
        autofocus={props.autoFocus}
        aria-invalid={props.error ? "true" : undefined}
        aria-describedby={describedBy(props)}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
      <FieldHelp id={props.id} description={props.description} error={props.error} />
    </div>
  );
}

export function Textarea(props: TextControlProps & { rows?: number; showCount?: boolean; resize?: "none" | "vertical" | "horizontal" | "both" }) {
  return (
    <div class={styles.textField}>
      <Show when={props.label}>
        <label for={props.id}>{props.label}</label>
      </Show>
      <textarea
        id={props.id}
        name={props.name}
        class={styles.textInput}
        value={props.value}
        rows={props.rows ?? 3}
        style={{ resize: props.resize ?? "vertical" }}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readonly}
        required={props.required}
        minLength={props.minLength}
        maxLength={props.maxLength}
        spellcheck={props.spellcheck}
        autofocus={props.autoFocus}
        aria-invalid={props.error ? "true" : undefined}
        aria-describedby={describedBy(props)}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
      <Show when={props.showCount && props.maxLength !== undefined}>
        <output class={styles.fieldCount}>
          {props.value.length} / {props.maxLength}
        </output>
      </Show>
      <FieldHelp id={props.id} description={props.description} error={props.error} />
    </div>
  );
}

export interface NumberInputProps extends Omit<TextControlProps, "value" | "onChange" | "maxLength"> {
  value: number | "";
  min?: number;
  max?: number;
  step?: number | "any";
  onChange(value: number | ""): void;
}

export function NumberInput(props: NumberInputProps) {
  return (
    <div class={styles.textField}>
      <Show when={props.label}>
        <label for={props.id}>{props.label}</label>
      </Show>
      <input
        id={props.id}
        name={props.name}
        class={styles.textInput}
        type="number"
        inputMode={props.inputMode ?? "decimal"}
        autofocus={props.autoFocus}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readonly}
        required={props.required}
        aria-invalid={props.error ? "true" : undefined}
        aria-describedby={describedBy(props)}
        onInput={(event) =>
          props.onChange(event.currentTarget.value === "" ? "" : event.currentTarget.valueAsNumber)
        }
      />
      <FieldHelp id={props.id} description={props.description} error={props.error} />
    </div>
  );
}
