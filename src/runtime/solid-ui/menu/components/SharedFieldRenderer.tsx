import { For, Match, Show, Switch } from "solid-js";
import type {
  RodMenuContext,
  RodMenuField,
  TextLikeField,
  DateLikeField,
  BooleanField,
  RadioField,
  CheckboxGroupField,
} from "../types";
import { TypeaheadSelect } from "./fields/TypeaheadSelect";
import { Select, Checkbox, Switch as ToggleSwitch, Slider, ColorPicker } from "../../form-controls/Controls";
import styles from "../styles/Fields.module.css";

/** Generic variants rendered independently of RodMenu's media/diagnostic extensions.
 * The RodMenu context bridge will be replaced with the shared FieldContext in a follow-up.
 */
export interface SharedFieldRendererProps {
  field: RodMenuField;
  context: RodMenuContext<any>;
  value: unknown;
  controlId: string;
  disabled: boolean;
  commit(value: unknown): void;
  onError(error: unknown): void;
}
export function SharedFieldRenderer(props: SharedFieldRendererProps) {
  const fieldValue = () => props.value;
  const controlId = () => props.controlId;
  const isDisabled = () => props.disabled;
  const commit = props.commit;
  return (
    <Switch fallback={null}>
      <Match
        when={
          props.field.type === "text" ||
          props.field.type === "email" ||
          props.field.type === "password" ||
          props.field.type === "search" ||
          props.field.type === "url" ||
          props.field.type === "tel"
        }
      >
        {(() => {
          const f = props.field as TextLikeField;
          return (
            <input
              id={controlId()}
              name={f.name}
              type={f.type}
              class={styles.control}
              placeholder={f.placeholder || ""}
              disabled={isDisabled()}
              readOnly={f.readonly}
              required={f.required}
              autofocus={f.autoFocus}
              minLength={f.minLength}
              maxLength={f.maxLength}
              pattern={f.pattern}
              autocomplete={f.autocomplete}
              spellcheck={f.spellcheck}
              value={String(fieldValue() ?? "")}
              onInput={(e) => commit(e.currentTarget.value)}
            />
          );
        })()}
      </Match>

      <Match when={props.field.type === "number"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "number" }>;
          const val = fieldValue();
          return (
            <input
              id={controlId()}
              name={f.name}
              type="number"
              class={styles.control}
              placeholder={f.placeholder || ""}
              disabled={isDisabled()}
              readOnly={f.readonly}
              required={f.required}
              min={f.min}
              max={f.max}
              step={f.step}
              value={val === "" || val == null ? "" : String(val)}
              onInput={(e) => commit(e.currentTarget.value === "" ? "" : e.currentTarget.valueAsNumber)}
            />
          );
        })()}
      </Match>

      <Match when={props.field.type === "textarea"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "textarea" }>;
          return (
            <textarea
              id={controlId()}
              name={f.name}
              class={styles.textarea}
              placeholder={f.placeholder || ""}
              rows={f.rows ?? 4}
              disabled={isDisabled()}
              readOnly={f.readonly}
              required={f.required}
              minLength={f.minLength}
              maxLength={f.maxLength}
              style={{ resize: f.resize || "vertical" }}
              value={String(fieldValue() ?? "")}
              onInput={(e) => commit(e.currentTarget.value)}
            />
          );
        })()}
      </Match>

      <Match when={props.field.type === "select"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "select" }>;
          return (
            <Show
              when={!f.searchable}
              fallback={
                <TypeaheadSelect
                  id={controlId()}
                  field={f}
                  value={fieldValue()}
                  multiple={false}
                  disabled={isDisabled()}
                  onCommit={commit}
                />
              }
            >
              <Select id={controlId()} name={f.name} value={String(fieldValue() ?? "")} disabled={isDisabled()} options={f.options} onChange={commit} />
            </Show>
          );
        })()}
      </Match>

      <Match when={props.field.type === "multiselect"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "multiselect" }>;
          const selected = () =>
            new Set(Array.isArray(fieldValue()) ? (fieldValue() as unknown[]).map(String) : []);

          return (
            <Show
              when={!f.searchable}
              fallback={
                <TypeaheadSelect
                  id={controlId()}
                  field={f}
                  value={fieldValue()}
                  multiple={true}
                  disabled={isDisabled()}
                  onCommit={commit}
                />
              }
            >
              <div class={styles.chipbox}>
                <For each={f.options}>
                  {(opt) => (
                    <button
                      type="button"
                      class={styles.chip}
                      disabled={isDisabled() || opt.disabled}
                      data-selected={String(selected().has(opt.value))}
                      onClick={() => {
                        const next = new Set(selected());
                        if (next.has(opt.value)) next.delete(opt.value);
                        else next.add(opt.value);
                        commit(Array.from(next));
                      }}
                    >
                      {opt.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          );
        })()}
      </Match>

      <Match when={props.field.type === "radio" || props.field.type === "checkbox-group"}>
        {(() => {
          const f = props.field as RadioField | CheckboxGroupField;
          const isRadio = f.type === "radio";
          const checkedSet = () =>
            new Set(Array.isArray(fieldValue()) ? (fieldValue() as unknown[]).map(String) : []);

          return (
            <div class={styles.options} data-direction={f.direction || "vertical"}>
              <For each={f.options}>
                {(opt) => (
                  <label class={styles.option}>
                    <input
                      type={isRadio ? "radio" : "checkbox"}
                      name={isRadio ? f.name : `${f.name}[]`}
                      value={opt.value}
                      disabled={isDisabled() || opt.disabled}
                      checked={
                        isRadio ? String(fieldValue() ?? "") === opt.value : checkedSet().has(opt.value)
                      }
                      onChange={(e) => {
                        if (isRadio) {
                          commit(opt.value);
                        } else {
                          const next = new Set(checkedSet());
                          if (e.currentTarget.checked) next.add(opt.value);
                          else next.delete(opt.value);
                          commit(Array.from(next));
                        }
                      }}
                    />
                    <span class={styles.optionCopy}>
                      <span>{opt.label}</span>
                      <Show when={opt.description}>
                        <span class={styles.optionDesc}>{opt.description}</span>
                      </Show>
                    </span>
                  </label>
                )}
              </For>
            </div>
          );
        })()}
      </Match>

      <Match when={props.field.type === "checkbox" || props.field.type === "switch"}>
        {(() => {
          const f = props.field as BooleanField;
          return (
            <label class={styles.checkRow}>
              <span class={styles.checkLabel}>
                <span class={styles.label}>{f.label || f.name}</span>
                <Show when={f.description}>
                  <div class={styles.descriptionField}>{f.description}</div>
                </Show>
              </span>
              {f.type === "switch" ? <ToggleSwitch id={controlId()} name={f.name} checked={Boolean(fieldValue())} disabled={isDisabled()} onChange={commit} /> : <Checkbox id={controlId()} name={f.name} checked={Boolean(fieldValue())} disabled={isDisabled()} onChange={commit} />}
            </label>
          );
        })()}
      </Match>

      <Match when={props.field.type === "range"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "range" }>;
          const currentVal = () => String(fieldValue() ?? f.min ?? 0);
          return (
            <div class={styles.rangeWrap}>
              <Slider id={controlId()} name={f.name} value={Number(fieldValue() ?? f.min ?? 0)} min={f.min} max={f.max} step={f.step} disabled={isDisabled()} onChange={commit} />
              <Show when={f.showValue !== false}>
                <output class={styles.rangeValue}>{currentVal()}</output>
              </Show>
            </div>
          );
        })()}
      </Match>

      <Match
        when={
          props.field.type === "date" ||
          props.field.type === "datetime-local" ||
          props.field.type === "time" ||
          props.field.type === "month" ||
          props.field.type === "week"
        }
      >
        {(() => {
          const f = props.field as DateLikeField;
          return (
            <input
              id={controlId()}
              name={f.name}
              type={f.type}
              class={styles.control}
              min={f.min}
              max={f.max}
              step={f.step}
              disabled={isDisabled()}
              value={String(fieldValue() ?? "")}
              onInput={(e) => commit(e.currentTarget.value)}
            />
          );
        })()}
      </Match>

      <Match when={props.field.type === "color"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "color" }>;
          return <ColorPicker id={controlId()} name={f.name} value={String(fieldValue() ?? "")}
            disabled={isDisabled()} presets={f.presets} onChange={commit} aria-label={f.label ?? f.name} />;
        })()}
      </Match>

            <Match when={props.field.type === "file"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "file" }>;
          return (
            <input
              id={controlId()}
              name={f.name}
              type="file"
              class={styles.control}
              accept={f.accept}
              multiple={f.multiple}
              disabled={isDisabled()}
              onChange={(e) => commit(Array.from(e.currentTarget.files || []))}
            />
          );
        })()}
      </Match>

      <Match when={props.field.type === "hidden"}>
        <input id={controlId()} name={props.field.name} type="hidden" value={String(fieldValue() ?? "")} />
      </Match>

      <Match when={props.field.type === "segmented"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "segmented" }>;
          return (
            <div class={styles.segmented}>
              <For each={f.options}>
                {(opt) => (
                  <button
                    type="button"
                    class={styles.segment}
                    disabled={isDisabled() || opt.disabled}
                    data-selected={String(String(fieldValue() ?? "") === opt.value)}
                    onClick={() => commit(opt.value)}
                  >
                    {opt.label}
                  </button>
                )}
              </For>
            </div>
          );
        })()}
      </Match>

      <Match when={props.field.type === "rating"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "rating" }>;
          const max = Math.max(1, f.max ?? 5);
          const stars = Array.from({ length: max }, (_, i) => i + 1);
          return (
            <div class={styles.stars}>
              <For each={stars}>
                {(star) => (
                  <button
                    type="button"
                    class={styles.star}
                    disabled={isDisabled()}
                    data-on={String(Number(fieldValue() || 0) >= star)}
                    onClick={() => {
                      const next = f.allowZero !== false && Number(fieldValue()) === star ? 0 : star;
                      commit(next);
                    }}
                  >
                    ★
                  </button>
                )}
              </For>
            </div>
          );
        })()}
      </Match>

      <Match when={props.field.type === "button"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "button" }>;
          return (
            <button
              type="button"
              class={styles.fieldButton}
              disabled={isDisabled()}
              onClick={async () => {
                try {
                  await f.onPress?.(props.context);
                } catch (err) {
                  props.onError(err);
                }
              }}
            >
              {f.text || f.label || f.name}
            </button>
          );
        })()}
      </Match>

      <Match when={props.field.type === "html"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "html" }>;
          const markup = () => (typeof f.html === "function" ? f.html(props.context) : f.html);
          return <div innerHTML={markup()} />;
        })()}
      </Match>

      <Match when={props.field.type === "custom"}>
        {(() => {
          const f = props.field as Extract<RodMenuField, { type: "custom" }>;
          return <div data-custom-field={f.name}>{f.render(props.context, f)}</div>;
        })()}
      </Match>
    </Switch>
  );
}
