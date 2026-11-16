import { For, Show } from 'solid-js';
import { Portal } from '@solidjs/web';
import {
  dismissAllToasts,
  useToasterState,
} from './toasterStore';
import { SvgIcon } from './SvgIcon';
import { ToastItem } from './ToastItem';
import styles from './Toaster.module.css';

export function ToasterHost(props: { api?: any }) {
  const {
    config,
    resolvedTheme,
    toasts,
    stackExpanded,
    setStackExpanded,
    managerMinimized,
    setManagerMinimized,
  } = useToasterState();

  const interactionToasts = () =>
    toasts().filter((t) => t.record.options.lane === 'interaction');

  const stackToasts = () =>
    toasts().filter((t) => t.record.options.lane !== 'interaction');

  const activeLoadingCount = () =>
    stackToasts().filter(
      (t) => t.record.options.loading && t.record.options.loadingState === 'loading',
    ).length;

  return (
    <Portal>
      <div class={styles.host}>
        <div
          class={styles.stack}
          data-position={config().position}
          data-theme={resolvedTheme()}
          data-size={config().size}
          data-has-interaction={String(interactionToasts().length > 0)}
        >
          <Show when={interactionToasts().length > 0}>
            <div class={styles.interactions}>
              <ToastItem
                entry={interactionToasts()[0]}
                stackIndex={0}
                isCollapsedStack={false}
                api={props.api}
              />
            </div>
          </Show>

          <Show when={managerMinimized() && stackToasts().length > 0}>
            <button
              type="button"
              class={styles.manager}
              title="Restore active tasks"
              onClick={() => setManagerMinimized(false)}
            >
              <SvgIcon name="loader-circle" size={19} />
              <span class={styles.managerCount}>
                {activeLoadingCount() || stackToasts().length}
              </span>
            </button>
          </Show>

          <Show when={!managerMinimized() && config().stackToolbar && stackToasts().length > 1}>
            <div class={styles.toolbar}>
              <span class={styles.toolbarLabel}>{stackToasts().length} toasts</span>
              <div class={styles.toolbarActions}>
                <button
                  type="button"
                  class={styles.toolbarButton}
                  onClick={() => setManagerMinimized(true)}
                >
                  <SvgIcon name="chevron-down" size={14} />
                  <span>Minimize</span>
                </button>
                <button
                  type="button"
                  class={styles.toolbarButton}
                  onClick={() => setStackExpanded(!stackExpanded())}
                >
                  <SvgIcon name="chevrons-up" size={14} />
                  <span>{stackExpanded() ? 'Collapse' : 'Expand'}</span>
                </button>
                <button
                  type="button"
                  class={styles.toolbarButton}
                  onClick={() => dismissAllToasts(false)}
                >
                  <SvgIcon name="x-circle" size={14} />
                  <span>Close all</span>
                </button>
              </div>
            </div>
          </Show>

          <Show when={!managerMinimized() && stackToasts().length > 0}>
            <div class={styles.list} data-expanded={String(stackExpanded())}>
              <For each={stackToasts()}>
                {(entry, idx) => (
                  <ToastItem
                    entry={entry}
                    stackIndex={idx()}
                    isCollapsedStack={!stackExpanded() && config().stacked}
                    api={props.api}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
