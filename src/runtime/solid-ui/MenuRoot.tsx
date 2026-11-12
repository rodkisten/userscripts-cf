import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { menuActions, menuState } from "./menu-store";
import styles from "./MenuRoot.module.css";

export function MenuRoot() {
  return (
    <For each={menuState.stack}>
      {(menu) => (
        <div class={styles.backdrop} onClick={() => menuActions.close(menu.id)}>
          <section class={styles.sheet} role="dialog" aria-modal="true" aria-label={menu.title}
            onClick={(event) => event.stopPropagation()}>
            <header class={styles.header}>
              <h2>{menu.title}</h2>
              <button type="button" aria-label="Fechar" onClick={() => menuActions.close(menu.id)}>×</button>
            </header>
            <Show when={menu.content}><div class={styles.content}>{menu.content}</div></Show>
            <footer class={styles.actions}>
              <For each={menu.actions ?? []}>
                {(action) => <button type="button" onClick={() => void action.run?.()}>{action.label}</button>}
              </For>
            </footer>
          </section>
        </div>
      )}
    </For>
  );
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
