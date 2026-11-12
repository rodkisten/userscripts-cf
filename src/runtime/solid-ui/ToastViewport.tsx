import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { toastActions, toastState } from "./toast-store";
import styles from "./ToastViewport.module.css";

export function ToastViewport() {
  return (
    <div class={styles.viewport} aria-label="Notificações">
      <For each={toastState.items}>
        {(item) => (
          <section class={styles.toast} data-kind={item.kind} role={item.kind === "error" ? "alert" : "status"}>
            <div class={styles.message}><span>{item.message}</span><Show when={item.progress !== undefined}><progress max="100" value={item.progress} aria-label="Progresso" /></Show><Show when={item.detail !== undefined}><details><summary>Detalhes</summary><pre>{typeof item.detail === "string" ? item.detail : JSON.stringify(item.detail, null, 2)}</pre></details></Show></div>
            <button class={styles.dismiss} type="button" aria-label="Dispensar" onClick={() => toastActions.dismiss(item.id)}>×</button>
          </section>
        )}
      </For>
    </div>
  );
}

let disposeRoot: (() => void) | undefined;
export function mountToastViewport(target: HTMLElement = document.body) {
  if (!disposeRoot) {
    const root = document.createElement("div");
    root.dataset.rodSolidToasts = "";
    target.append(root);
    const dispose = render(() => <ToastViewport />, root);
    disposeRoot = () => { dispose(); root.remove(); disposeRoot = undefined; };
  }
  return () => disposeRoot?.();
}
