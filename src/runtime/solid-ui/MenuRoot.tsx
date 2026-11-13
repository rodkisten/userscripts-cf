import { For, Show, onCleanup, onMount } from "solid-js";
import { mountSolidShadow } from "./shadow-mount";
import { menuActions, menuState, type MenuEntry, type MenuField, type MenuValue } from "./menu-store";
import styles, { css } from "./MenuRoot.module.css";

function Field(props: { menuId: string; field: MenuField }) {
  const value = () => menuState.values[props.menuId]?.[props.field.name];
  const change = (next: MenuValue) => menuActions.setValue(props.menuId, props.field.name, next);
  const field = props.field;
  const type = field.type;
  const inputType = [
    "email",
    "password",
    "url",
    "search",
    "tel",
    "number",
    "date",
    "time",
    "color",
    "range",
    "hidden",
  ].includes(type)
    ? type
    : "text";
  return (
    <div class={styles.field}>
      <Show when={type !== "hidden" && type !== "checkbox" && type !== "switch"}>
        <label for={props.menuId + "-" + field.name}>{field.label ?? field.name}</label>
      </Show>
      <Show
        when={type === "textarea"}
        fallback={
          <Show
            when={type === "select" || type === "multiselect" || type === "radio"}
            fallback={
              <Show
                when={type === "checkbox" || type === "switch"}
                fallback={
                  <input
                    id={props.menuId + "-" + field.name}
                    type={inputType}
                    disabled={field.disabled}
                    placeholder={field.placeholder}
                    required={field.required}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={String(value() ?? "")}
                    onInput={(event) =>
                      change(
                        type === "number" || type === "range"
                          ? event.currentTarget.valueAsNumber
                          : event.currentTarget.value,
                      )
                    }
                  />
                }
              >
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(value())}
                    disabled={field.disabled}
                    onChange={(event) => change(event.currentTarget.checked)}
                  />
                  {field.label ?? field.name}
                </label>
              </Show>
            }
          >
            <Show
              when={type === "radio"}
              fallback={
                <select
                  id={props.menuId + "-" + field.name}
                  disabled={field.disabled}
                  multiple={type === "multiselect"}
                  value={String(value() ?? "")}
                  onChange={(event) =>
                    change(
                      type === "multiselect"
                        ? [...event.currentTarget.selectedOptions].map((option) => option.value)
                        : event.currentTarget.value,
                    )
                  }
                >
                  <For each={field.options ?? []}>
                    {(option) => (
                      <option value={option.value} disabled={option.disabled}>
                        {option.label}
                      </option>
                    )}
                  </For>
                </select>
              }
            >
              <For each={field.options ?? []}>
                {(option) => (
                  <label>
                    <input
                      type="radio"
                      name={props.menuId + "-" + field.name}
                      value={option.value}
                      checked={value() === option.value}
                      disabled={option.disabled}
                      onChange={() => change(option.value)}
                    />
                    {option.label}
                  </label>
                )}
              </For>
            </Show>
          </Show>
        }
      >
        <textarea
          id={props.menuId + "-" + field.name}
          value={String(value() ?? "")}
          placeholder={field.placeholder}
          disabled={field.disabled}
          onInput={(event) => change(event.currentTarget.value)}
        />
      </Show>
      <Show when={menuState.errors[props.menuId]?.[field.name]}>
        <span class={styles.error} role="alert">
          {menuState.errors[props.menuId][field.name]}
        </span>
      </Show>
    </div>
  );
}
function MenuDialog(props: { menu: MenuEntry }) {
  let dialog!: HTMLElement;
  let previousFocus: Element | null = null;
  onMount(() => {
    previousFocus =
      dialog.getRootNode() instanceof ShadowRoot
        ? (dialog.getRootNode() as ShadowRoot).activeElement
        : document.activeElement;
    dialog.focus();
    onCleanup(() => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    });
  });
  const dismiss = () => {
    if (props.menu.dismissible !== false) menuActions.close(props.menu.id, "dismiss");
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
    }
    if (event.key !== "Tab") return;
    const elements = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (!elements.length) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && (dialog.getRootNode() as Document | ShadowRoot).activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (dialog.getRootNode() as Document | ShadowRoot).activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div class={styles.backdrop} onClick={dismiss}>
      <section
        ref={dialog}
        class={styles.sheet}
        data-presentation={props.menu.presentation ?? "bottom-sheet"}
        role="dialog"
        aria-modal="true"
        aria-label={props.menu.title}
        tabindex="-1"
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <header class={styles.header}>
          <h2>{props.menu.title}</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={dismiss}
            disabled={props.menu.dismissible === false}
          >
            ×
          </button>
        </header>
        <Show when={props.menu.content}>
          <div class={styles.content}>{props.menu.content}</div>
        </Show>
        <For each={props.menu.fields ?? []}>{(field) => <Field menuId={props.menu.id} field={field} />}</For>
        <Show when={menuState.errors[props.menu.id]?._form}>
          <p class={styles.error} role="alert">
            {menuState.errors[props.menu.id]._form}
          </p>
        </Show>
        <footer class={styles.actions}>
          <For each={props.menu.actions ?? []}>
            {(action) => (
              <button
                type="button"
                disabled={menuState.busy[props.menu.id]}
                onClick={() => void menuActions.invoke(props.menu.id, action)}
              >
                {action.label}
              </button>
            )}
          </For>
        </footer>
      </section>
    </div>
  );
}
export function MenuRoot() {
  return <For each={menuState.stack}>{(menu) => <MenuDialog menu={menu} />}</For>;
}
let disposeRoot: (() => void) | undefined;
export function mountMenuRoot(target?: HTMLElement | ShadowRoot) {
  if (!disposeRoot) {
    const dispose = mountSolidShadow(() => <MenuRoot />, {
      target,
      styles: [css],
      id: "menu",
    });
    disposeRoot = () => {
      dispose();
      disposeRoot = undefined;
    };
  }
  return () => disposeRoot?.();
}
