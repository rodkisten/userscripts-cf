import { createSignal } from 'solid-js';
import type {
  PromiseDescriptor,
  RetryDescriptor,
  TaskController,
  TaskDescriptor,
  TaskExecutorContext,
  TaskGroup,
  TaskGroupDescriptor,
  TaskSnapshot,
  TaskStatus,
} from './types';
import { createToast, emitEvent, useToasterState } from './toasterStore';

const tasksMap = new Map<string, TaskController>();
const [tasksSignal, setTasksSignal] = createSignal<TaskController[]>([]);

function syncTasksSignal() {
  setTasksSignal([...tasksMap.values()]);
}

export function getAllTasks(): TaskController[] {
  return tasksSignal();
}

export function getTaskById(id: string): TaskController | null {
  return tasksMap.get(id) ?? null;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  const { config } = useToasterState();
  try {
    return window[config().taskStorage];
  } catch {
    return null;
  }
}

export function persistTasksNow() {
  const { config } = useToasterState();
  const storage = getStorage();
  if (!storage) return;
  const snapshots = tasksSignal()
    .map((t) => t.snapshot())
    .filter((s) => s.persist)
    .slice(0, config().maxPersistedTasks);
  try {
    storage.setItem(config().taskStorageKey, JSON.stringify(snapshots));
  } catch {
    // ignore quota errors
  }
}

export function clearPersistedTasks() {
  const { config } = useToasterState();
  try {
    getStorage()?.removeItem(config().taskStorageKey);
  } catch {
    // ignore
  }
}

export function restorePersistedTasks(): TaskController[] {
  const { config } = useToasterState();
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(config().taskStorageKey);
    if (!raw) return [];
    const list = JSON.parse(raw) as TaskSnapshot[];
    const now = Date.now();
    const restored: TaskController[] = [];
    for (const snap of list) {
      const isTerminal = ['success', 'error', 'cancelled'].includes(snap.status);
      if (isTerminal && now - snap.updatedAt > config().taskTerminalRetention) continue;
      const wasActive = snap.status === 'running' || snap.status === 'queued';
      const ctrl = createTaskController({
        id: snap.id,
        title: snap.title,
        description: wasActive
          ? `${snap.description}${snap.description ? ' · ' : ''}Restored after reload.`
          : snap.description,
        status: wasActive ? 'paused' : snap.status,
        progress: snap.progress,
        progressLabel: snap.progressLabel,
        metadata: snap.metadata,
        scope: snap.scope,
        persist: true,
      });
      if (ctrl) restored.push(ctrl);
    }
    return restored;
  } catch {
    return [];
  }
}

export function createTaskController(descriptor: TaskDescriptor | string = {}): TaskController | null {
  const opts: TaskDescriptor = typeof descriptor === 'string' ? { title: descriptor } : { ...descriptor };
  const id = opts.id ?? `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const existing = tasksMap.get(id);
  if (existing && !existing.dismissed) return existing;

  const { config } = useToasterState();
  const abortController = new AbortController();
  const [status, setStatus] = createSignal<TaskStatus>(opts.status ?? 'queued');
  const [progress, setProgress] = createSignal<number | null>(opts.progress ?? null);
  const [dismissed, setDismissed] = createSignal(false);

  const meta: TaskSnapshot = {
    id,
    title: opts.title ?? 'Task',
    description: opts.description ?? '',
    status: status(),
    progress: progress(),
    progressLabel: opts.progressLabel ?? null,
    metadata: { ...(opts.metadata ?? {}) },
    scope: opts.scope ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    persist: opts.persist ?? config().persistTasks,
  };

  const toastCtrl = createToast([], {
    ...opts,
    id: `task:${id}`,
    lane: 'task',
    type: 'default',
    loading: true,
    loadingState: 'loading',
    animation: meta.progress === null ? 'spinner' : 'progress',
    duration: 0,
    dedupe: false,
    onDismiss: (ev) => {
      setDismissed(true);
      tasksMap.delete(id);
      syncTasksSignal();
      if (meta.persist) persistTasksNow();
      opts.onDismiss?.(ev);
    },
  });

  const syncToast = () => {
    meta.status = status();
    meta.progress = progress();
    meta.updatedAt = Date.now();
    if (meta.persist) persistTasksNow();
    emitEvent('task:update', { task });

    if (meta.status === 'success') {
      toastCtrl.success({ title: meta.title, description: meta.description });
    } else if (meta.status === 'error') {
      toastCtrl.error({ title: meta.title, description: meta.description });
    } else {
      toastCtrl.update({
        title: meta.title,
        description: meta.description,
        progress: meta.progress,
        progressLabel: meta.progressLabel,
        animation: meta.progress === null ? 'spinner' : 'progress',
      });
    }
  };

  const task: TaskController = {
    get id() {
      return id;
    },
    get status() {
      return status();
    },
    get progress() {
      return progress();
    },
    get signal() {
      return abortController.signal;
    },
    get dismissed() {
      return dismissed();
    },
    async start() {
      if (!opts.run) return undefined;
      setStatus('running');
      syncToast();
      const ctx: TaskExecutorContext = {
        task,
        signal: abortController.signal,
        setProgress: (val, label) => task.setProgress(val, label),
        update: (patch) => task.update(patch),
      };
      try {
        const result = await opts.run(ctx);
        if (status() !== 'cancelled') {
          setStatus('success');
          setProgress(1);
          syncToast();
        }
        return result;
      } catch (err) {
        if (status() !== 'cancelled') {
          setStatus('error');
          meta.description = err instanceof Error ? err.message : String(err);
          syncToast();
        }
        throw err;
      }
    },
    async pause() {
      if (status() !== 'running') return;
      await opts.onPause?.();
      setStatus('paused');
      syncToast();
    },
    async resume() {
      if (status() !== 'paused') return;
      await opts.onResume?.();
      setStatus('running');
      syncToast();
    },
    async cancel(reason = 'user') {
      if (['success', 'error', 'cancelled'].includes(status())) return;
      abortController.abort(reason);
      await opts.onCancel?.(reason);
      setStatus('cancelled');
      syncToast();
      toastCtrl.dismiss(reason);
    },
    setProgress(val, label) {
      setProgress(val === null ? null : Math.max(0, Math.min(1, val)));
      if (label !== undefined) meta.progressLabel = label;
      syncToast();
    },
    update(patch) {
      if (patch.title !== undefined) meta.title = patch.title;
      if (patch.description !== undefined) meta.description = patch.description;
      if (patch.progress !== undefined) setProgress(patch.progress);
      if (patch.progressLabel !== undefined) meta.progressLabel = patch.progressLabel;
      if (patch.metadata) meta.metadata = { ...meta.metadata, ...patch.metadata };
      syncToast();
    },
    success(next) {
      const patch = typeof next === 'string' ? { description: next } : next ?? {};
      if (patch.title) meta.title = patch.title;
      if (patch.description) meta.description = patch.description;
      setStatus('success');
      setProgress(1);
      syncToast();
    },
    error(err, next = {}) {
      meta.description = next.description ?? (err instanceof Error ? err.message : String(err ?? 'Error'));
      if (next.title) meta.title = next.title;
      setStatus('error');
      syncToast();
    },
    dismiss(reason = 'programmatic') {
      toastCtrl.dismiss(reason);
    },
    snapshot() {
      return { ...meta, metadata: { ...meta.metadata } };
    },
  };

  tasksMap.set(id, task);
  syncTasksSignal();
  if (opts.run) void task.start().catch(() => undefined);
  return task;
}

export async function showPromiseToast<T>(
  input: Promise<T> | ((ctx: TaskExecutorContext) => Promise<T>),
  descriptor: PromiseDescriptor<T> = {},
): Promise<T> {
  const loadingOpts =
    typeof descriptor.loading === 'string' ? { title: descriptor.loading } : descriptor.loading ?? {};

  const task = createTaskController({
    ...descriptor,
    ...loadingOpts,
    title: loadingOpts.title ?? descriptor.title ?? 'Loading...',
    run: async (ctx) => (typeof input === 'function' ? input(ctx) : input),
  })!;

  try {
    const result = await task.start();
    const successSpec =
      typeof descriptor.success === 'function' ? descriptor.success(result as T) : descriptor.success;
    if (successSpec) {
      task.success(typeof successSpec === 'string' ? { title: successSpec } : successSpec);
    }
    return result as T;
  } catch (err) {
    const errorSpec = typeof descriptor.error === 'function' ? descriptor.error(err) : descriptor.error;
    if (errorSpec) {
      task.error(err, typeof errorSpec === 'string' ? { title: errorSpec } : errorSpec);
    }
    throw err;
  }
}

export async function showRetryToast<T>(descriptor: RetryDescriptor<T>): Promise<T> {
  const attempts = Math.max(1, descriptor.attempts ?? 3);
  const baseDelay = Math.max(0, descriptor.delay ?? 600);
  const backoff = Math.max(1, descriptor.backoff ?? 1.8);

  return showPromiseToast<T>(async (ctx) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        ctx.update({ description: attempt > 1 ? `Attempt ${attempt} of ${attempts}...` : descriptor.description });
        return await descriptor.run({ ...ctx, attempt });
      } catch (err) {
        lastError = err;
        if (attempt >= attempts || ctx.signal.aborted) throw err;
        const wait = Math.round(baseDelay * Math.pow(backoff, attempt - 1));
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastError;
  }, descriptor);
}

export function createTaskGroup(descriptor: TaskGroupDescriptor | string = {}): TaskGroup {
  const opts: TaskGroupDescriptor = typeof descriptor === 'string' ? { title: descriptor } : { ...descriptor };
  const id = opts.id ?? `group-${Date.now().toString(36)}`;
  const parent = createTaskController({ ...opts, id, progress: 0 })!;
  const children = new Map<string, TaskController>();
  const weights = new Map<string, number>(Object.entries(opts.weights ?? {}));

  const recompute = () => {
    if (!children.size) return;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const [key, child] of children) {
      const w = weights.get(key) ?? 1;
      totalWeight += w;
      const p = child.status === 'success' ? 1 : child.progress ?? 0;
      weightedSum += p * w;
    }
    parent.setProgress(totalWeight > 0 ? weightedSum / totalWeight : 0);
  };

  const group: TaskGroup = {
    id,
    parent,
    task(keyOrDesc, maybeDesc = {}) {
      const childOpts: TaskDescriptor =
        typeof keyOrDesc === 'string'
          ? { ...maybeDesc, key: keyOrDesc, title: maybeDesc.title ?? keyOrDesc }
          : { ...keyOrDesc };
      const key = childOpts.key ?? childOpts.id ?? `child-${children.size + 1}`;
      const child = createTaskController({
        ...childOpts,
        id: `${id}:${key}`,
        run: childOpts.run
          ? async (ctx) => {
              const res = await childOpts.run!(ctx);
              recompute();
              return res;
            }
          : undefined,
      });
      if (child) {
        children.set(key, child);
        recompute();
      }
      return child;
    },
    setWeights(next) {
      Object.entries(next).forEach(([k, v]) => weights.set(k, Math.max(0, v)));
      recompute();
      return group;
    },
    dismissAll(reason = 'group-dismiss') {
      children.forEach((c) => c.dismiss(reason));
      parent.dismiss(reason);
    },
    complete(next) {
      parent.success(next);
      return group;
    },
  };

  return group;
}
