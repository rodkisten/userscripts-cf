import { createSignal, For, Show } from "solid-js";
import type {
  PickerItemDescriptor,
  PickerNormalizedDescriptor,
  PickerOptions,
  PickerSelectionValue,
  PickerSource,
} from "./types";
import { showActionDialog } from "./ActionDialogView";
import { SvgIcon } from "./SvgIcon";
import styles from "./Toaster.module.css";

function normalizeItems<T extends PickerSource>(
  sources: readonly T[],
  options: PickerOptions<T>,
): PickerNormalizedDescriptor<T>[] {
  return sources.map((raw, index) => {
    if (typeof raw === "string" || raw instanceof URL) {
      const src = String(raw);
      const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
      return {
        id: `item-${index}`,
        index,
        type: isVideo ? "video" : (options.defaultMediaType ?? "image"),
        src,
        poster: null,
        label: src.split("/").pop()?.split("?")[0] ?? `Item ${index + 1}`,
        alt: `Item ${index + 1}`,
        disabled: false,
        original: raw,
      };
    }
    if (raw instanceof Blob) {
      const src = URL.createObjectURL(raw);
      const isVideo = raw.type.startsWith("video/");
      return {
        id: `blob-${index}`,
        index,
        type: isVideo ? "video" : "image",
        src,
        poster: null,
        label: raw instanceof File ? raw.name : `File ${index + 1}`,
        alt: `File ${index + 1}`,
        disabled: false,
        original: raw,
      };
    }
    const desc = raw as PickerItemDescriptor;
    const src = String(desc.src ?? desc.url ?? "");
    const isVideo = desc.isVideo || desc.type === "video" || desc.mediaType === "video";
    return {
      id: String(desc.id ?? `item-${index}`),
      index,
      type: isVideo ? "video" : "image",
      src,
      poster: desc.poster ? String(desc.poster) : desc.thumbnail ? String(desc.thumbnail) : null,
      label: String(desc.label ?? desc.title ?? `Item ${index + 1}`),
      alt: String(desc.alt ?? desc.label ?? `Item ${index + 1}`),
      disabled: Boolean(desc.disabled),
      original: raw,
    };
  });
}

export function showPickerToast<T extends PickerSource = PickerSource>(
  descriptor: PickerOptions<T> = {},
): Promise<PickerSelectionValue<T> | null> {
  const rawList = descriptor.items ?? descriptor.media ?? descriptor.sources ?? [];
  const items = normalizeItems(rawList, descriptor);
  const multiple = descriptor.multiple !== false;
  const minSelected = descriptor.minSelected ?? (descriptor.required === false ? 0 : 1);
  const maxSelected = multiple ? (descriptor.maxSelected ?? Infinity) : 1;

  const initialIds = new Set<string>();
  if (descriptor.defaultAllSelected && multiple) {
    items.forEach((it) => !it.disabled && initialIds.add(it.id));
  }
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(initialIds);

  const toggleItem = (item: PickerNormalizedDescriptor<T>) => {
    if (item.disabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        if (!multiple) next.clear();
        if (next.size < maxSelected) next.add(item.id);
      }
      return next;
    });
  };

  const resolveOutput = (): PickerSelectionValue<T> => {
    const picked = items.filter((it) => selectedIds().has(it.id));
    switch (descriptor.returnType) {
      case "ids":
        return picked.map((it) => it.id);
      case "indexes":
        return picked.map((it) => it.index);
      case "descriptors":
        return picked;
      default:
        return picked.map((it) => it.original);
    }
  };

  return showActionDialog(descriptor, {
    kind: "picker",
    dismissValue: null,
    fallbackActions: [
      {
        id: "cancel",
        label: descriptor.cancelLabel ?? "Cancel",
        icon: "circle-x",
        variant: "secondary",
        value: null,
      },
      { id: "confirm", label: descriptor.confirmLabel ?? "Use selected", icon: "check", variant: "primary" },
    ],
    renderBody: () => (
      <div class={styles.pickerRoot}>
        <div class={styles.pickerToolbar}>
          <span>
            {selectedIds().size} / {items.length} selected
          </span>
          <Show when={descriptor.showSelectionTools !== false && multiple && items.length > 0}>
            <div class={styles.toolbarActions}>
              <button
                type="button"
                class={styles.toolbarButton}
                onClick={() => {
                  const next = new Set<string>();
                  for (const it of items) {
                    if (!it.disabled && next.size < maxSelected) next.add(it.id);
                  }
                  setSelectedIds(next);
                }}
              >
                {descriptor.selectAllLabel ?? "Select all"}
              </button>
              <button
                type="button"
                class={styles.toolbarButton}
                onClick={() => setSelectedIds(new Set<string>())}
              >
                {descriptor.clearAllLabel ?? "Clear"}
              </button>
            </div>
          </Show>
        </div>

        <Show
          when={items.length > 0}
          fallback={
            <div class={styles.description}>{descriptor.emptyMessage ?? "No media items available."}</div>
          }
        >
          <div
            class={styles.pickerGrid}
            style={{
              "--rod-picker-aspect": descriptor.aspectRatio ?? "1 / 1",
              "--rod-picker-gap": `${descriptor.gap ?? 8}px`,
              "--rod-picker-item-min": `${descriptor.itemMinWidth ?? 120}px`,
              "grid-template-columns": descriptor.columns
                ? `repeat(${descriptor.columns}, minmax(0, 1fr))`
                : undefined,
            }}
          >
            <For each={items}>
              {(item) => {
                const isSelected = () => selectedIds().has(item.id);
                return (
                  <button
                    type="button"
                    class={styles.pickerItem}
                    data-selected={String(isSelected())}
                    disabled={item.disabled}
                    onClick={() => toggleItem(item)}
                  >
                    <Show
                      when={item.type === "video"}
                      fallback={
                        <img class={styles.pickerMedia} src={item.src} alt={item.alt} loading="lazy" />
                      }
                    >
                      <video
                        class={styles.pickerMedia}
                        src={item.src}
                        poster={item.poster ?? undefined}
                        muted
                        playsinline
                      />
                    </Show>
                    <span class={styles.pickerCheck}>
                      <Show when={isSelected()}>
                        <SvgIcon name="check" size={13} />
                      </Show>
                    </span>
                    <span class={styles.pickerIndex}>#{item.index + 1}</span>
                    <Show when={descriptor.showLabels !== false}>
                      <span class={styles.pickerLabel}>{item.label}</span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    ),
    getValue: () => resolveOutput(),
    validate: () => {
      if (selectedIds().size < minSelected) {
        return descriptor.requiredMessage ?? `Select at least ${minSelected} item(s).`;
      }
      return true;
    },
  }) as Promise<PickerSelectionValue<T> | null>;
}
