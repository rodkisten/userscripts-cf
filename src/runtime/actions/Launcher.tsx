import { createSignal, onCleanup } from "solid-js";
import styles, { css } from "./Launcher.module.css";
export function ActionsLauncher(props: {
  open: () => void;
  subscribe: (listener: () => void) => () => void;
  count: () => number;
}) {
  const [count, setCount] = createSignal(props.count());
  onCleanup(props.subscribe(() => setCount(props.count())));
  return (
    <>
      <style>{css}</style>
      <button
        type="button"
        class={styles.launcher}
        hidden={!count()}
        title="Rod Actions"
        aria-label="Abrir Rod Actions"
        onClick={props.open}
      >
        ⚙
      </button>
    </>
  );
}
