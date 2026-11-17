import { For, Show } from "solid-js";
import type { FormField, FieldContext, OptionItem, RangeField, ColorField } from "./fields";
import { Combobox } from "./Combobox";
import { Select, Checkbox, Switch as ToggleSwitch, Slider, ColorPicker } from "./Controls";
import styles from "./StandaloneFieldRenderer.module.css";
import { Input, Textarea, NumberInput } from "./TextControls";
import { createFieldValidation } from "./field-validation";

export interface StandaloneFieldRendererProps<TContext = FieldContext> {
  field: FormField<TContext>;
  value: unknown;
  context: TContext;
  onChange(value: unknown): void;
  id?: string;
  onError?: (error: unknown) => void;
  validationMode?: "change" | "blur";
}
/** Framework-neutral form renderer: no RodMenu imports, global styles or portal assumptions. */
export function StandaloneFieldRenderer<TContext = FieldContext>(
  props: StandaloneFieldRendererProps<TContext>,
) {
  const field = () => props.field;
  const id = () => props.id ?? `field-${field().name}`;
  const value = () => props.value;
  const commit = (next: unknown) => {
    validation.markChanged();
    props.onChange(next);
  };
  const disabled = () => !!field().disabled;
  const readonly = () => !!field().readonly;
  const kind = () => field().type;
  const validation = createFieldValidation({
    field,
    value,
    context: () => props.context,
    mode: props.validationMode,
    onError: (reason) => props.onError?.(reason),
  });
  const error = () => (props.context as FieldContext).errors?.[field().name] ?? validation.error();
  const description = () => field().description ?? field().help;
  const choices = (): readonly OptionItem[] => {
    const current = field();
    return "options" in current ? current.options : [];
  };
  const stringValue = () => String(value() ?? "");
  const prop = <T,>(name: string, fallback?: T): T | undefined => {
    const current = field();
    return (current as unknown as Record<string, T | undefined>)[name] ?? fallback;
  };
  const selectedValues = (): string[] => {
    const current = value();
    return Array.isArray(current) ? (current as unknown[]).map(String) : [];
  };
  const common = () => ({
    id: id(),
    name: field().name,
    disabled: disabled() || readonly(),
    required: !!field().required,
  });
  return (
    <div
      class={styles.field}
      data-field-type={kind()}
      data-disabled={String(disabled())}
      data-touched={String(validation.touched())}
      data-dirty={String(validation.dirty())}
      data-validating={String(validation.pending())}
    >
      <Show
        when={
          !["hidden", "divider", "button", "checkbox", "switch", "html", "custom"].includes(kind()) &&
          field().chrome !== "bare"
        }
      >
        <label for={id()}>{field().label ?? field().name}</label>
      </Show>
      <Show when={["text", "email", "password", "search", "url", "tel"].includes(kind())}>
        <Input
          error={error()}
          onBlur={validation.markBlurred}
          warning={validation.pending() && !error() ? "Validando…" : undefined}
          description={description()}
          id={id()}
          name={field().name}
          type={kind() as "text" | "email" | "password" | "search" | "url" | "tel"}
          value={stringValue()}
          placeholder={field().placeholder}
          disabled={disabled()}
          readonly={readonly()}
          required={!!field().required}
          minLength={prop<number>("minLength")}
          maxLength={prop<number>("maxLength")}
          pattern={prop<string>("pattern")}
          autocomplete={prop<string>("autocomplete")}
          inputMode={prop<"text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url" | "none">(
            "inputmode",
          )}
          spellcheck={prop<boolean>("spellcheck")}
          autoFocus={field().autoFocus}
          onChange={commit}
        />
      </Show>
      <Show when={kind() === "number"}>
        <NumberInput
          error={error()}
          onBlur={validation.markBlurred}
          description={description()}
          id={id()}
          name={field().name}
          value={value() === "" || value() == null ? "" : Number(value())}
          min={prop<number>("min")}
          max={prop<number>("max")}
          step={prop<number>("step")}
          placeholder={field().placeholder}
          disabled={disabled()}
          readonly={readonly()}
          required={!!field().required}
          onChange={commit}
        />
      </Show>
      <Show when={kind() === "textarea"}>
        <Textarea
          error={error()}
          onBlur={validation.markBlurred}
          description={description()}
          id={id()}
          name={field().name}
          value={stringValue()}
          rows={prop<number>("rows", 4)}
          minLength={prop<number>("minLength")}
          maxLength={prop<number>("maxLength")}
          autoFocus={field().autoFocus}
          placeholder={field().placeholder}
          disabled={disabled()}
          readonly={readonly()}
          required={!!field().required}
          onChange={commit}
        />
      </Show>
      <Show when={["date", "datetime-local", "time", "month", "week", "hidden"].includes(kind())}>
        <input
          {...common()}
          type={kind()}
          value={stringValue()}
          placeholder={field().placeholder}
          readOnly={readonly()}
          onInput={(event) => {
            if (!readonly()) commit(event.currentTarget.value);
          }}
        />
      </Show>
      <Show when={kind() === "select" && !!prop<boolean>("searchable")}>
        <Combobox
          id={id()}
          name={field().name}
          options={choices()}
          value={stringValue()}
          multiple={false}
          placeholder={field().placeholder}
          emptyMessage={prop<string>("emptyMessage")}
          onChange={commit}
          disabled={disabled()}
          readonly={readonly()}
        />
      </Show>
      <Show when={kind() === "select" && !prop<boolean>("searchable")}>
        <Select
          id={id()}
          name={field().name}
          options={choices()}
          value={stringValue()}
          disabled={disabled() || readonly()}
          onChange={commit}
        />
      </Show>
      <Show when={kind() === "multiselect" && !!prop<boolean>("searchable")}>
        <Combobox
          id={id()}
          name={field().name}
          options={choices()}
          value={selectedValues()}
          multiple
          placeholder={field().placeholder}
          emptyMessage={prop<string>("emptyMessage")}
          onChange={commit}
          disabled={disabled()}
          readonly={readonly()}
        />
      </Show>
      <Show when={kind() === "multiselect" && !prop<boolean>("searchable")}>
        <div role="group" aria-label={field().label ?? field().name}>
          <For each={choices()}>
            {(option) => (
              <button
                type="button"
                aria-pressed={selectedValues().includes(option.value)}
                disabled={disabled() || readonly() || option.disabled}
                onClick={() => {
                  const next = new Set(selectedValues());
                  if (next.has(option.value)) next.delete(option.value);
                  else next.add(option.value);
                  commit([...next]);
                }}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={kind() === "checkbox" || kind() === "switch"}>
        <label class={styles.booleanRow}>
          <span>{field().label ?? field().name}</span>
          {kind() === "switch" ? (
            <ToggleSwitch
              id={id()}
              name={field().name}
              checked={!!value()}
              disabled={disabled() || readonly()}
              onChange={commit}
            />
          ) : (
            <Checkbox
              id={id()}
              name={field().name}
              checked={!!value()}
              disabled={disabled() || readonly()}
              onChange={commit}
            />
          )}
        </label>
      </Show>
      <Show when={kind() === "color"}>
        <ColorPicker
          id={id()}
          name={field().name}
          value={stringValue()}
          disabled={disabled()}
          readonly={readonly()}
          presets={(field() as ColorField<TContext>).presets}
          onChange={commit}
          aria-label={field().label ?? field().name}
        />
      </Show>
      <Show when={kind() === "range"}>
        <Slider
          id={id()}
          name={field().name}
          value={Number(value() ?? (field() as RangeField<TContext>).min ?? 0)}
          min={(field() as RangeField<TContext>).min}
          max={(field() as RangeField<TContext>).max}
          step={(field() as RangeField<TContext>).step}
          disabled={disabled() || readonly()}
          onChange={commit}
        />
      </Show>
      <Show when={kind() === "radio" || kind() === "checkbox-group"}>
        <div role="group" aria-label={field().label ?? field().name}>
          <For each={choices()}>
            {(option) => (
              <label>
                <input
                  type={kind() === "radio" ? "radio" : "checkbox"}
                  name={field().name}
                  disabled={disabled() || readonly() || option.disabled}
                  checked={
                    kind() === "radio" ? value() === option.value : selectedValues().includes(option.value)
                  }
                  onChange={(e) => {
                    if (kind() === "radio") commit(option.value);
                    else {
                      const next = new Set(selectedValues());
                      if (e.currentTarget.checked) next.add(option.value);
                      else next.delete(option.value);
                      commit([...next]);
                    }
                  }}
                />
                {option.label}
              </label>
            )}
          </For>
        </div>
      </Show>
      <Show when={kind() === "segmented"}>
        <div role="group" aria-label={field().label ?? field().name}>
          <For each={choices()}>
            {(option) => (
              <button
                type="button"
                aria-pressed={value() === option.value}
                disabled={disabled() || readonly() || option.disabled}
                onClick={() => commit(option.value)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={kind() === "rating"}>
        <div role="group" aria-label={field().label ?? field().name}>
          <For
            each={Array.from(
              { length: "max" in field() ? ((field() as { max?: number }).max ?? 5) : 5 },
              (_, i) => i + 1,
            )}
          >
            {(n) => (
              <button
                type="button"
                aria-label={`${n} estrelas`}
                aria-pressed={Number(value() ?? 0) === n}
                onClick={() => commit(prop<boolean>("allowZero") && Number(value()) === n ? 0 : n)}
                disabled={disabled() || readonly()}
              >
                ★
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={kind() === "file"}>
        <input
          {...common()}
          type="file"
          accept={"accept" in field() ? (field() as { accept?: string }).accept : undefined}
          multiple={prop<boolean>("multiple", false)}
          capture={prop<string>("capture")}
          disabled={disabled() || readonly()}
          onChange={(e) =>
            commit(
              prop<boolean>("multiple")
                ? Array.from(e.currentTarget.files ?? [])
                : (e.currentTarget.files?.[0] ?? null),
            )
          }
        />
      </Show>
      <Show when={kind() === "button"}>
        <button
          type="button"
          disabled={disabled() || readonly()}
          onClick={() => {
            const f = field();
            if ("onPress" in f)
              Promise.resolve(
                (f as { onPress?: (ctx: TContext) => void | Promise<void> }).onPress?.(props.context),
              ).catch((error: unknown) => props.onError?.(error));
          }}
        >
          {"text" in field()
            ? ((field() as { text?: string; label?: string }).text ?? field().label)
            : field().label}
        </button>
      </Show>
      <Show when={kind() === "range" && prop<boolean>("showValue")}>
        <output for={id()}>{stringValue()}</output>
      </Show>
      <Show when={kind() === "divider"}>
        <hr />
      </Show>
      <Show when={kind() === "html"}>
        <div
          innerHTML={
            "html" in field()
              ? typeof (field() as { html: unknown }).html === "function"
                ? (field() as { html: (ctx: TContext) => string }).html(props.context)
                : (field() as { html: string }).html
              : ""
          }
        />
      </Show>
      <Show when={kind() === "custom"}>
        {(() => {
          const f = field();
          return "render" in f
            ? (
                f as { render: (ctx: TContext, field: typeof f) => import("@solidjs/web").JSX.Element }
              ).render(props.context, f)
            : null;
        })()}
      </Show>
      <Show
        when={
          field().description &&
          !["text", "email", "password", "search", "url", "tel", "number", "textarea"].includes(kind())
        }
      >
        <small>{field().description}</small>
      </Show>
    </div>
  );
}
