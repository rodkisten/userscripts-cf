import { For } from "solid-js";
import styles, { css } from "./Controls.module.css";
export { css as controlsCss };
import type { ControlOption } from "./options";
export interface SelectProps {
  id?: string;
  name?: string;
  value: string;
  options: readonly ControlOption[];
  disabled?: boolean;
  onChange(value: string): void;
}
export function Select(props: SelectProps) {
  return (
    <select
      id={props.id}
      name={props.name}
      class={styles.select}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {
        <For each={props.options}>
          {(option) => (
            <option value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          )}
        </For>
      }
    </select>
  );
}
export interface BooleanControlProps {
  id?: string;
  name?: string;
  checked: boolean;
  disabled?: boolean;
  onChange(value: boolean): void;
  "aria-label"?: string;
}
export function Checkbox(props: BooleanControlProps) {
  return (
    <input
      id={props.id}
      name={props.name}
      class={styles.checkbox}
      type="checkbox"
      checked={props.checked}
      aria-label={props["aria-label"]}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  );
}
export function Switch(props: BooleanControlProps) {
  return (
    <input
      id={props.id}
      name={props.name}
      class={styles.switch}
      type="checkbox"
      role="switch"
      checked={props.checked}
      aria-label={props["aria-label"]}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  );
}
export interface SliderProps {
  id?: string;
  name?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange(value: number): void;
}
export function Slider(props: SliderProps) {
  return (
    <input
      id={props.id}
      name={props.name}
      class={styles.slider}
      type="range"
      value={props.value}
      min={props.min ?? 0}
      max={props.max ?? 100}
      step={props.step ?? 1}
      disabled={props.disabled}
      onInput={(event) => props.onChange(event.currentTarget.valueAsNumber)}
    />
  );
}

/** Reusable color input with optional palette. The native picker remains accessible on iOS. */
export interface ColorPickerProps {
  id?: string;
  name?: string;
  value: string;
  disabled?: boolean;
  readonly?: boolean;
  presets?: readonly string[];
  onChange(value: string): void;
  "aria-label"?: string;
}
export function ColorPicker(props: ColorPickerProps) {
  const valid = (color: string) => /^#[0-9a-f]{6}$/i.test(color);
  const current = () => (valid(props.value) ? props.value : "#7c3aed");
  return (
    <div class={styles.colorPicker}>
      <input
        id={props.id}
        name={props.name}
        type="color"
        class={styles.colorInput}
        value={current()}
        aria-label={props["aria-label"] ?? "Selecionar cor"}
        disabled={props.disabled || props.readonly}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
      <output class={styles.colorValue} for={props.id}>
        {current().toUpperCase()}
      </output>
      <div class={styles.colorPresets} role="group" aria-label="Cores predefinidas">
        {
          <For each={(props.presets ?? []).filter(valid)}>
            {(color) => (
              <button
                type="button"
                class={styles.colorPreset}
                style={{ "background-color": color }}
                aria-label={color}
                aria-pressed={current().toLowerCase() === color.toLowerCase()}
                disabled={props.disabled || props.readonly}
                onClick={() => props.onChange(color)}
              />
            )}
          </For>
        }
      </div>
    </div>
  );
}
