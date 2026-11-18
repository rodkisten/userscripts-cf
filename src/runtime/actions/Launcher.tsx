import { useSyncExternalStore } from "react";
import styles, { css } from "./Launcher.module.css";
export function ActionsLauncher(props: {
  open: () => void;
  subscribe: (listener: () => void) => () => void;
  count: () => number;
}) {
  const count = useSyncExternalStore(props.subscribe, props.count, props.count);
  return (
    <>
      <style>{css}</style>
      <button
        type="button"
        className={styles.launcher}
        hidden={!count}
        title="Rod Actions"
        aria-label="Abrir Rod Actions"
        onClick={props.open}
      >
        ⚙
      </button>
    </>
  );
}
