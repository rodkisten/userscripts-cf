import { createSignal, For, Match, Show, Switch } from 'solid-js';
import styles from './Toaster.module.css';

export function ObjectInspectorView(props: { value: unknown; depth?: number; maxDepth?: number }) {
  const depth = () => props.depth ?? 0;
  const maxDepth = () => props.maxDepth ?? 6;
  const [open, setOpen] = createSignal(depth() < 1);

  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object';

  const entries = () => {
    if (!isObj(props.value)) return [];
    return Object.entries(props.value).slice(0, 100);
  };

  return (
    <Switch
      fallback={
        <span class={styles.tokenNull}>{String(props.value)}</span>
      }
    >
      <Match when={props.value === null}>
        <span class={styles.tokenNull}>null</span>
      </Match>
      <Match when={props.value === undefined}>
        <span class={styles.tokenNull}>undefined</span>
      </Match>
      <Match when={typeof props.value === 'string'}>
        <span class={styles.tokenString}>"{String(props.value)}"</span>
      </Match>
      <Match when={typeof props.value === 'number' || typeof props.value === 'bigint'}>
        <span class={styles.tokenNumber}>{String(props.value)}</span>
      </Match>
      <Match when={typeof props.value === 'boolean'}>
        <span class={styles.tokenBoolean}>{String(props.value)}</span>
      </Match>
      <Match when={isObj(props.value)}>
        <div class={styles.inspectorTree}>
          <button
            type="button"
            class={styles.inspectorToggle}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open());
            }}
          >
            {open() ? '▾' : '▸'}{' '}
            {Array.isArray(props.value)
              ? `Array(${props.value.length})`
              : `${(props.value as object).constructor?.name ?? 'Object'} {${entries().length}}`}
          </button>
          <Show when={open() && depth() < maxDepth()}>
            <For each={entries()}>
              {([k, v]) => (
                <div class={styles.inspectorRow} style={{ '--depth': depth() + 1 }}>
                  <span class={styles.tokenKey}>{k}:</span>
                  <ObjectInspectorView value={v} depth={depth() + 1} maxDepth={maxDepth()} />
                </div>
              )}
            </For>
          </Show>
        </div>
      </Match>
    </Switch>
  );
}
