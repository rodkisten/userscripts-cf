import { Show, onSettled, type Element } from "solid-js";
import styles, { css } from "./Dialog.module.css";
export function Dialog(props: { title: string; close: () => void; children?: Element }) {
  let dialog!: HTMLElement;
  onSettled(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.focus();
    return () => previous?.isConnected && previous.focus();
  });
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex="0"]',
      ),
    ];
    if (!items.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const current = (dialog.getRootNode() as Document | ShadowRoot).activeElement;
    if (event.shiftKey && current === items[0]) {
      event.preventDefault();
      items.at(-1)!.focus();
    } else if (!event.shiftKey && current === items.at(-1)) {
      event.preventDefault();
      items[0].focus();
    }
  };
  return (
    <>
      <style>{css}</style>
      <div class={styles.backdrop} onClick={props.close}>
        <section
          ref={dialog}
          class={styles.sheet}
          role="dialog"
          aria-label={props.title}
          aria-modal="true"
          tabindex="-1"
          onKeyDown={key}
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <h2>{props.title}</h2>
            <button type="button" aria-label="Fechar" onClick={props.close}>
              ×
            </button>
          </header>
          {props.children}
        </section>
      </div>
    </>
  );
}
