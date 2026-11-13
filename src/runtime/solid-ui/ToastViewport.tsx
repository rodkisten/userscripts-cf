import { For, Show } from "solid-js";
import { mountSolidShadow } from "./shadow-mount";
import { toastActions, toastState } from "./toast-store";
import styles, { css } from "./ToastViewport.module.css";

export function ToastViewport() {
  return (
    <div class={styles.viewport} aria-label="Notificações">
      <For each={toastState.items}>
        {(item) => (
          <section
            class={styles.toast}
            data-kind={item.kind}
            role={item.kind === "error" ? "alert" : "status"}
          >
            <div class={styles.message}>
              <span>{item.message}</span>
              <Show when={item.progress !== undefined}>
                <progress max="100" value={item.progress} aria-label="Progresso" />
              </Show>
              <Show when={item.detail !== undefined}>
                <details>
                  <summary>Detalhes</summary>
                  <pre>
                    {typeof item.detail === "string" ? item.detail : JSON.stringify(item.detail, null, 2)}
                  </pre>
                </details>
              </Show>
            </div>
            <button
              class={styles.dismiss}
              type="button"
              aria-label="Dispensar"
              onClick={() => toastActions.dismiss(item.id)}
            >
              ×
            </button>
          </section>
        )}
      </For>
    </div>
  );
}

let disposeRoot: (() => void) | undefined;
export function mountToastViewport(target?: HTMLElement | ShadowRoot) {
  if (!disposeRoot) {
    const dispose = mountSolidShadow(() => <ToastViewport />, {
      target,
      styles: [css],
      id: "toasts",
    });
    disposeRoot = () => {
      dispose();
      disposeRoot = undefined;
    };
  }
  return () => disposeRoot?.();
}
