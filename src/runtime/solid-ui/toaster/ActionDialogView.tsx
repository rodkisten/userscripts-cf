import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { SelectOptions, SvgIconName, ToastActionDescriptor, ToastOptions } from "./types";
import { createToast } from "./toasterStore";
import { SvgIcon } from "./SvgIcon";
import styles from "./Toaster.module.css";

interface DialogSettings {
  kind: "confirm" | "prompt" | "select" | "picker";
  dismissValue?: unknown;
  fallbackActions: ToastActionDescriptor[];
  renderBody?: () => JSX.Element;
  getValue?: () => unknown;
  validate?: (value: unknown) => Promise<boolean | string> | boolean | string;
}

export function showActionDialog(
  descriptor: ToastOptions | string,
  settings: DialogSettings,
): Promise<unknown> {
  const opts: ToastOptions = typeof descriptor === "string" ? { title: descriptor } : { ...descriptor };
  const actions = opts.actions?.length ? opts.actions : settings.fallbackActions;
  const dismissVal = opts.dismissValue !== undefined ? opts.dismissValue : (settings.dismissValue ?? false);

  return new Promise((resolve) => {
    let settled = false;
    const [validationError, setValidationError] = createSignal<string | null>(null);
    const [checkedMap, setCheckedMap] = createSignal<Record<string, boolean>>({});

    const checkboxes = Array.isArray(opts.checkbox) ? opts.checkbox : opts.checkbox ? [opts.checkbox] : [];

    const finish = (val: unknown, reason: string) => {
      if (settled) return;
      settled = true;
      ctrl.dismiss(reason);
      resolve(val);
    };

    const ctrl = createToast(
      [],
      {
        ...opts,
        lane: "interaction",
        duration: opts.duration ?? 0,
        dedupe: false,
        role: "alertdialog",
        onDismiss: ({ reason }) => finish(dismissVal, reason),
      },
      () => (
        <div class={styles.interactiveRoot}>
          <Show when={opts.title}>
            <div class={styles.title}>{opts.title}</div>
          </Show>
          <Show when={opts.description}>
            <div class={styles.description}>{opts.description}</div>
          </Show>

          {settings.renderBody?.()}

          <Show when={checkboxes.length > 0}>
            <div class={styles.checkboxList}>
              <For each={checkboxes}>
                {(cb) => (
                  <label class={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      checked={checkedMap()[cb.id] ?? Boolean(cb.checked)}
                      disabled={cb.disabled}
                      onChange={(e) =>
                        setCheckedMap((prev) => ({ ...prev, [cb.id]: e.currentTarget.checked }))
                      }
                    />
                    <span>{cb.label}</span>
                  </label>
                )}
              </For>
            </div>
          </Show>

          <Show when={validationError()}>
            <div class={styles.validation}>{validationError()}</div>
          </Show>

          <div class={styles.confirmActions}>
            <For each={actions}>
              {(act) => (
                <button
                  type="button"
                  class={styles.actionButton}
                  data-variant={act.variant ?? "secondary"}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const isCancel = act.id === "cancel";
                    const currentValue = settings.getValue ? settings.getValue() : true;
                    if (!isCancel && settings.validate) {
                      const valid = await settings.validate(currentValue);
                      if (valid !== true) {
                        setValidationError(
                          typeof valid === "string" ? valid : (opts.validationMessage ?? "Invalid input"),
                        );
                        return;
                      }
                    }
                    setValidationError(null);
                    const finalVal =
                      act.value !== undefined ? act.value : isCancel ? dismissVal : currentValue;
                    finish(finalVal, act.id ?? "action");
                  }}
                >
                  <Show when={typeof act.icon === "string"}>
                    <SvgIcon name={act.icon as SvgIconName} size={14} />
                  </Show>
                  <span>{act.label}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      ),
    );
  });
}

export function showConfirmToast(descriptor: ToastOptions | string = {}): Promise<unknown> {
  return showActionDialog(descriptor, {
    kind: "confirm",
    dismissValue: false,
    fallbackActions: [
      { id: "cancel", label: "Cancel", icon: "circle-x", variant: "secondary", value: false },
      { id: "confirm", label: "Confirm", icon: "check", variant: "primary", value: true },
    ],
  });
}

export function showPromptToast(descriptor: ToastOptions | string = {}): Promise<unknown> {
  const opts: ToastOptions = typeof descriptor === "string" ? { title: descriptor } : { ...descriptor };
  const [text, setText] = createSignal(opts.value == null ? "" : String(opts.value));

  return showActionDialog(opts, {
    kind: "prompt",
    dismissValue: null,
    fallbackActions: [
      {
        id: "cancel",
        label: opts.cancelLabel ?? "Cancel",
        icon: "circle-x",
        variant: "secondary",
        value: null,
      },
      { id: "confirm", label: opts.confirmLabel ?? "Save", icon: "check", variant: "primary" },
    ],
    renderBody: () => (
      <label class={styles.fieldLabel}>
        <Show when={opts.inputLabel}>
          <span>{opts.inputLabel}</span>
        </Show>
        <Show
          when={opts.multiline}
          fallback={
            <input
              type={opts.inputType ?? "text"}
              class={styles.input}
              value={text()}
              placeholder={opts.placeholder ?? ""}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          }
        >
          <textarea
            class={styles.textarea}
            value={text()}
            placeholder={opts.placeholder ?? ""}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </Show>
      </label>
    ),
    getValue: () => text(),
    validate: async (val) => {
      const str = String(val ?? "");
      if (opts.required && !str.trim()) return opts.requiredMessage ?? "A value is required.";
      if (opts.validate) return opts.validate(str);
      return true;
    },
  });
}

export function showSelectToast<T = unknown>(descriptor: SelectOptions<T> = {}): Promise<T | T[] | null> {
  const choices = (descriptor.options ?? []).map((item, idx) => {
    const isObj = item !== null && typeof item === "object" && "value" in item;
    return {
      token: `opt-${idx}`,
      label: isObj ? String((item as any).label) : String(item),
      value: (isObj ? (item as any).value : item) as T,
      disabled: isObj ? Boolean((item as any).disabled) : false,
    };
  });

  const [selectedTokens, setSelectedTokens] = createSignal<string[]>(
    choices.length ? [choices[0].token] : [],
  );

  return showActionDialog(descriptor as ToastOptions, {
    kind: "select",
    dismissValue: null,
    fallbackActions: [
      {
        id: "cancel",
        label: descriptor.cancelLabel ?? "Cancel",
        icon: "circle-x",
        variant: "secondary",
        value: null,
      },
      { id: "confirm", label: descriptor.confirmLabel ?? "Select", icon: "check", variant: "primary" },
    ],
    renderBody: () => (
      <label class={styles.fieldLabel}>
        <Show when={descriptor.inputLabel}>
          <span>{descriptor.inputLabel}</span>
        </Show>
        <select
          class={styles.select}
          multiple={Boolean(descriptor.multiple)}
          onChange={(e) => {
            const vals = Array.from(e.currentTarget.selectedOptions, (o) => o.value);
            setSelectedTokens(vals);
          }}
        >
          <For each={choices}>
            {(c) => (
              <option value={c.token} disabled={c.disabled} selected={selectedTokens().includes(c.token)}>
                {c.label}
              </option>
            )}
          </For>
        </select>
      </label>
    ),
    getValue: () => {
      const mapped = choices.filter((c) => selectedTokens().includes(c.token)).map((c) => c.value);
      return descriptor.multiple ? mapped : (mapped[0] ?? null);
    },
  }) as Promise<T | T[] | null>;
}
