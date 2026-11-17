import { Show } from "solid-js";
import styles from "./Controls.module.css";

export interface TextControlProps {
  id?: string;
  name?: string;
  value: string;
  label?: string;
  description?: string;
  error?: string;
  warning?: string;
  success?: string;
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
  onBlur?(): void;
  onChange(value: string): void;
}

type FieldFeedback = Pick<TextControlProps, "id" | "description" | "error" | "warning" | "success">;

function feedbackId(props: FieldFeedback): string | undefined {
  if (!props.id) return undefined;
  if (props.error) return `${props.id}-error`;
  if (props.warning) return `${props.id}-warning`;
  if (props.success) return `${props.id}-success`;
  return props.description ? `${props.id}-description` : undefined;
}

function FieldHelp(props: FieldFeedback) {
  return (
    <Show when={props.error || props.warning || props.success || props.description}>
      <small
        id={feedbackId(props)}
        class={
          props.error
            ? styles.fieldError
            : props.warning
              ? styles.fieldWarning
              : props.success
                ? styles.fieldSuccess
                : styles.fieldHelp
        }
        role={props.error ? "alert" : "status"}
        aria-live={props.error ? "assertive" : "polite"}
      >
        {props.error || props.warning || props.success || props.description}
      </small>
    </Show>
  );
}

function describedBy(props: FieldFeedback): string | undefined {
  return feedbackId(props);
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
        readonly={props.readonly}
        required={props.required}
        minLength={props.minLength}
        maxLength={props.maxLength}
        pattern={props.pattern}
        autocomplete={props.autocomplete}
        inputmode={props.inputMode}
        spellcheck={props.spellcheck}
        autofocus={props.autoFocus}
        aria-invalid={props.error ? "true" : undefined}
        data-state={props.error ? "error" : props.warning ? "warning" : props.success ? "success" : "default"}
        aria-describedby={describedBy(props)}
        onBlur={() => props.onBlur?.()}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
      <FieldHelp
        id={props.id}
        description={props.description}
        error={props.error}
        warning={props.warning}
        success={props.success}
      />
    </div>
  );
}

export function Textarea(
  props: TextControlProps & {
    rows?: number;
    showCount?: boolean;
    resize?: "none" | "vertical" | "horizontal" | "both";
  },
) {
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
        readonly={props.readonly}
        required={props.required}
        minLength={props.minLength}
        maxLength={props.maxLength}
        spellcheck={props.spellcheck}
        autofocus={props.autoFocus}
        aria-invalid={props.error ? "true" : undefined}
        data-state={props.error ? "error" : props.warning ? "warning" : props.success ? "success" : "default"}
        aria-describedby={describedBy(props)}
        onBlur={() => props.onBlur?.()}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
      <Show when={props.showCount && props.maxLength !== undefined}>
        <output class={styles.fieldCount} aria-label="Contagem de caracteres">
          {props.value.length} / {props.maxLength}
        </output>
      </Show>
      <FieldHelp
        id={props.id}
        description={props.description}
        error={props.error}
        warning={props.warning}
        success={props.success}
      />
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
        inputmode={props.inputMode ?? "decimal"}
        autofocus={props.autoFocus}
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readonly={props.readonly}
        required={props.required}
        aria-invalid={props.error ? "true" : undefined}
        data-state={props.error ? "error" : props.warning ? "warning" : props.success ? "success" : "default"}
        aria-describedby={describedBy(props)}
        onBlur={() => props.onBlur?.()}
        onInput={(event) =>
          props.onChange(event.currentTarget.value === "" ? "" : event.currentTarget.valueAsNumber)
        }
      />
      <FieldHelp
        id={props.id}
        description={props.description}
        error={props.error}
        warning={props.warning}
        success={props.success}
      />
    </div>
  );
}
