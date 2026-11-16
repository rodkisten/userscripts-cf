import { createSignal } from 'solid-js';
import type {
  ResolvedTheme,
  Theme,
  ToastController,
  ToastEventListener,
  ToastOptions,
  ToastRecordState,
  ToastType,
  ToasterConfig,
  UnknownRecord,
} from './types';

export const OPTIONS_SYMBOL: unique symbol = Symbol('rod.super-toaster.options');

export const DEFAULT_CONFIG: ToasterConfig = {
  duration: 15_000,
  debugDuration: 0,
  shouldDebug: true,
  maxToasts: 20,
  dedupe: true,
  dedupeWindow: 1000,
  pauseOnInteraction: true,
  closeButton: true,
  position: 'top-center',
  theme: 'auto',
  size: 'compact',
  stacked: true,
  stackVisible: 3,
  stackMaxHeight: 520,
  stackViewportRatio: 0.48,
  stackAutoCollapseThreshold: 6,
  stackToolbar: true,
  persistTasks: false,
  restoreTasksOnLoad: true,
  taskStorage: 'sessionStorage',
  taskStorageKey: '__rod_super_toaster_tasks_v1__',
  maxPersistedTasks: 50,
  taskTerminalRetention: 86_400_000,
  successExitAnimation: true,
  successCollapseDuration: 360,
  successExitDuration: 220,
  loadingDuration: 0,
  loadingAnimation: 'spinner',
  loadingIcon: 'loader-circle',
  loadingSuccessDuration: 1400,
  loadingErrorDuration: 7000,
  loadingInfoDuration: 4000,
  loadingWarningDuration: 6000,
  coalescePersistent: true,
  swipeToDismiss: true,
  swipeThreshold: 72,
  inspectDepth: 80,
  inspectItems: 1000,
  previewItems: 30,
  useShadowRoot: false,
};

export interface InternalToastEntry {
  record: ToastRecordState;
  controller: ToastController;
  dedupeKey: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
  pausedReasons: Set<string>;
  removed: boolean;
}

const [config, setConfig] = createSignal<ToasterConfig>({ ...DEFAULT_CONFIG });
const [resolvedTheme, setResolvedTheme] = createSignal<ResolvedTheme>('dark');
const [toasts, setToasts] = createSignal<InternalToastEntry[]>([]);
const [stackExpanded, setStackExpanded] = createSignal(true);
const [managerMinimized, setManagerMinimized] = createSignal(false);
const [expandedToastId, setExpandedToastId] = createSignal<string | null>(null);

const listeners = new Map<string, Set<ToastEventListener>>();
let idSeq = 0;

export function useToasterState() {
  return {
    config,
    resolvedTheme,
    toasts,
    stackExpanded,
    setStackExpanded,
    managerMinimized,
    setManagerMinimized,
    expandedToastId,
    setExpandedToastId,
  };
}

export function emitEvent(eventName: string, payload: UnknownRecord = {}): void {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(err);
    }
  }
}

export function addEventListenerInternal(eventName: string, listener: ToastEventListener): () => void {
  let set = listeners.get(eventName);
  if (!set) {
    set = new Set();
    listeners.set(eventName, set);
  }
  set.add(listener);
  return () => set?.delete(listener);
}

export function resolveSystemTheme(theme: Theme = config().theme): ResolvedTheme {
  if (theme === 'dark' || theme === 'light') return theme;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function updateConfig(patch: Partial<ToasterConfig>) {
  setConfig((prev) => {
    const next = { ...prev, ...patch };
    setResolvedTheme(resolveSystemTheme(next.theme));
    return next;
  });
  return { ...config(), resolvedTheme: resolvedTheme() };
}

export function setTheme(theme: Theme): ResolvedTheme {
  updateConfig({ theme });
  const resolved = resolvedTheme();
  emitEvent('theme:change', { theme, resolvedTheme: resolved });
  return resolved;
}

export function isOptionsCandidate(value: unknown): value is ToastOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if ((value as Record<symbol, unknown>)[OPTIONS_SYMBOL]) return true;
  const known = [
    'duration', 'type', 'lane', 'id', 'dedupe', 'title', 'description',
    'icon', 'loading', 'progress', 'actions', 'scope', 'details', 'expanded',
    'onDismiss', 'closeButton', 'dismissible',
  ];
  return known.some((k) => k in value);
}

export function parseArguments(inputArgs: readonly unknown[], forcedType: ToastType | null) {
  const args = [...inputArgs];
  let trailing: ToastOptions = {};
  if (args.length > 0 && isOptionsCandidate(args[args.length - 1])) {
    trailing = { ...(args.pop() as ToastOptions) };
  }
  if (forcedType) trailing.type = forcedType;
  return { args, options: trailing };
}

function normalizeOptions(raw: ToastOptions): ToastRecordState['options'] {
  const cfg = config();
  const type: ToastType = raw.type ?? 'default';
  const defaultDur = type === 'debug' ? cfg.debugDuration : raw.loading ? cfg.loadingDuration : cfg.duration;
  return {
    ...raw,
    id: raw.id ?? `rod-toast-${++idSeq}-${Date.now().toString(36)}`,
    type,
    lane: raw.lane ?? 'notification',
    duration: Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : defaultDur,
    dedupe: raw.dedupe ?? cfg.dedupe,
    dedupeWindow: raw.dedupeWindow ?? cfg.dedupeWindow,
    pauseOnInteraction: raw.pauseOnInteraction ?? cfg.pauseOnInteraction,
    closeButton: raw.closeButton ?? cfg.closeButton,
    dismissible: raw.dismissible ?? true,
    role: raw.role ?? (type === 'error' || type === 'warning' ? 'alert' : 'status'),
    swipeToDismiss: raw.swipeToDismiss ?? cfg.swipeToDismiss,
    title: raw.title ?? '',
    description: raw.description ?? '',
    loading: Boolean(raw.loading),
    loadingState: raw.loadingState ?? 'loading',
    animation: raw.animation ?? cfg.loadingAnimation,
  };
}

function patchEntry(id: string, updater: (prev: ToastRecordState) => ToastRecordState) {
  setToasts((list) =>
    list.map((entry) => (entry.record.id === id ? { ...entry, record: updater(entry.record) } : entry)),
  );
}

export function pauseToastTimer(id: string, reason = 'interaction') {
  const entry = toasts().find((t) => t.record.id === id);
  if (!entry || entry.removed) return;
  if (entry.pausedReasons.has(reason)) return;
  const wasPaused = entry.pausedReasons.size > 0;
  entry.pausedReasons.add(reason);
  if (!wasPaused && entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
  }
}

export function resumeToastTimer(id: string, reason = 'interaction') {
  const entry = toasts().find((t) => t.record.id === id);
  if (!entry || entry.removed) return;
  entry.pausedReasons.delete(reason);
  if (entry.pausedReasons.size === 0 && entry.remaining > 0 && Number.isFinite(entry.remaining)) {
    scheduleEntryTimer(entry);
  }
}

function scheduleEntryTimer(entry: InternalToastEntry) {
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.removed || entry.pausedReasons.size > 0 || entry.remaining <= 0 || !Number.isFinite(entry.remaining)) {
    return;
  }
  entry.startedAt = Date.now();
  entry.timer = setTimeout(() => {
    dismissToast(entry.record.id, 'timeout', false);
  }, entry.remaining);
}

export function dismissToast(id: string, reason = 'programmatic', immediate = false) {
  const entry = toasts().find((t) => t.record.id === id);
  if (!entry || entry.removed) return;

  const finalize = () => {
    if (entry.removed) return;
    entry.removed = true;
    if (entry.timer) clearTimeout(entry.timer);
    setToasts((list) => list.filter((t) => t.record.id !== id));
    emitEvent('dismiss', { id, reason, scope: entry.record.options.scope ?? null });
    entry.record.options.onDismiss?.({ id, reason, scope: entry.record.options.scope ?? null });
  };

  if (immediate) {
    finalize();
    return;
  }

  const cfg = config();
  if (entry.record.options.type === 'success' && cfg.successExitAnimation) {
    patchEntry(id, (r) => ({ ...r, completing: true }));
    setTimeout(() => {
      patchEntry(id, (r) => ({ ...r, successExit: true }));
      setTimeout(finalize, Math.max(80, cfg.successExitDuration));
    }, Math.max(120, cfg.successCollapseDuration));
    return;
  }

  patchEntry(id, (r) => ({ ...r, visible: false }));
  setTimeout(finalize, 260);
}

export function dismissAllToasts(immediate = false) {
  const list = [...toasts()];
  list.forEach((item, idx) => {
    setTimeout(() => dismissToast(item.record.id, 'dismissAll', immediate), immediate ? 0 : idx * 25);
  });
}

export function createToast(
  args: unknown[],
  rawOptions: ToastOptions,
  customContent?: () => any,
): ToastController {
  const options = normalizeOptions(rawOptions);
  const id = options.id!;

  const existing = toasts().find((t) => !t.removed && t.record.id === id);
  if (existing) {
    patchEntry(id, (prev) => ({
      ...prev,
      args: args.length ? args : prev.args,
      options: { ...prev.options, ...options },
      lastSeenAt: Date.now(),
      customContent: customContent ?? prev.customContent,
    }));
    existing.remaining = options.duration;
    scheduleEntryTimer(existing);
    return existing.controller;
  }

  const dedupeKey = options.dedupe
    ? `${options.type}:${options.title}:${options.description}:${JSON.stringify(args[0] ?? '')}`
    : null;

  if (dedupeKey && !rawOptions.id) {
    const dup = toasts().find((t) => !t.removed && t.dedupeKey === dedupeKey);
    const now = Date.now();
    if (dup && (dup.record.options.duration <= 0 || now - dup.record.lastSeenAt <= options.dedupeWindow)) {
      patchEntry(dup.record.id, (prev) => ({
        ...prev,
        duplicateCount: prev.duplicateCount + 1,
        lastSeenAt: now,
      }));
      dup.remaining = dup.record.options.duration;
      scheduleEntryTimer(dup);
      return dup.controller;
    }
  }

  const cfg = config();
  const notifications = toasts().filter((t) => t.record.options.lane !== 'interaction');
  if (notifications.length >= cfg.maxToasts) {
    const oldest = notifications[notifications.length - 1];
    if (oldest) dismissToast(oldest.record.id, 'limit', true);
  }

  const controller: ToastController = {
    get id() {
      return id;
    },
    get progress() {
      return toasts().find((t) => t.record.id === id)?.record.options.progress ?? null;
    },
    get state() {
      const rec = toasts().find((t) => t.record.id === id)?.record;
      return rec?.options.loading ? rec.options.loadingState : rec?.options.type ?? 'dismissed';
    },
    update(...nextArgs: unknown[]) {
      const parsed = parseArguments(nextArgs, null);
      patchEntry(id, (prev) => ({
        ...prev,
        args: parsed.args.length ? parsed.args : prev.args,
        options: { ...prev.options, ...parsed.options },
      }));
      const entry = toasts().find((t) => t.record.id === id);
      if (entry && parsed.options.duration !== undefined) {
        entry.remaining = parsed.options.duration;
        scheduleEntryTimer(entry);
      }
      return controller;
    },
    setProgress(value: number | null, next: ToastOptions = {}) {
      patchEntry(id, (prev) => ({
        ...prev,
        options: {
          ...prev.options,
          ...next,
          loading: true,
          animation: next.animation ?? 'progress',
          progress: value === null ? null : Math.max(0, Math.min(1, value)),
        },
      }));
      return controller;
    },
    success(...nextArgs: unknown[]) {
      const parsed = parseArguments(nextArgs, 'success');
      const dur = parsed.options.duration ?? config().loadingSuccessDuration;
      patchEntry(id, (prev) => ({
        ...prev,
        args: parsed.args.length ? parsed.args : prev.args,
        options: {
          ...prev.options,
          ...parsed.options,
          type: 'success',
          loadingState: 'settled',
          animation: 'none',
          progress: 1,
          duration: dur,
        },
      }));
      const entry = toasts().find((t) => t.record.id === id);
      if (entry) {
        entry.remaining = dur;
        scheduleEntryTimer(entry);
      }
      return controller;
    },
    error(...nextArgs: unknown[]) {
      const parsed = parseArguments(nextArgs, 'error');
      const dur = parsed.options.duration ?? config().loadingErrorDuration;
      patchEntry(id, (prev) => ({
        ...prev,
        args: parsed.args.length ? parsed.args : prev.args,
        options: {
          ...prev.options,
          ...parsed.options,
          type: 'error',
          loadingState: 'settled',
          animation: 'none',
          duration: dur,
        },
      }));
      const entry = toasts().find((t) => t.record.id === id);
      if (entry) {
        entry.remaining = dur;
        scheduleEntryTimer(entry);
      }
      return controller;
    },
    info(...nextArgs: unknown[]) {
      const parsed = parseArguments(nextArgs, 'info');
      const dur = parsed.options.duration ?? config().loadingInfoDuration;
      patchEntry(id, (prev) => ({
        ...prev,
        args: parsed.args.length ? parsed.args : prev.args,
        options: { ...prev.options, ...parsed.options, type: 'info', loadingState: 'settled', animation: 'none', duration: dur },
      }));
      return controller;
    },
    warning(...nextArgs: unknown[]) {
      const parsed = parseArguments(nextArgs, 'warning');
      const dur = parsed.options.duration ?? config().loadingWarningDuration;
      patchEntry(id, (prev) => ({
        ...prev,
        args: parsed.args.length ? parsed.args : prev.args,
        options: { ...prev.options, ...parsed.options, type: 'warning', loadingState: 'settled', animation: 'none', duration: dur },
      }));
      return controller;
    },
    dismiss(reason?: string | boolean, immediate = false) {
      if (typeof reason === 'boolean') dismissToast(id, 'programmatic', reason);
      else dismissToast(id, reason ?? 'programmatic', immediate);
    },
  };

  const entry: InternalToastEntry = {
    record: {
      id,
      args,
      options,
      duplicateCount: 1,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      completing: false,
      successExit: false,
      visible: false,
      customContent,
    },
    controller,
    dedupeKey,
    timer: null,
    remaining: options.duration,
    startedAt: Date.now(),
    pausedReasons: new Set(),
    removed: false,
  };

  setToasts((prev) => [entry, ...prev]);

  const stackNotifications = toasts().filter((t) => t.record.options.lane !== 'interaction');
  if (stackNotifications.length >= cfg.stackAutoCollapseThreshold) {
    setStackExpanded(false);
  }

  requestAnimationFrame(() => patchEntry(id, (r) => ({ ...r, visible: true })));
  scheduleEntryTimer(entry);
  emitEvent('create', { id, options });

  return controller;
}
