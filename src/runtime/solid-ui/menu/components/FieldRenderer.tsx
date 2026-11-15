import { createSignal, For, Match, Show, Switch } from 'solid-js';
import type { AnyRecord, BaseField, RodMenuContext, RodMenuField, SolidFieldRenderer } from '../types';
import { TypeaheadSelect } from './fields/TypeaheadSelect';
import {
  ChannelPickerControl,
  DebugJsonControl,
  MediaPickerControl,
  MediaPreviewControl,
  ProviderStatusControl,
  RequestLogControl,
} from './fields/MediaAndDiagnostics';
import styles from '../styles/Fields.module.css';

export interface FieldRendererProps {
  surfaceId: string;
  field: RodMenuField;
  context: RodMenuContext<any>;
  customFieldTypes?: Readonly<Record<string, SolidFieldRenderer>>;
  onCommit: (field: RodMenuField, raw: unknown) => void;
  onError: (err: unknown) => void;
}

export function FieldRenderer(props: FieldRendererProps) {
  const [trailingLoading, setTrailingLoading] = createSignal(false);

  const isVisible = () => {
    if (props.field.hidden) return false;
    if (!props.field.visibleWhen) return true;
    try {
      return !!props.field.visibleWhen(props.context.values, props.context);
    } catch (err) {
      props.onError(err);
      return true;
    }
  };

  const isDisabled = () => {
    if (props.field.disabled) return true;
    if (!props.field.disabledWhen) return false;
    try {
      return !!props.field.disabledWhen(props.context.values, props.context);
    } catch (err) {
      props.onError(err);
      return false;
    }
  };

  const fieldValue = () => props.context.values[props.field.name];
  const fieldError = () => props.context.errors[props.field.name];
  const controlId = () => `${props.surfaceId}-${props.field.name}`;

  const commit = (val: unknown) => props.onCommit(props.field, val);

  const showLabelRow = () =>
    props.field.chrome !== 'bare' &&
    !['checkbox', 'switch', 'hidden', 'button', 'html', 'divider'].includes(props.field.type);

  const renderControl = () => {
    const customRenderer = props.customFieldTypes?.[props.field.type];
    if (customRenderer) {
      return customRenderer({
        field: props.field as BaseField & AnyRecord,
        value: fieldValue(),
        context: props.context,
        commit,
      });
    }

    return (
      <Switch fallback={<div>Unsupported field: {(props.field as BaseField).type}</div>}>
        <Match
          when={
            props.field.type === 'text' ||
            props.field.type === 'email' ||
            props.field.type === 'password' ||
            props.field.type === 'search' ||
            props.field.type === 'url' ||
            props.field.type === 'tel'
          }
        >
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'text' }>;
            return (
              <input
                id={controlId()}
                name={f.name}
                type={f.type}
                class={styles.control}
                placeholder={f.placeholder || ''}
                disabled={isDisabled()}
                readOnly={f.readonly}
                required={f.required}
                autofocus={f.autoFocus}
                minLength={f.minLength}
                maxLength={f.maxLength}
                pattern={f.pattern}
                autocomplete={f.autocomplete}
                spellcheck={f.spellcheck}
                value={String(fieldValue() ?? '')}
                onInput={(e) => commit(e.currentTarget.value)}
              />
            );
          })()}
        </Match>

        <Match when={props.field.type === 'number'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'number' }>;
            const val = fieldValue();
            return (
              <input
                id={controlId()}
                name={f.name}
                type="number"
                class={styles.control}
                placeholder={f.placeholder || ''}
                disabled={isDisabled()}
                readOnly={f.readonly}
                required={f.required}
                min={f.min}
                max={f.max}
                step={f.step}
                value={val === '' || val == null ? '' : String(val)}
                onInput={(e) =>
                  commit(e.currentTarget.value === '' ? '' : e.currentTarget.valueAsNumber)
                }
              />
            );
          })()}
        </Match>

        <Match when={props.field.type === 'textarea'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'textarea' }>;
            return (
              <textarea
                id={controlId()}
                name={f.name}
                class={styles.textarea}
                placeholder={f.placeholder || ''}
                rows={f.rows ?? 4}
                disabled={isDisabled()}
                readOnly={f.readonly}
                required={f.required}
                minLength={f.minLength}
                maxLength={f.maxLength}
                style={{ resize: f.resize || 'vertical' }}
                value={String(fieldValue() ?? '')}
                onInput={(e) => commit(e.currentTarget.value)}
              />
            );
          })()}
        </Match>

        <Match when={props.field.type === 'select'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'select' }>;
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
                <select
                  id={controlId()}
                  name={f.name}
                  class={styles.select}
                  disabled={isDisabled()}
                  value={String(fieldValue() ?? '')}
                  onChange={(e) => commit(e.currentTarget.value)}
                >
                  <For each={f.options}>
                    {(opt) => (
                      <option value={opt.value} disabled={opt.disabled}>
                        {opt.label}
                      </option>
                    )}
                  </For>
                </select>
              </Show>
            );
          })()}
        </Match>

        <Match when={props.field.type === 'multiselect'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'multiselect' }>;
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

        <Match when={props.field.type === 'radio' || props.field.type === 'checkbox-group'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'radio' | 'checkbox-group' }>;
            const isRadio = f.type === 'radio';
            const checkedSet = () =>
              new Set(Array.isArray(fieldValue()) ? (fieldValue() as unknown[]).map(String) : []);

            return (
              <div class={styles.options} data-direction={f.direction || 'vertical'}>
                <For each={f.options}>
                  {(opt) => (
                    <label class={styles.option}>
                      <input
                        type={isRadio ? 'radio' : 'checkbox'}
                        name={isRadio ? f.name : `${f.name}[]`}
                        value={opt.value}
                        disabled={isDisabled() || opt.disabled}
                        checked={
                          isRadio
                            ? String(fieldValue() ?? '') === opt.value
                            : checkedSet().has(opt.value)
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

        <Match when={props.field.type === 'checkbox' || props.field.type === 'switch'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'checkbox' | 'switch' }>;
            return (
              <label class={styles.checkRow}>
                <span class={styles.checkLabel}>
                  <span class={styles.label}>{f.label || f.name}</span>
                  <Show when={f.description}>
                    <div class={styles.descriptionField}>{f.description}</div>
                  </Show>
                </span>
                <input
                  id={controlId()}
                  name={f.name}
                  type="checkbox"
                  checked={Boolean(fieldValue())}
                  disabled={isDisabled()}
                  class={f.type === 'switch' ? styles.switch : styles.nativeCheck}
                  onChange={(e) => commit(e.currentTarget.checked)}
                />
              </label>
            );
          })()}
        </Match>

        <Match when={props.field.type === 'range'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'range' }>;
            const currentVal = () => String(fieldValue() ?? f.min ?? 0);
            return (
              <div class={styles.rangeWrap}>
                <input
                  id={controlId()}
                  name={f.name}
                  type="range"
                  class={styles.range}
                  min={f.min ?? 0}
                  max={f.max ?? 100}
                  step={f.step ?? 1}
                  disabled={isDisabled()}
                  value={currentVal()}
                  onInput={(e) => commit(e.currentTarget.valueAsNumber)}
                />
                <Show when={f.showValue !== false}>
                  <output class={styles.rangeValue}>{currentVal()}</output>
                </Show>
              </div>
            );
          })()}
        </Match>

        <Match
          when={
            props.field.type === 'date' ||
            props.field.type === 'datetime-local' ||
            props.field.type === 'time' ||
            props.field.type === 'month' ||
            props.field.type === 'week'
          }
        >
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'date' }>;
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
                value={String(fieldValue() ?? '')}
                onInput={(e) => commit(e.currentTarget.value)}
              />
            );
          })()}
        </Match>

        <Match when={props.field.type === 'color'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'color' }>;
            const hex = () => {
              const v = fieldValue();
              return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#ff7a18';
            };
            return (
              <div class={styles.colorRow}>
                <input
                  id={controlId()}
                  name={f.name}
                  type="color"
                  class={styles.color}
                  disabled={isDisabled()}
                  value={hex()}
                  onInput={(e) => commit(e.currentTarget.value)}
                />
                <Show when={f.presets?.length}>
                  <div class={styles.presets}>
                    <For each={f.presets}>
                      {(color) => (
                        <button
                          type="button"
                          class={styles.swatch}
                          style={{ background: color }}
                          aria-label={color}
                          onClick={() => commit(color)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            );
          })()}
        </Match>

        <Match when={props.field.type === 'file'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'file' }>;
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

        <Match when={props.field.type === 'hidden'}>
          <input id={controlId()} name={props.field.name} type="hidden" value={String(fieldValue() ?? '')} />
        </Match>

        <Match when={props.field.type === 'segmented'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'segmented' }>;
            return (
              <div class={styles.segmented}>
                <For each={f.options}>
                  {(opt) => (
                    <button
                      type="button"
                      class={styles.segment}
                      disabled={isDisabled() || opt.disabled}
                      data-selected={String(String(fieldValue() ?? '') === opt.value)}
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

        <Match when={props.field.type === 'rating'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'rating' }>;
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

        <Match when={props.field.type === 'button'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'button' }>;
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

        <Match when={props.field.type === 'media-preview'}>
          <MediaPreviewControl
            field={props.field as Extract<RodMenuField, { type: 'media-preview' }>}
            context={props.context}
          />
        </Match>

        <Match when={props.field.type === 'media-picker'}>
          <MediaPickerControl
            field={props.field as Extract<RodMenuField, { type: 'media-picker' }>}
            value={fieldValue()}
            context={props.context}
            onCommit={commit}
          />
        </Match>

        <Match when={props.field.type === 'provider-status'}>
          <ProviderStatusControl
            field={props.field as Extract<RodMenuField, { type: 'provider-status' }>}
            context={props.context}
          />
        </Match>

        <Match when={props.field.type === 'request-log'}>
          <RequestLogControl
            field={props.field as Extract<RodMenuField, { type: 'request-log' }>}
            context={props.context}
          />
        </Match>

        <Match when={props.field.type === 'debug-json'}>
          <DebugJsonControl
            field={props.field as Extract<RodMenuField, { type: 'debug-json' }>}
            context={props.context}
            onError={props.onError}
          />
        </Match>

        <Match when={props.field.type === 'channel-picker'}>
          <ChannelPickerControl
            field={props.field as Extract<RodMenuField, { type: 'channel-picker' }>}
            value={fieldValue()}
            onCommit={commit}
          />
        </Match>

        <Match when={props.field.type === 'html'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'html' }>;
            const markup = () => (typeof f.html === 'function' ? f.html(props.context) : f.html);
            return <div innerHTML={markup()} />;
          })()}
        </Match>

        <Match when={props.field.type === 'custom'}>
          {(() => {
            const f = props.field as Extract<RodMenuField, { type: 'custom' }>;
            return <div data-custom-field={f.name}>{f.render(props.context, f)}</div>;
          })()}
        </Match>
      </Switch>
    );
  };

  return (
    <div
      class={`${styles.field} ${props.field.className || ''}`.trim()}
      data-field={props.field.name}
      data-hidden={String(!isVisible())}
      data-chrome={props.field.chrome || 'default'}
      data-error={String(!!fieldError())}
    >
      <Show
        when={props.field.type !== 'divider'}
        fallback={<div class={styles.divider} aria-hidden="true" />}
      >
        <Show when={showLabelRow()}>
          <div class={styles.labelRow}>
            <label class={styles.label} for={controlId()}>
              {props.field.label || props.field.name}
              <Show when={props.field.required}>
                <span class={styles.required}>*</span>
              </Show>
            </label>
            <Show when={props.field.description}>
              <span class={styles.descriptionField}>{props.field.description}</span>
            </Show>
          </div>
        </Show>

        <Show when={props.field.trailingAction} fallback={renderControl()}>
          {(trailing) => {
            const trailingDisabled = () =>
              trailingLoading() ||
              !!trailing().disabled ||
              !!trailing().disabledWhen?.(props.context.values, props.context);

            return (
              <div class={styles.controlRow}>
                {renderControl()}
                <button
                  type="button"
                  class={styles.trailingAction}
                  title={trailing().title || trailing().label}
                  disabled={trailingDisabled()}
                  onClick={async () => {
                    if (trailingDisabled()) return;
                    setTrailingLoading(true);
                    try {
                      await trailing().handler(props.context);
                    } catch (err) {
                      props.onError(err);
                    } finally {
                      setTrailingLoading(false);
                    }
                  }}
                >
                  <Show when={trailing().icon}>
                    {typeof trailing().icon === 'string' ? (
                      <span innerHTML={trailing().icon as string} />
                    ) : (
                      trailing().icon
                    )}
                  </Show>
                  <span>{trailing().label}</span>
                </button>
              </div>
            );
          }}
        </Show>

        <Show when={props.field.help}>
          <div class={styles.help}>{props.field.help}</div>
        </Show>

        <Show when={fieldError()}>
          <div class={styles.error} role="alert">
            {fieldError()}
          </div>
        </Show>
      </Show>
    </div>
  );
}
