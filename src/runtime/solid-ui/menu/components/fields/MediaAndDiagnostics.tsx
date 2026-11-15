import { createSignal, For, Show } from 'solid-js';
import type {
  ChannelPickerField,
  DebugJsonField,
  MediaPickerField,
  MediaPreviewField,
  ProviderStatusField,
  RequestLogField,
  RodMenuContext,
} from '../../types';
import styles from '../../styles/Fields.module.css';

export function MediaPreviewControl(props: { field: MediaPreviewField; context: RodMenuContext<any> }) {
  const item = () => (typeof props.field.item === 'function' ? props.field.item(props.context) : props.field.item);
  const meta = () => {
    const it = item();
    return [
      it.type,
      it.quality,
      it.width && it.height ? `${it.width}×${it.height}` : null,
      it.provider,
      props.field.showSource !== false ? it.source : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <article class={styles.mediaPreview} data-compact={String(!!props.field.compact)}>
      <Show
        when={item().thumbnail}
        fallback={
          <div class={styles.mediaPlaceholder}>
            {item().type === 'video' ? 'VIDEO' : item().type === 'audio' ? 'AUDIO' : 'MEDIA'}
          </div>
        }
      >
        <img
          class={styles.mediaThumb}
          src={item().thumbnail}
          alt={item().title || item().type || 'Media preview'}
          loading="lazy"
        />
      </Show>
      <div class={styles.mediaCopy}>
        <strong>{item().title || item().source || item().id}</strong>
        <Show when={item().description}>
          <p>{item().description}</p>
        </Show>
        <Show when={meta()}>
          <small>{meta()}</small>
        </Show>
        <Show when={item().url}>
          <a class={styles.mediaOpen} href={item().url} target="_blank" rel="noopener noreferrer">
            Abrir origem
          </a>
        </Show>
      </div>
    </article>
  );
}

export function MediaPickerControl(props: {
  field: MediaPickerField;
  value: unknown;
  context: RodMenuContext<any>;
  onCommit: (val: unknown) => void;
}) {
  const items = () =>
    typeof props.field.items === 'function' ? props.field.items(props.context) : props.field.items;
  const selected = () => new Set(Array.isArray(props.value) ? props.value.map(String) : []);

  const toggle = (id: string) => {
    const next = new Set(selected());
    if (next.has(id)) next.delete(id);
    else {
      if (props.field.maxSelected && next.size >= props.field.maxSelected) return;
      next.add(id);
    }
    props.onCommit(Array.from(next));
  };

  const selectAll = () => {
    const allIds = items()
      .filter((it) => !it.disabled)
      .map((it) => it.id);
    props.onCommit(allIds);
  };

  return (
    <div
      class={styles.mediaPicker}
      style={{ '--rm-media-columns': String(props.field.columns ?? 2) }}
    >
      <Show when={props.field.selectAll !== false && items().length > 1}>
        <div class={styles.pickerToolbar}>
          <span>
            {selected().size} de {items().length} selecionados
          </span>
          <button type="button" class={styles.miniButton} onClick={selectAll}>
            Selecionar tudo
          </button>
        </div>
      </Show>

      <div class={styles.mediaGrid}>
        <For each={items()}>
          {(item) => {
            const isSel = () => selected().has(item.id);
            const meta = [
              item.type,
              item.quality,
              item.width && item.height ? `${item.width}×${item.height}` : null,
              item.provider,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <button
                type="button"
                class={styles.mediaItem}
                data-selected={String(isSel())}
                disabled={item.disabled}
                onClick={() => toggle(item.id)}
              >
                <Show when={item.thumbnail}>
                  <img src={item.thumbnail} alt={item.title || item.id} loading="lazy" />
                </Show>
                <span class={styles.mediaItemCopy}>
                  <strong>{item.title || item.quality || item.id}</strong>
                  <Show when={meta}>
                    <small>{meta}</small>
                  </Show>
                </span>
                <Show when={isSel()}>
                  <span class={styles.mediaCheck}>✓</span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}

export function ProviderStatusControl(props: { field: ProviderStatusField; context: RodMenuContext<any> }) {
  const providers = () =>
    typeof props.field.providers === 'function' ? props.field.providers(props.context) : props.field.providers;

  return (
    <div class={styles.providerList}>
      <For each={providers()}>
        {(provider) => (
          <div class={styles.provider} data-state={provider.state}>
            <span class={styles.providerDot} />
            <span class={styles.providerCopy}>
              <strong>{provider.label}</strong>
              <small>{provider.error || provider.description || provider.state}</small>
            </span>
            <span class={styles.providerDuration}>
              {provider.durationMs != null ? `${provider.durationMs} ms` : ''}
            </span>
          </div>
        )}
      </For>
    </div>
  );
}

export function RequestLogControl(props: { field: RequestLogField; context: RodMenuContext<any> }) {
  const entries = () =>
    typeof props.field.entries === 'function' ? props.field.entries(props.context) : props.field.entries;

  return (
    <div
      class={styles.requestLog}
      style={props.field.maxHeight ? { 'max-height': `${props.field.maxHeight}px` } : undefined}
    >
      <For each={entries()}>
        {(entry) => (
          <button
            type="button"
            class={styles.requestRow}
            onClick={() => props.field.onSelect?.(entry, props.context)}
          >
            <span class={styles.requestMethod}>{entry.method || 'GET'}</span>
            <span class={styles.requestUrl}>{entry.url}</span>
            <span class={styles.requestStatus}>
              {[entry.status, entry.durationMs != null ? `${entry.durationMs}ms` : ''].filter(Boolean).join(' · ')}
            </span>
          </button>
        )}
      </For>
    </div>
  );
}

export function DebugJsonControl(props: {
  field: DebugJsonField;
  context: RodMenuContext<any>;
  onError: (err: unknown) => void;
}) {
  const [copied, setCopied] = createSignal(false);
  const text = () => {
    const data = typeof props.field.data === 'function' ? props.field.data(props.context) : props.field.data;
    try {
      return JSON.stringify(data, null, props.field.pretty === false ? 0 : 2);
    } catch {
      return String(data);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(text());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      props.onError(err);
    }
  };

  return (
    <div class={styles.debugJson}>
      <div class={styles.pickerToolbar}>
        <span>JSON</span>
        <button type="button" class={styles.miniButton} onClick={handleCopy}>
          {copied() ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre style={props.field.maxHeight ? { 'max-height': `${props.field.maxHeight}px` } : undefined}>
        {text()}
      </pre>
    </div>
  );
}

export function ChannelPickerControl(props: {
  field: ChannelPickerField;
  value: unknown;
  onCommit: (val: unknown) => void;
}) {
  const [query, setQuery] = createSignal('');
  const selected = () =>
    new Set(
      props.field.multiple
        ? Array.isArray(props.value)
          ? props.value.map(String)
          : []
        : [String(props.value ?? '')].filter(Boolean),
    );

  const filtered = () => {
    const q = query().trim().toLowerCase();
    if (!q) return props.field.options;
    return props.field.options.filter((opt) =>
      `${opt.label} ${opt.description || ''}`.toLowerCase().includes(q),
    );
  };

  const toggle = (val: string) => {
    if (props.field.multiple) {
      const next = new Set(selected());
      if (next.has(val)) next.delete(val);
      else next.add(val);
      props.onCommit(Array.from(next));
    } else {
      props.onCommit(val);
    }
  };

  return (
    <div class={styles.channelPicker}>
      <Show when={props.field.searchable}>
        <input
          type="search"
          class={styles.control}
          placeholder={props.field.placeholder || 'Buscar…'}
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </Show>
      <div class={styles.channelOptions}>
        <For each={filtered()}>
          {(option) => (
            <button
              type="button"
              class={styles.channelOption}
              data-selected={String(selected().has(option.value))}
              disabled={option.disabled}
              onClick={() => toggle(option.value)}
            >
              <Show when={option.icon}>
                <span>
                  {typeof option.icon === 'string' ? <span innerHTML={option.icon} /> : option.icon}
                </span>
              </Show>
              <span>
                <strong>{option.label}</strong>
                <Show when={option.description}>
                  <small>{option.description}</small>
                </Show>
              </span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
