import { For, Show } from 'solid-js';
import type { FormField, FieldContext } from './fields';
import { Combobox } from './Combobox';
import styles from './StandaloneFieldRenderer.module.css';

export interface StandaloneFieldRendererProps<TContext = FieldContext> {
  field: FormField<TContext>;
  value: unknown;
  context: TContext;
  onChange(value: unknown): void;
  id?: string;
}
/** Framework-neutral form renderer: no RodMenu imports, global styles or portal assumptions. */
export function StandaloneFieldRenderer<TContext = FieldContext>(props: StandaloneFieldRendererProps<TContext>) {
  const field = () => props.field;
  const id = () => props.id ?? `field-${field().name}`;
  const value = () => props.value;
  const commit = (next: unknown) => props.onChange(next);
  const disabled = () => !!field().disabled;
  const kind = () => field().type;
  const choices = () => 'options' in field() ? (field() as { options: readonly { value: string; label: string; disabled?: boolean }[] }).options : [];
  const stringValue = () => String(value() ?? '');
  const common = () => ({ id: id(), name: field().name, disabled: disabled(), required: !!field().required });
  return <div class={styles.field} data-field-type={kind()} data-disabled={String(disabled())}>
    <Show when={!['hidden','divider','button','checkbox','switch','html','custom'].includes(kind()) && field().chrome !== 'bare'}>
      <label for={id()}>{field().label ?? field().name}</label>
    </Show>
    <Show when={['text','email','password','search','url','tel','number','date','datetime-local','time','month','week','color','range','hidden'].includes(kind())}>
      <input {...common()} type={kind()} value={stringValue()} placeholder={field().placeholder}
        min={'min' in field() ? field().min as string | number : undefined}
        max={'max' in field() ? field().max as string | number : undefined}
        step={'step' in field() ? field().step as string | number : undefined}
        readOnly={!!field().readonly}
        onInput={(event) => commit(['number','range'].includes(kind()) ? (event.currentTarget.value === '' ? '' : event.currentTarget.valueAsNumber) : event.currentTarget.value)} />
    </Show>
    <Show when={kind() === 'textarea'}>
      <textarea {...common()} rows={'rows' in field() ? (field() as { rows?: number }).rows : 4} value={stringValue()} readOnly={!!field().readonly} onInput={(e) => commit(e.currentTarget.value)} />
    </Show>
    <Show when={kind() === 'select'}>
      <select {...common()} value={stringValue()} onChange={(e) => commit(e.currentTarget.value)}>
        <For each={choices()}>{(option) => <option value={option.value} disabled={option.disabled}>{option.label}</option>}</For>
      </select>
    </Show>
    <Show when={kind() === 'multiselect'}>
      <Combobox id={id()} options={choices()} value={Array.isArray(value()) ? value() as string[] : []} multiple onChange={commit} disabled={disabled()} />
    </Show>
    <Show when={kind() === 'checkbox' || kind() === 'switch'}>
      <label><input {...common()} type="checkbox" role={kind() === 'switch' ? 'switch' : undefined} checked={!!value()} onChange={(e) => commit(e.currentTarget.checked)} />{field().label ?? field().name}</label>
    </Show>
    <Show when={kind() === 'radio' || kind() === 'checkbox-group'}>
      <div role="group" aria-label={field().label ?? field().name}>
        <For each={choices()}>{(option) => <label><input type={kind() === 'radio' ? 'radio' : 'checkbox'} name={field().name} disabled={disabled() || option.disabled}
          checked={kind() === 'radio' ? value() === option.value : Array.isArray(value()) && (value() as string[]).includes(option.value)}
          onChange={(e) => { if (kind() === 'radio') commit(option.value); else { const next = new Set(Array.isArray(value()) ? value() as string[] : []); if (e.currentTarget.checked) next.add(option.value); else next.delete(option.value); commit([...next]); } }} />{option.label}</label>}</For>
      </div>
    </Show>
    <Show when={kind() === 'segmented'}>
      <div role="group" aria-label={field().label ?? field().name}><For each={choices()}>{(option) => <button type="button" aria-pressed={value() === option.value} disabled={disabled() || option.disabled} onClick={() => commit(option.value)}>{option.label}</button>}</For></div>
    </Show>
    <Show when={kind() === 'rating'}>
      <div role="group" aria-label={field().label ?? field().name}><For each={Array.from({ length: 'max' in field() ? field().max ?? 5 : 5 }, (_, i) => i + 1)}>{(n) => <button type="button" aria-label={`${n} estrelas`} aria-pressed={Number(value() ?? 0) === n} onClick={() => commit(n)} disabled={disabled()}>★</button>}</For></div>
    </Show>
    <Show when={kind() === 'file'}><input {...common()} type="file" accept={'accept' in field() ? (field() as { accept?: string }).accept : undefined} multiple={'multiple' in field() ? (field() as { multiple?: boolean }).multiple : false} onChange={(e) => commit(Array.from(e.currentTarget.files ?? []))} /></Show>
    <Show when={kind() === 'button'}><button type="button" disabled={disabled()} onClick={() => { const f = field(); if ('onPress' in f) void (f as { onPress?: (ctx: TContext) => void | Promise<void> }).onPress?.(props.context); }}>{'text' in field() ? (field() as { text?: string; label?: string }).text ?? field().label : field().label}</button></Show>
    <Show when={kind() === 'divider'}><hr /></Show>
    <Show when={kind() === 'html'}><div>{'html' in field() ? typeof (field() as { html: unknown }).html === 'function' ? (field() as { html: (ctx: TContext) => string }).html(props.context) : (field() as { html: string }).html : ''}</div></Show>
    <Show when={kind() === 'custom'}>{(() => { const f = field(); return 'render' in f ? (f as { render: (ctx: TContext, field: typeof f) => import('solid-js').JSX.Element }).render(props.context, f) : null; })()}</Show>
    <Show when={field().description}><small>{field().description}</small></Show>
  </div>;
}
