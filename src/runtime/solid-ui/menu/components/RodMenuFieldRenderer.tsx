import { createSignal, Match, Show, Switch } from 'solid-js';
import { isSharedFieldType } from '../../form-controls/field-types';
import type { AnyRecord, BaseField, RodMenuContext, RodMenuField, SolidFieldRenderer } from '../types';
import { SharedFieldRenderer } from './SharedFieldRenderer';
import { StandaloneFieldRenderer } from '../../form-controls/StandaloneFieldRenderer';
import type { FormField } from '../../form-controls/fields';
import { isMenuFieldVisible, isMenuFieldDisabled } from '../rod-menu-solid/src/adapters/form-controls';
import {
  ChannelPickerControl,
  DebugJsonControl,
  MediaPickerControl,
  MediaPreviewControl,
  ProviderStatusControl,
  RequestLogControl,
} from './fields/MediaAndDiagnostics';
import styles from '../styles/Fields.module.css';

export interface RodMenuFieldRendererProps {
  surfaceId: string;
  field: RodMenuField;
  context: RodMenuContext<any>;
  customFieldTypes?: Readonly<Record<string, SolidFieldRenderer>>;
  onCommit: (field: RodMenuField, raw: unknown) => void;
  onError: (err: unknown) => void;
}

export function RodMenuFieldRenderer(props: RodMenuFieldRendererProps) {
  const [trailingLoading, setTrailingLoading] = createSignal(false);

  const isVisible = () => isMenuFieldVisible(props.field, props.context, props.onError);
  const isDisabled = () => isMenuFieldDisabled(props.field, props.context, props.onError);

  const fieldValue = () => props.context.values[props.field.name];
  const fieldError = () => props.context.errors[props.field.name];
  const controlId = () => `${props.surfaceId}-${props.field.name}`;

  const commit = (val: unknown) => props.onCommit(props.field, val);

  const showLabelRow = () =>
    props.field.chrome !== 'bare' &&
    !['checkbox', 'switch', 'hidden', 'button', 'html', 'divider'].includes(props.field.type);

  // Progressive adapter: retain legacy rendering for specialized fields until parity is verified.
  const standaloneTypes = new Set(['text', 'email', 'password', 'search', 'url', 'tel', 'number', 'textarea', 'date', 'datetime-local', 'time', 'month', 'week', 'color', 'hidden']);
  const useStandalone = () => standaloneTypes.has(props.field.type) && props.field.attributes?.['data-renderer'] === 'standalone';

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
        <Match when={isSharedFieldType(props.field.type) && useStandalone()}>
          <StandaloneFieldRenderer field={{ ...props.field, chrome: 'bare', disabled: isDisabled() } as FormField<RodMenuContext<any>>}
            context={props.context} value={fieldValue()} id={controlId()} onChange={commit} />
        </Match>
        <Match when={isSharedFieldType(props.field.type) && !useStandalone()}>
          <SharedFieldRenderer field={props.field} context={props.context} value={fieldValue()}
            controlId={controlId()} disabled={isDisabled()} commit={commit} onError={props.onError} />
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
