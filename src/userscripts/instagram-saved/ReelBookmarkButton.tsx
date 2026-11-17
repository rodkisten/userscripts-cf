import { Show } from "solid-js";
import styles from "./Settings.module.css";
export type BookmarkState = "unsaved" | "saved" | "loading" | "error";
export function ReelBookmarkButton(props: {
  state: BookmarkState;
  onActivate?: () => void;
  disabled?: boolean;
}) {
  const disabled = () => !!props.disabled || props.state === "loading";
  const label = () =>
    ({
      unsaved: "Enviar para coleções",
      saved: "Reel salvo",
      loading: "Salvando Reel",
      error: "Falha ao salvar. Tentar novamente",
    })[props.state];
  return (
    <button
      type="button"
      class={styles.bookmark}
      data-bookmark-state={props.state}
      aria-label={label()}
      title={label()}
      aria-busy={props.state === "loading"}
      disabled={disabled()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled()) props.onActivate?.();
      }}
    >
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill={props.state === "saved" ? "currentColor" : "none"}
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      >
        <path d="M6 4h12v17l-6-4-6 4V4Z" />
      </svg>
      <Show when={props.state === "loading"}>
        <span class={styles.bookmarkSpinner} aria-hidden="true" />
      </Show>
      <Show when={props.state === "error"}>
        <span class={styles.bookmarkError} aria-hidden="true">
          !
        </span>
      </Show>
    </button>
  );
}
