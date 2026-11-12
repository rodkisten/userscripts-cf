import { For, Show, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { menuActions, menuState, type MenuEntry } from "./menu-store";
import styles from "./MenuRoot.module.css";

function MenuDialog(props: { menu: MenuEntry }) {
  let dialog!: HTMLElement;
  let previousFocus: Element | null = null;
  onMount(() => {
    previousFocus = document.activeElement;
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
    const elements = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
    if (!elements.length) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
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
          <button type="button" aria-label="Fechar" onClick={() => menuActions.close(props.menu.id)}>×</button>
        </header>
        <Show when={props.menu.content}><div class={styles.content}>{props.menu.content}</div></Show>
        <footer class={styles.actions}>
          <For each={props.menu.actions ?? []}>
            {(action) => (
              <button type="button" onClick={() => void menuActions.invoke(props.menu.id, action)}>
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
export function mountMenuRoot(target: HTMLElement = document.body) {
  if (!disposeRoot) {
    const root = document.createElement("div");
    root.dataset.rodSolidMenu = "";
    target.append(root);
    const dispose = render(() => <MenuRoot />, root);
    disposeRoot = () => { dispose(); root.remove(); disposeRoot = undefined; };
  }
  return () => disposeRoot?.();
}
