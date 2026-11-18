import styles from "./Settings.module.css";
export type BookmarkState = "unsaved" | "saved" | "loading" | "error";
export function ReelBookmarkButton({ state, onActivate, disabled: unavailable }: {
  state: BookmarkState;
  onActivate?: () => void;
  disabled?: boolean;
}) {
  const disabled = Boolean(unavailable) || state === "loading";
  const label = {
    unsaved: "Enviar para coleções",
    saved: "Reel salvo",
    loading: "Salvando Reel",
    error: "Falha ao salvar. Tentar novamente",
  }[state];
  return (
    <button type="button" className={styles.bookmark} data-bookmark-state={state}
      aria-label={label} title={label} aria-busy={state === "loading"} disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onActivate?.();
      }}>
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"
        fill={state === "saved" ? "currentColor" : "none"} stroke="currentColor"
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <path d="M6 4h12v17l-6-4-6 4V4Z" />
      </svg>
      {state === "loading" && <span className={styles.bookmarkSpinner} aria-hidden="true" />}
      {state === "error" && <span className={styles.bookmarkError} aria-hidden="true">!</span>}
    </button>
  );
}
