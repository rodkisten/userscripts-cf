import styles, { css } from "./Controls.module.css";
export { css as controlsCss };
import type { ControlOption } from "./options";
export interface SelectProps { id?: string; name?: string; value: string; options: readonly ControlOption[]; disabled?: boolean; onChange(value: string): void }
export function Select(props: SelectProps) {
  return <select id={props.id} name={props.name} class={styles.select} value={props.value} disabled={props.disabled}
    onChange={(event) => props.onChange(event.currentTarget.value)}>
    {props.options.map((option) => <option value={option.value} disabled={option.disabled}>{option.label}</option>)}
  </select>;
}
export interface BooleanControlProps { id?: string; name?: string; checked: boolean; disabled?: boolean; onChange(value: boolean): void; "aria-label"?: string }
export function Checkbox(props: BooleanControlProps) {
  return <input id={props.id} name={props.name} class={styles.checkbox} type="checkbox" checked={props.checked}
    aria-label={props["aria-label"]} disabled={props.disabled} onChange={(event) => props.onChange(event.currentTarget.checked)} />;
}
export function Switch(props: BooleanControlProps) {
  return <input id={props.id} name={props.name} class={styles.switch} type="checkbox" role="switch" checked={props.checked}
    aria-label={props["aria-label"]} disabled={props.disabled} onChange={(event) => props.onChange(event.currentTarget.checked)} />;
}
export interface SliderProps { id?: string; name?: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean; onChange(value: number): void }
export function Slider(props: SliderProps) {
  return <input id={props.id} name={props.name} class={styles.slider} type="range" value={props.value}
    min={props.min ?? 0} max={props.max ?? 100} step={props.step ?? 1} disabled={props.disabled}
    onInput={(event) => props.onChange(event.currentTarget.valueAsNumber)} />;
}
