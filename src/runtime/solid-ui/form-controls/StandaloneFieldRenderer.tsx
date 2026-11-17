import { For, Show } from "solid-js";
import type { FormField, FieldContext } from "./fields";
import { Combobox } from "./Combobox";
import { Select, Checkbox, Switch as ToggleSwitch, Slider, ColorPicker } from "./Controls";
import styles from "./StandaloneFieldRenderer.module.css";

export interface StandaloneFieldRendererProps<TContext = FieldContext> {
  field: FormField<TContext>;
  value: unknown;
  context: TContext;
  onChange(value: unknown): void;
  id?: string;
  onError?: (error: unknown) => void;
}
/** Framework-neutral form renderer: no RodMenu imports, global styles or portal assumptions. */
export function StandaloneFieldRenderer<TContext = FieldContext>(
  props: StandaloneFieldRendererProps<TContext>,
) {
  const field = () => props.field;
  const id = () => props.id ?? `field-${field().name}`;
  const value = () => props.value;
  const commit = (next: unknown) => props.onChange(next);
  const disabled = () => !!field().disabled;
  const readonly = () => !!field().readonly;
  const kind = () => field().type;
  const choices = () =>
    "options" in field()
      ? (field() as { options: readonly { value: string; label: string; disabled?: boolean }[] }).options
      : [];
  const stringValue = () => String(value() ?? "");
  const prop = <T,>(name: string, fallback?: T): T | undefined =>
    (field() as unknown as Record<string, T>)[name] ?? fallback;
  const selectedValues = () => (Array.isArray(value()) ? (value() as string[]).map(String) : []);
  const common = () => ({ id: id(), name: field().name, disabled: disabled(), required: !!field().required });
  return (
    <div class={styles.field} data-field-type={kind()} data-disabled={String(disabled())}>
      <Show
        when={
          !["hidden", "divider", "button", "checkbox", "switch", "html", "custom"].includes(kind()) &&
          field().chrome !== "bare"
        }
      >
        <label for={id()}>{field().label ?? field().name}</label>
      </Show>
      <Show
        when={[
          "text",
          "email",
          "password",
          "search",
          "url",
          "tel",
          "number",
          "date",
          "datetime-local",
          "time",
          "month",
          "week",
          "hidden",
        ].includes(kind())}
      >
        <input
          {...common()}
          type={kind()}
          value={stringValue()}
          placeholder={field().placeholder}
          minLength={prop<number>("minLength")}
          maxLength={prop<number>("maxLength")}
          pattern={prop<string>("pattern")}
          autocomplete={prop<string>("autocomplete")}
          spellcheck={prop<boolean>("spellcheck")}
          autofocus={field().autoFocus}
          min={"min" in field() ? (field() as { min?: string | number }).min : undefined}
          max={"max" in field() ? (field() as { max?: string | number }).max : undefined}
          step={"step" in field() ? (field() as { step?: string | number }).step : undefined}
          readOnly={readonly()}
          onInput={(event) => {
            if (readonly()) return;
            commit(
              ["number", "range"].includes(kind())
                ? event.currentTarget.value === ""
                  ? ""
                  : event.currentTarget.valueAsNumber
                : event.currentTarget.value,
            );
          }}
        />
      </Show>
      <Show when={kind() === "textarea"}>
        <textarea
          {...common()}
          rows={prop<number>("rows", 4)}
          minLength={prop<number>("minLength")}
          maxLength={prop<number>("maxLength")}
          placeholder={field().placeholder}
          value={stringValue()}
          readOnly={!!field().readonly}
          onInput={(e) => {
            if (!readonly()) commit(e.currentTarget.value);
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
          presets={prop<readonly string[]>("presets")}
          onChange={commit}
          aria-label={field().label ?? field().name}
        />
      </Show>
      <Show when={kind() === "range"}>
        <Slider
          id={id()}
          name={field().name}
          value={Number(value() ?? prop<number>("min", 0))}
          min={prop<number>("min", 0)}
          max={prop<number>("max", 100)}
          step={prop<number>("step", 1)}
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
                    kind() === "radio"
                      ? value() === option.value
                      : Array.isArray(value()) && (value() as string[]).includes(option.value)
                  }
                  onChange={(e) => {
                    if (kind() === "radio") commit(option.value);
                    else {
                      const next = new Set(Array.isArray(value()) ? (value() as string[]) : []);
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
      <Show when={field().description}>
        <small>{field().description}</small>
      </Show>
    </div>
  );
}
