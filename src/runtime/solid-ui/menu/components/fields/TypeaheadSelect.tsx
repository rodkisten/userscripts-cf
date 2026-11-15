import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js';
import type { MultiSelectField, OptionItem, SelectField } from '../../types';
import styles from '../../styles/Fields.module.css';

export interface TypeaheadSelectProps {
  id: string;
  field: SelectField | MultiSelectField;
  value: unknown;
  multiple: boolean;
  disabled: boolean;
  onCommit: (value: unknown) => void;
}

export function TypeaheadSelect(props: TypeaheadSelectProps) {
  const [query, setQuery] = createSignal('');
  const [open, setOpen] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);
  let wrapRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;

  const selectedSet = createMemo(() => {
    if (props.multiple) {
      return new Set(Array.isArray(props.value) ? props.value.map(String) : []);
    }
    const v = String(props.value ?? '');
    return new Set(v ? [v] : []);
  });

  const filteredOptions = createMemo<OptionItem[]>(() => {
    const q = query().trim().toLocaleLowerCase();
    if (!q) return Array.from(props.field.options);
    return Array.from(props.field.options).filter((opt) =>
      `${opt.label} ${opt.value} ${opt.description || ''}`.toLocaleLowerCase().includes(q),
    );
  });

  const displayInputValue = () => {
    if (props.multiple) return query();
    if (open()) return query();
    const sel = props.field.options.find((opt) => selectedSet().has(opt.value));
    return sel?.label || '';
  };

  const toggleOption = (option: OptionItem) => {
    if (props.disabled || props.field.readonly || option.disabled) return;
    if (props.multiple) {
      const next = new Set(selectedSet());
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      props.onCommit(Array.from(next));
      setOpen(true);
      inputRef?.focus({ preventScroll: true });
    } else {
      props.onCommit(option.value);
      setQuery('');
      setOpen(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const opts = filteredOptions();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (opts.length) setHighlightedIndex((i) => (i + 1) % opts.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (opts.length) setHighlightedIndex((i) => (i - 1 + opts.length) % opts.length);
    } else if (e.key === 'Enter' && open() && opts.length) {
      e.preventDefault();
      const target = opts[Math.min(highlightedIndex(), opts.length - 1)];
      if (target) toggleOption(target);
    } else if (e.key === 'Escape' && open()) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setQuery('');
    }
  };

  {
    const onDocPointerDown = (e: PointerEvent) => {
      if (!open() || !wrapRef) return;
      if (!e.composedPath().includes(wrapRef)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onDocPointerDown, true));
  }

  return (
    <div
      ref={wrapRef}
      class={styles.typeahead}
      data-multiple={String(props.multiple)}
      data-disabled={String(props.disabled)}
    >
      <Show when={props.multiple && selectedSet().size > 0}>
        <div class={styles.typeaheadSelected}>
          <For each={Array.from(selectedSet())}>
            {(val) => {
              const opt = props.field.options.find((o) => o.value === val);
              if (!opt) return null;
              return (
                <div class={styles.typeaheadChip}>
                  <span>{opt.label}</span>
                  <Show when={!props.disabled && !props.field.readonly && !opt.disabled}>
                    <button
                      type="button"
                      aria-label={`Remover ${opt.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOption(opt);
                      }}
                    >
                      ×
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <div class={styles.typeaheadInputWrap}>
        <input
          ref={inputRef}
          id={props.id}
          name={props.field.name}
          type="text"
          class={styles.typeaheadInput}
          placeholder={props.field.placeholder || props.field.searchPlaceholder || 'Pesquisar…'}
          disabled={props.disabled}
          readOnly={props.field.readonly}
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open()}
          value={displayInputValue()}
          onFocus={() => {
            if (!props.disabled && !props.field.readonly) setOpen(true);
          }}
          onClick={() => {
            if (!props.disabled && !props.field.readonly) setOpen(true);
          }}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setHighlightedIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <span class={styles.typeaheadChevron} aria-hidden="true">⌄</span>
      </div>

      <Show when={open()}>
        <div class={styles.typeaheadList} role="listbox">
          <Show
            when={filteredOptions().length > 0}
            fallback={
              <div class={styles.typeaheadEmpty}>
                {props.field.emptyMessage || 'Nenhuma opção encontrada.'}
              </div>
            }
          >
            <For each={filteredOptions()}>
              {(option, index) => {
                const isSelected = () => selectedSet().has(option.value);
                return (
                  <button
                    type="button"
                    class={styles.typeaheadOption}
                    data-selected={String(isSelected())}
                    data-highlighted={String(index() === highlightedIndex())}
                    disabled={props.disabled || props.field.readonly || option.disabled}
                    role="option"
                    aria-selected={isSelected()}
                    onMouseEnter={() => setHighlightedIndex(index())}
                    onClick={() => toggleOption(option)}
                  >
                    <span
                      class={styles.typeaheadIndicator}
                      data-kind={props.multiple ? 'checkbox' : 'radio'}
                      aria-hidden="true"
                    />
                    <span class={styles.typeaheadOptionCopy}>
                      <strong>{option.label}</strong>
                      <Show when={option.description}>
                        <small>{option.description}</small>
                      </Show>
                    </span>
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
