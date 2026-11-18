import { createSignal, For, Show } from "solid-js";
import type { ControlOption } from "./options";
import { filterOptions } from "./options";
import styles from "./Combobox.module.css";

export interface TagsInputProps {
  id: string;
  value: readonly string[];
  options?: readonly ControlOption[];
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  allowDuplicates?: boolean;
  maxTags?: number;
  separators?: readonly string[];
  onChange: (values: string[]) => void;
}

export function TagsInput(props: TagsInputProps) {
  const [query, setQuery] = createSignal("");
  const [focused, setFocused] = createSignal(false);
  const options = () => filterOptions(props.options ?? [], query()).filter((option) => !option.disabled);
  const canEdit = () => !props.disabled && !props.readonly;
  const add = (raw: string) => {
    const value = raw.trim();
    if (!canEdit() || !value || (props.maxTags != null && props.value.length >= props.maxTags)) return;
    if (!props.allowDuplicates && props.value.includes(value)) {
      setQuery("");
      return;
    }
    props.onChange([...props.value, value]);
    setQuery("");
  };
  const remove = (index: number) => {
    if (!canEdit()) return;
    props.onChange(props.value.filter((_, i) => i !== index));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!canEdit()) return;
    if (event.key === "Enter" || (props.separators ?? [",", ";"]).includes(event.key)) {
      event.preventDefault();
      add(query());
    } else if (event.key === "Backspace" && !query() && props.value.length) {
      remove(props.value.length - 1);
    } else if (event.key === "Escape") {
      setFocused(false);
      (event.currentTarget as HTMLInputElement).blur();
    }
  };
  return (
    <div class={styles.root} data-disabled={String(!!props.disabled)}>
      <div class={styles.chips} aria-label="Tags selecionadas">
        <For each={props.value}>
          {(tag, index) => (
            <span class={styles.chip}>
              {tag}
              <Show when={canEdit()}>
                <button type="button" aria-label={`Remover ${tag}`} onClick={() => remove(index())}>
                  ×
                </button>
              </Show>
            </span>
          )}
        </For>
      </div>
      <div class={styles.inputRow}>
        <input
          id={props.id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={String(focused() && options().length > 0)}
          aria-controls={`${props.id}-suggestions`}
          autocomplete="off"
          disabled={props.disabled}
          readOnly={props.readonly}
          placeholder={props.placeholder ?? "Adicionar tag…"}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      <Show when={focused() && query() && options().length > 0}>
        <div id={`${props.id}-suggestions`} class={styles.list} role="listbox">
          <For each={options()}>
            {(option) => (
              <button
                type="button"
                class={styles.option}
                role="option"
                aria-selected={String(props.value.includes(option.value))}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  add(option.value);
                  setFocused(false);
                }}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
