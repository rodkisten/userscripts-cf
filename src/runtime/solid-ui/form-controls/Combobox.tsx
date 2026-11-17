import { createEffect, createMemo, createSignal, For, Show, onCleanup, onSettled } from "solid-js";
import Fuse from "fuse.js";
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from "@tanstack/virtual-core";
import type { ControlOption } from "./options";
import { filterOptions, groupOptions } from "./options";
import type { OptionsSource } from "./options";
import { createAsyncOptions } from "./createAsyncOptions";
import type { QueryClient } from "@tanstack/query-core";
import styles from "./Combobox.module.css";

export interface ComboboxProps {
  id: string;
  name?: string;
  options: readonly ControlOption[];
  source?: OptionsSource;
  queryClient?: QueryClient;
  queryKey?: readonly unknown[];
  staleTime?: number;
  errorMessage?: string;
  value?: string | readonly string[] | null;
  multiple?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  clearable?: boolean;
  loading?: boolean;
  grouped?: boolean;
  fuzzy?: boolean;
  fuzzyThreshold?: number;
  virtualize?: boolean;
  virtualizeThreshold?: number;
  onChange: (value: string | string[]) => void;
}

export function Combobox(props: ComboboxProps) {
  const [query, setQuery] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let root: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  let scrollElement: HTMLDivElement | undefined;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(280);
  const fuse = createMemo(
    () =>
      new Fuse(props.options, {
        keys: ["label", "value", "description", "keywords"],
        threshold: props.fuzzyThreshold ?? 0.35,
        ignoreLocation: true,
      }),
  );
  const useVirtual = () =>
    !!props.virtualize && filtered().length >= (props.virtualizeThreshold ?? 80) && !props.grouped;
  const virtualizer = new Virtualizer<HTMLDivElement, HTMLButtonElement>({
    count: 0,
    getScrollElement: () => scrollElement ?? null,
    estimateSize: () => 46,
    overscan: 6,
    scrollToFn: elementScroll,
    observeElementRect,
    observeElementOffset,
    onChange: () => setScrollTop(scrollElement?.scrollTop ?? 0),
  });
  const listId = () => `${props.id}-listbox`;
  const selected = createMemo(
    () =>
      new Set(
        props.multiple
          ? Array.isArray(props.value)
            ? props.value.map(String)
            : []
          : props.value == null || props.value === ""
            ? []
            : [String(props.value)],
      ),
  );
  const remote = createAsyncOptions(() => props.source ?? props.options, query, {
    queryClient: props.queryClient,
    queryKey: props.queryKey,
    staleTime: props.staleTime,
    enabled: () => Boolean(props.source) && open() && !props.disabled,
  });
  const filtered = createMemo(() =>
    props.source
      ? remote.options()
      : props.fuzzy && query().trim()
        ? fuse()
            .search(query())
            .map((result) => result.item)
        : filterOptions(props.options, query()),
  );
  createEffect(() => {
    virtualizer.setOptions({
      count: filtered().length,
      getScrollElement: () => scrollElement ?? null,
      estimateSize: () => 46,
      overscan: 6,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      onChange: () => setScrollTop(scrollElement?.scrollTop ?? 0),
    });
    virtualizer._willUpdate();
    virtualizer.measure();
  });
  const virtualRows = createMemo(() => {
    scrollTop();
    viewportHeight();
    return virtualizer.getVirtualItems();
  });
  const enabled = createMemo(() => filtered().filter((option) => !option.disabled));
  const loading = () => props.loading || (Boolean(props.source) && remote.loading());
  const displayed = () => {
    if (props.multiple || open()) return query();
    return (
      [...props.options, ...remote.options()].find((option) => selected().has(option.value))?.label ?? ""
    );
  };
  const select = (option: ControlOption) => {
    if (props.disabled || props.readonly || option.disabled) return;
    if (props.multiple) {
      const next = new Set(selected());
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      props.onChange([...next]);
      input?.focus({ preventScroll: true });
    } else {
      props.onChange(option.value);
      setQuery("");
      setOpen(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (props.disabled || props.readonly) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const length = enabled().length;
      if (length) {
        const next = (active() + (event.key === "ArrowDown" ? 1 : -1) + length) % length;
        setActive(next);
        if (useVirtual()) virtualizer.scrollToIndex(next, { align: "auto" });
      }
    } else if (event.key === "Enter" && open()) {
      const option = enabled()[active()];
      if (option) {
        event.preventDefault();
        select(option);
      }
    } else if (event.key === "Escape" && open()) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  };
  onSettled(() => {
    const disposeVirtualizer = virtualizer._didMount();
    onCleanup(disposeVirtualizer);
    const dismiss = (event: PointerEvent) => {
      if (root && !event.composedPath().includes(root)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    const resize = new ResizeObserver(() => setViewportHeight(scrollElement?.clientHeight ?? 280));
    if (scrollElement) resize.observe(scrollElement);
    onCleanup(() => resize.disconnect());
    onCleanup(() => document.removeEventListener("pointerdown", dismiss, true));
  });
  return (
    <div ref={root} class={styles.root} data-disabled={String(!!props.disabled)}>
      <Show when={props.multiple && selected().size > 0}>
        <div class={styles.chips}>
          <For each={[...selected()]}>
            {(value) => {
              const option = props.options.find((item) => item.value === value);
              return (
                <span class={styles.chip}>
                  {option?.label ?? value}
                  <Show when={!props.disabled && !props.readonly}>
                    <button
                      type="button"
                      aria-label={`Remover ${option?.label ?? value}`}
                      onClick={() => option && select(option)}
                    >
                      ×
                    </button>
                  </Show>
                </span>
              );
            }}
          </For>
        </div>
      </Show>
      <div class={styles.inputRow}>
        <input
          ref={input}
          id={props.id}
          name={props.name}
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open()}
          aria-controls={listId()}
          aria-activedescendant={open() && enabled()[active()] ? `${props.id}-option-${active()}` : undefined}
          disabled={props.disabled}
          readOnly={!!props.readonly}
          placeholder={props.placeholder ?? "Pesquisar…"}
          autocomplete="off"
          value={displayed()}
          onFocus={() => {
            if (!props.disabled && !props.readonly) setOpen(true);
          }}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <Show when={props.clearable && selected().size > 0 && !props.disabled && !props.readonly}>
          <button
            type="button"
            aria-label="Limpar seleção"
            onClick={() => props.onChange(props.multiple ? [] : "")}
          >
            ×
          </button>
        </Show>
      </div>
      <Show when={open()}>
        <div
          ref={scrollElement}
          id={listId()}
          role="listbox"
          aria-multiselectable={!!props.multiple}
          class={styles.list}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <Show
            when={!loading()}
            fallback={
              <div class={styles.status} role="status">
                Carregando…
              </div>
            }
          >
            <Show
              when={!remote.error() || !props.source}
              fallback={
                <div class={styles.status} role="alert">
                  {props.errorMessage ?? "Não foi possível carregar sugestões."}{" "}
                  <button type="button" onClick={() => void remote.reload()}>
                    Tentar novamente
                  </button>
                </div>
              }
            >
              <Show
                when={filtered().length > 0}
                fallback={
                  <div class={styles.status}>{props.emptyMessage ?? "Nenhuma opção encontrada."}</div>
                }
              >
                <Show
                  when={useVirtual()}
                  fallback={
                    <For
                      each={props.grouped ? groupOptions(filtered()) : [{ label: "", options: filtered() }]}
                    >
                      {(group) => (
                        <>
                          <Show when={props.grouped}>
                            <div class={styles.group}>{group.label}</div>
                          </Show>
                          <For each={group.options}>
                            {(option) => {
                              const index = () =>
                                enabled().findIndex((entry) => entry.value === option.value);
                              return (
                                <button
                                  type="button"
                                  role="option"
                                  id={index() >= 0 ? `${props.id}-option-${index()}` : undefined}
                                  aria-selected={selected().has(option.value)}
                                  class={styles.option}
                                  data-active={index() === active()}
                                  disabled={option.disabled}
                                  onMouseEnter={() => {
                                    if (index() >= 0) setActive(index());
                                  }}
                                  onClick={() => select(option)}
                                >
                                  <span>{option.label}</span>
                                  <Show when={option.description}>
                                    <small>{option.description}</small>
                                  </Show>
                                </button>
                              );
                            }}
                          </For>
                        </>
                      )}
                    </For>
                  }
                >
                  <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
                    <For each={virtualRows()}>
                      {(row) => {
                        const option = () => filtered()[row.index];
                        return (
                          <button
                            type="button"
                            role="option"
                            ref={(element) => virtualizer.measureElement(element)}
                            data-index={row.index}
                            id={`${props.id}-option-${row.index}`}
                            class={styles.option}
                            style={{
                              position: "absolute",
                              top: "0",
                              left: "0",
                              transform: `translateY(${row.start}px)`,
                            }}
                            data-active={row.index === active()}
                            aria-selected={selected().has(option().value)}
                            disabled={option().disabled}
                            onMouseEnter={() => setActive(row.index)}
                            onClick={() => select(option())}
                          >
                            <span>{option().label}</span>
                            <Show when={option().description}>
                              <small>{option().description}</small>
                            </Show>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
