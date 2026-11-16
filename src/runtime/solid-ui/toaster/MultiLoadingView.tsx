import { createSignal, For, Show } from 'solid-js';
import type {
  MultiLoadingController,
  MultiLoadingDescriptor,
  MultiLoadingItemDescriptor,
  MultiLoadingItemStatus,
} from './types';
import { createToast } from './toasterStore';
import { SvgIcon } from './SvgIcon';
import styles from './Toaster.module.css';

interface InternalMultiItem {
  id: string;
  title: string;
  description: string;
  status: MultiLoadingItemStatus;
  progress: number | null;
  progressLabel: string | null;
  run?: MultiLoadingItemDescriptor['run'];
  abortController: AbortController;
}

export function showMultiLoadingToast(descriptor: MultiLoadingDescriptor = {}): MultiLoadingController {
  const [items, setItems] = createSignal<InternalMultiItem[]>([]);
  let seq = 0;

  const toastCtrl = createToast(
    [],
    {
      ...descriptor,
      lane: 'task',
      duration: 0,
      dedupe: false,
      closeButton: false,
      icon: false,
    },
    () => {
      const completedCount = () => items().filter((i) => i.status === 'success').length;
      const totalCount = () => items().length;
      const aggregatePct = () => {
        const list = items();
        if (!list.length) return 0;
        const sum = list.reduce(
          (acc, it) => acc + (it.status === 'success' ? 1 : it.progress ?? 0),
          0,
        );
        return Math.round((sum / list.length) * 100);
      };

      return (
        <div class={styles.multiRoot}>
          <div class={styles.multiHeader}>
            <div>
              <div class={styles.multiTitle}>{descriptor.title ?? 'Processing items'}</div>
              <Show when={descriptor.showSummary !== false}>
                <div class={styles.multiSummary}>
                  {aggregatePct()}% · {completedCount()} de {totalCount()} itens
                </div>
              </Show>
            </div>
            <div class={styles.toolbarActions}>
              <button
                type="button"
                class={styles.toolbarButton}
                onClick={() => controller.clearCompleted()}
              >
                <SvgIcon name="check" size={13} />
                <span>Clear done</span>
              </button>
              <Show when={descriptor.cancellable !== false}>
                <button
                  type="button"
                  class={styles.toolbarButton}
                  onClick={() => controller.cancelAll()}
                >
                  <SvgIcon name="x-circle" size={13} />
                  <span>{descriptor.cancelAllLabel ?? 'Cancel all'}</span>
                </button>
              </Show>
            </div>
          </div>

          <div class={styles.progressTrack}>
            <div class={styles.progressBar} style={{ width: `${aggregatePct()}%` }} />
          </div>

          <div class={styles.multiList}>
            <For each={items()} fallback={<div class={styles.description}>{descriptor.emptyLabel ?? 'No active operations.'}</div>}>
              {(item) => (
                <div class={styles.multiItem}>
                  <div
                    class={styles.icon}
                    data-spinning={String(item.status === 'running')}
                  >
                    <SvgIcon
                      name={
                        item.status === 'success'
                          ? 'check'
                          : item.status === 'error'
                            ? 'circle-x'
                            : item.status === 'cancelled'
                              ? 'x-circle'
                              : 'loader-circle'
                      }
                      size={16}
                    />
                  </div>
                  <div class={styles.content}>
                    <div class={styles.title}>{item.title}</div>
                    <Show when={item.description}>
                      <div class={styles.description}>{item.description}</div>
                    </Show>
                    <Show when={item.progress !== null}>
                      <div class={styles.progressTrack}>
                        <div
                          class={styles.progressBar}
                          style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }}
                        />
                      </div>
                    </Show>
                  </div>
                  <div class={styles.actions}>
                    <Show when={item.status === 'error'}>
                      <button
                        type="button"
                        class={styles.iconButton}
                        title="Retry"
                        onClick={() => controller.retryItem(item.id)}
                      >
                        <SvgIcon name="refresh" size={14} />
                      </button>
                    </Show>
                    <Show when={item.status === 'running' || item.status === 'queued'}>
                      <button
                        type="button"
                        class={styles.iconButton}
                        title="Cancel"
                        onClick={() => controller.cancelItem(item.id)}
                      >
                        <SvgIcon name="x" size={14} />
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      );
    },
  );

  const patchItem = (id: string, patch: Partial<InternalMultiItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const runItem = async (item: InternalMultiItem) => {
    if (!item.run) return;
    patchItem(item.id, { status: 'running' });
    try {
      await item.run({
        signal: item.abortController.signal,
        setProgress: (progress, label) =>
          patchItem(item.id, {
            progress: progress === null ? null : Math.max(0, Math.min(1, progress)),
            progressLabel: label ?? item.progressLabel,
          }),
        update: (p) => patchItem(item.id, p as Partial<InternalMultiItem>),
      });
      if (!item.abortController.signal.aborted) {
        patchItem(item.id, { status: 'success', progress: 1 });
      }
    } catch (err) {
      if (!item.abortController.signal.aborted) {
        patchItem(item.id, {
          status: 'error',
          description: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const allDone = items().length > 0 && items().every((i) => i.status === 'success');
    if (allDone && descriptor.autoDismiss !== false) {
      setTimeout(() => toastCtrl.dismiss('multi-complete'), 1800);
    }
  };

  const controller: MultiLoadingController = {
    get id() {
      return toastCtrl.id;
    },
    add(desc) {
      const id = desc.id ?? `multi-item-${++seq}`;
      const item: InternalMultiItem = {
        id,
        title: desc.title,
        description: desc.description ?? '',
        status: desc.status ?? 'queued',
        progress: desc.progress ?? null,
        progressLabel: desc.progressLabel ?? null,
        run: desc.run,
        abortController: new AbortController(),
      };
      setItems((prev) => [...prev, item]);
      if (item.run) void runItem(item);
      return id;
    },
    updateItem(id, patch) {
      patchItem(id, patch as Partial<InternalMultiItem>);
    },
    retryItem(id) {
      const target = items().find((i) => i.id === id);
      if (!target) return;
      const fresh: InternalMultiItem = {
        ...target,
        status: 'queued',
        progress: 0,
        abortController: new AbortController(),
      };
      patchItem(id, fresh);
      void runItem(fresh);
    },
    cancelItem(id) {
      const target = items().find((i) => i.id === id);
      if (!target) return;
      target.abortController.abort('cancelled');
      patchItem(id, { status: 'cancelled' });
    },
    cancelAll() {
      items().forEach((i) => {
        if (i.status === 'running' || i.status === 'queued') controller.cancelItem(i.id);
      });
    },
    clearCompleted() {
      setItems((list) => list.filter((i) => i.status !== 'success' && i.status !== 'cancelled'));
    },
    dismiss(reason = 'programmatic') {
      toastCtrl.dismiss(reason);
    },
  };

  (descriptor.items ?? []).forEach((it) => controller.add(it));
  return controller;
}
