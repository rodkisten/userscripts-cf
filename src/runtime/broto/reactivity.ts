import { brotoDebugState } from "@rodkisten/broto/debug";
import { cleanupOwner, createOwner, createRoot, getOwner, handleOwnerError, onOwnerCleanup, runWithOwner } from "@rodkisten/broto/owner";
import { isSignal, markSignal } from "@rodkisten/broto/signal";
import type { Cleanup, CleanupRegistrar, EffectDebugSnapshot, EffectOptions, EffectRunner, SchedulerDebugSnapshot, SchedulerPriority, Signal, SignalDebugSnapshot, SignalOptions, SchedulerMode } from "@rodkisten/broto/types";

/** Queued async effects waiting for the next scheduler flush. */
const effectQueue = new Set<EffectRunner>();

const DEFAULT_MAX_FLUSH_ITERATIONS = 1_000;

let activeEffect: EffectRunner | null = null;
let trackingEnabled = true;
let flushQueued = false;
let queuedFlushMode: SchedulerMode | null = null;
let batchDepth = 0;
let schedulerMode: SchedulerMode = "microtask";
let maxFlushIterations = DEFAULT_MAX_FLUSH_ITERATIONS;
let signalId = 0;
let effectId = 0;
const signalDebugEntries = new Set<{ id: string; name?: string; reads: number; writes: number; subscribers: Set<EffectRunner>; disposed: boolean }>();
const effectDebugEntries = new Set<EffectRunner & { debugId?: string; runs?: number }>();

/** Priority queues used by scheduleTask(). */
const taskQueues = {
  "user-blocking": new Set<() => void>(),
  normal: new Set<() => void>(),
  background: new Set<() => void>(),
} satisfies Record<SchedulerPriority, Set<() => void>>;

let taskFlushQueued = false;



/**
 * Creates an owned effect scope and returns its value plus disposer.
 *
 * @remarks
 * An effect scope is a lightweight root owner for grouping signals, effects,
 * resources and cleanups without creating a UI component. It is useful for
 * plugins, devtools panels and long-lived service objects.
 *
 * @param callback - Work to run inside the scope.
 * @param name - Optional debug name.
 * @returns Tuple with callback value and disposer.
 *
 * @example
 * ```ts
 * const [api, dispose] = effectScope(() => {
 *   effect(() => console.log(count()), { name: 'counter-log' });
 *   return { ready: true };
 * }, 'plugin');
 * dispose();
 * ```
 */
export function effectScope<Value>(callback: () => Value, name = "effectScope"): [Value, Cleanup] {
  return createRoot((dispose) => [callback(), dispose] as [Value, Cleanup], { name })[0];
}

/**
 * Configures the global reactive scheduler.
 *
 * @param options - Scheduler options.
 * @returns void.
 *
 * @example Use animation-frame scheduling for heavy UI work
 * ```ts
 * configureScheduler({ mode: "raf", maxFlushIterations: 500 });
 * ```
 */
export function configureScheduler(options: { mode?: SchedulerMode; maxFlushIterations?: number } = {}): void {
  if (options.mode) {
    schedulerMode = options.mode;
  }

  if (typeof options.maxFlushIterations === "number" && Number.isFinite(options.maxFlushIterations)) {
    maxFlushIterations = Math.max(1, Math.floor(options.maxFlushIterations));
  }
}

/**
 * Creates a fine-grained writable signal.
 *
 * @remarks
 * Callable signals keep reads cheap, and custom equality lets callers avoid
 * unnecessary updates for structural values. Pass `{ equals: false }` to always
 * notify subscribers, useful for mutable objects owned outside Fabrica.
 *
 * @param initialValue - Initial signal value.
 * @param options - Optional equality behavior.
 * @returns Signal reader with mutation helpers.
 *
 * @example Basic counter
 * ```ts
 * const count = signal(0);
 * count.set(1);
 * count.update((current) => current + 1);
 * console.log(count());
 * // 2
 * ```
 *
 * @example Always notify for externally mutated state
 * ```ts
 * const state = signal({ open: false }, { equals: false });
 * state.peek().open = true;
 * state.set(state.peek());
 * ```
 */
export function signal<Value>(initialValue: Value, options: SignalOptions<Value> = {}): Signal<Value> {
  brotoDebugState.signals += 1;
  let value = initialValue;
  const subscribers = new Set<EffectRunner>();
  const equals = options.equals ?? Object.is;
  const debugEntry = { id: `signal-${++signalId}`, name: options.name, reads: 0, writes: 0, subscribers, disposed: false };
  signalDebugEntries.add(debugEntry);

  function didNotChange(previousValue: Value, nextValue: Value): boolean {
    if (equals === false) {
      return false;
    }

    return equals(previousValue, nextValue);
  }

  function read(): Value {
    debugEntry.reads += 1;
    if (activeEffect && trackingEnabled && !subscribers.has(activeEffect)) {
      subscribers.add(activeEffect);
      activeEffect.deps.push(subscribers);
    }

    return value;
  }

  read.set = (nextValue: Value): void => {
    if (didNotChange(value, nextValue)) {
      return;
    }

    value = nextValue;
    debugEntry.writes += 1;
    brotoDebugState.updates += 1;

    // Snapshot manually instead of Array.from(). Sync effects cleanup and re-add
    // themselves while running, and raw Set iteration can revisit them forever.
    const pending: EffectRunner[] = [];
    for (const subscriber of subscribers) pending[pending.length] = subscriber;
    for (let index = 0; index < pending.length; index += 1) scheduleEffect(pending[index]);
  };

  read.update = (updater: (currentValue: Value) => Value): void => {
    if (typeof updater !== "function") {
      throw new TypeError("signal.update() expects a function updater.");
    }

    read.set(updater(value));
  };

  read.peek = (): Value => value;

  read.subscribe = (listener: EffectRunner): Cleanup => {
    subscribers.add(listener);

    return () => {
      subscribers.delete(listener);
    };
  };

  return markSignal(read);
}

/**
 * Registers cleanup inside the currently running effect.
 *
 * @param cleanup - Cleanup callback.
 * @returns void.
 *
 * @example Interval cleanup
 * ```ts
 * effect((onCleanup) => {
 *   const timer = window.setInterval(() => console.log("tick"), 1000);
 *   onCleanup(() => window.clearInterval(timer));
 * });
 * ```
 */
export function onCleanup(cleanup: Cleanup): void {
  if (typeof cleanup !== "function") {
    return;
  }

  if (activeEffect) {
    activeEffect.cleanups.push(cleanup);
    return;
  }

  onOwnerCleanup(cleanup);
}

/**
 * Runs a tracked effect and returns a disposer.
 *
 * @param callback - Reactive callback.
 * @param options - Effect options.
 * @returns Dispose callback.
 *
 * @example Dispose manually
 * ```ts
 * const stop = effect(() => {
 *   console.log(count());
 * });
 * stop();
 * ```
 */
export function effect(callback: (cleanup: CleanupRegistrar) => void, options: EffectOptions = {}): Cleanup {
  const parentOwner = getOwner();
  const owner = createOwner({ parent: parentOwner, name: options.name ?? "effect" });

  const runner = function runEffect(): void {
    if (runner.disposed || owner.disposed) {
      return;
    }

    cleanupEffect(runner);

    const previousEffect = activeEffect;
    activeEffect = runner;

    try {
      (runner as EffectRunner & { runs?: number }).runs = ((runner as EffectRunner & { runs?: number }).runs ?? 0) + 1;
      runWithOwner(owner, () => callback(onCleanup));
    } catch (error) {
      if (!handleOwnerError(error, owner)) {
        throw error;
      }
    } finally {
      activeEffect = previousEffect;
    }
  } as EffectRunner;

  runner.deps = [];
  runner.cleanups = [];
  runner.disposed = false;
  runner.sync = Boolean(options.sync || options.scheduler === "sync");
  runner.schedulerMode = options.scheduler;
  runner.owner = owner;
  runner.debugName = options.name;
  (runner as EffectRunner & { debugId?: string; runs?: number }).debugId = `effect-${++effectId}`;
  (runner as EffectRunner & { debugId?: string; runs?: number }).runs = 0;
  effectDebugEntries.add(runner as EffectRunner & { debugId?: string; runs?: number });

  brotoDebugState.effects += 1;
  runner();

  const dispose = (): void => {
    if (runner.disposed) {
      return;
    }

    runner.disposed = true;
    cleanupEffect(runner);
    owner.parent?.children.delete(owner);
    owner.disposed = true;
  };

  if (parentOwner) {
    runWithOwner(parentOwner, () => onOwnerCleanup(dispose));
  }

  return dispose;
}

/**
 * Creates a lazy derived signal.
 *
 * @remarks
 * The previous implementation eagerly recomputed through an internal effect.
 * This version behaves more like a true memo: dependencies mark it dirty, but
 * the getter only runs when somebody reads the computed value. That keeps large
 * component trees and debug panels from doing invisible work.
 *
 * @param getter - Getter that may read signals.
 * @param options - Optional equality behavior.
 * @returns Derived signal.
 *
 * @example Derived label
 * ```ts
 * const label = computed(() => `Count: ${count()}`);
 * // getter has not run yet
 * console.log(label());
 * // getter runs and caches now
 * ```
 */
export function computed<Value>(getter: () => Value, options: SignalOptions<Value> = {}): Signal<Value> {
  brotoDebugState.computed += 1;

  const parentOwner = getOwner();
  const owner = createOwner({ parent: parentOwner, name: "computed" });
  const subscribers = new Set<EffectRunner>();
  const equals = options.equals ?? Object.is;
  const debugEntry = { id: `signal-${++signalId}`, name: options.name, reads: 0, writes: 0, subscribers, disposed: false };
  signalDebugEntries.add(debugEntry);

  let dirty = true;
  let initialized = false;
  let value: Value;

  const runner = function markComputedDirty(): void {
    if (runner.disposed || owner.disposed) {
      return;
    }

    if (dirty) {
      return;
    }

    dirty = true;

    // Snapshot subscribers before dispatching. A synchronous subscriber can
    // remove and re-add itself while it runs; iterating the live Set would then
    // revisit the same effect indefinitely. This mirrors writable-signal
    // invalidation and is critical for computed values consumed by Fabrica's
    // synchronous DOM bindings.
    const pending: EffectRunner[] = [];
    for (const subscriber of subscribers) pending[pending.length] = subscriber;
    for (let index = 0; index < pending.length; index += 1) {
      scheduleEffect(pending[index]);
    }
  } as EffectRunner;

  runner.deps = [];
  runner.cleanups = [];
  runner.disposed = false;
  runner.sync = true;
  runner.schedulerMode = "sync";
  runner.owner = owner;
  runner.debugName = options.name ?? "computed";
  (runner as EffectRunner & { debugId?: string; runs?: number }).debugId = `effect-${++effectId}`;
  (runner as EffectRunner & { debugId?: string; runs?: number }).runs = 0;
  effectDebugEntries.add(runner as EffectRunner & { debugId?: string; runs?: number });

  const didNotChange = (previousValue: Value, nextValue: Value): boolean => {
    if (!initialized || equals === false) {
      return false;
    }

    return equals(previousValue, nextValue);
  };

  const recompute = (): Value => {
    if (!dirty && initialized) {
      return value;
    }

    cleanupEffect(runner);

    const previousEffect = activeEffect;
    activeEffect = runner;

    try {
      const nextValue = runWithOwner(owner, getter);

      if (!didNotChange(value, nextValue)) {
        value = nextValue;
        brotoDebugState.updates += initialized ? 1 : 0;
      }

      initialized = true;
      dirty = false;
      return value;
    } catch (error) {
      if (!handleOwnerError(error, owner)) {
        throw error;
      }

      return value;
    } finally {
      activeEffect = previousEffect;
    }
  };

  function read(): Value {
    debugEntry.reads += 1;
    if (activeEffect && trackingEnabled && !subscribers.has(activeEffect)) {
      subscribers.add(activeEffect);
      activeEffect.deps.push(subscribers);
    }

    return recompute();
  }

  read.set = (): void => {
    throw new TypeError("computed.set() is not supported. Computed signals are read-only.");
  };

  read.update = (): void => {
    throw new TypeError("computed.update() is not supported. Computed signals are read-only.");
  };

  read.peek = (): Value => untrack(recompute);

  read.subscribe = (listener: EffectRunner): Cleanup => {
    subscribers.add(listener);

    return () => {
      subscribers.delete(listener);
    };
  };

  const dispose = (): void => {
    if (runner.disposed) {
      return;
    }

    runner.disposed = true;
    cleanupEffect(runner);
    subscribers.clear();
    owner.parent?.children.delete(owner);
    owner.disposed = true;
  };

  if (parentOwner) {
    runWithOwner(parentOwner, () => onOwnerCleanup(dispose));
  }

  return markSignal(read);
}

/**
 * Alias for `computed()`.
 *
 * @param getter - Getter that may read signals.
 * @param options - Optional equality behavior.
 * @returns Derived signal.
 *
 * @example Memo value
 * ```ts
 * const expensiveLabel = memo(() => calculateLabel(source()));
 * ```
 */
export function memo<Value>(getter: () => Value, options: SignalOptions<Value> = {}): Signal<Value> {
  return computed(getter, options);
}

/**
 * Runs a callback without dependency tracking.
 *
 * @param callback - Callback to run outside dependency tracking.
 * @returns Callback result.
 *
 * @example Read without subscribing
 * ```ts
 * const current = untrack(() => count());
 * ```
 */
export function untrack<Value>(callback: () => Value): Value {
  const previousTracking = trackingEnabled;
  trackingEnabled = false;

  try {
    return callback();
  } finally {
    trackingEnabled = previousTracking;
  }
}

/**
 * Batches signal writes into one scheduled flush.
 *
 * @param callback - Callback that may write signals.
 * @returns Callback result.
 *
 * @example Batch two writes
 * ```ts
 * batch(() => {
 *   firstName.set("Rod");
 *   lastName.set("Dev");
 * });
 * ```
 */
export function batch<Value>(callback: () => Value): Value {
  batchDepth += 1;

  try {
    return callback();
  } finally {
    batchDepth -= 1;

    if (batchDepth === 0 && effectQueue.size > 0) {
      queueFlush();
    }
  }
}

/**
 * Runs all pending reactive work synchronously.
 *
 * @returns void.
 *
 * @example
 * ```ts
 * count.set(1);
 * flushSync();
 * ```
 */
export function flushSync(): void {
  if (effectQueue.size > 0) {
    flushEffects();
  }

  if (hasPendingTasks()) {
    flushTasks();
  }
}

/**
 * Schedules non-reactive work on Broto's cooperative task queue.
 *
 * @param task - Task callback.
 * @param priority - Task priority.
 * @returns Cleanup that cancels the task before it runs.
 *
 * @example
 * ```ts
 * const cancel = scheduleTask(() => expensiveMeasure(), "background");
 * cancel();
 * ```
 */
export function scheduleTask(task: () => void, priority: SchedulerPriority = "normal"): Cleanup {
  const queue = taskQueues[priority] ?? taskQueues.normal;
  queue.add(task);
  queueTaskFlush();

  return () => {
    queue.delete(task);
  };
}

/**
 * Resolves a value as a signal/function/plain value.
 *
 * @param value - Input value.
 * @returns Resolved value.
 */
export function readReactiveValue(value: unknown): unknown {
  if (isSignal(value)) {
    return value();
  }

  if (typeof value === "function") {
    return (value as () => unknown)();
  }

  return value;
}

/**
 * Checks whether a value has reactive behavior.
 *
 * @param value - Input value.
 * @returns Whether the value is a signal or expression.
 */
export function hasReactiveValue(value: unknown): boolean {
  return typeof value === "function";
}

/**
 * Cleans old effect dependencies and user cleanups.
 *
 * @param runner - Effect runner.
 * @returns void.
 */
function cleanupEffect(runner: EffectRunner): void {
  cleanupOwner(runner.owner);

  const cleanups = runner.cleanups;

  for (let index = cleanups.length - 1; index >= 0; index -= 1) {
    cleanups[index]?.();
  }

  cleanups.length = 0;

  const deps = runner.deps;

  for (let index = 0; index < deps.length; index += 1) {
    deps[index]?.delete(runner);
  }

  deps.length = 0;
}

/**
 * Schedules or immediately runs an effect.
 *
 * @param runner - Effect runner.
 * @returns void.
 */
function scheduleEffect(runner: EffectRunner): void {
  if (runner.disposed) {
    return;
  }

  if (runner.sync) {
    runner();
    return;
  }

  effectQueue.add(runner);

  if (batchDepth === 0) {
    queueFlush(runner.schedulerMode);
  }
}

/** Queues one scheduler flush. */
function queueFlush(mode: SchedulerMode | undefined = undefined): void {
  if (flushQueued) {
    if (queuedFlushMode !== "microtask" && mode === "microtask") queuedFlushMode = "microtask";
    return;
  }

  flushQueued = true;
  queuedFlushMode = mode && mode !== "sync" ? mode : schedulerMode;

  if (queuedFlushMode === "raf") {
    requestAnimationFrame(flushEffects);
    return;
  }

  if (queuedFlushMode === "idle" && "requestIdleCallback" in globalThis) {
    (globalThis as typeof globalThis & { requestIdleCallback(callback: () => void): number }).requestIdleCallback(flushEffects);
    return;
  }

  queueMicrotask(flushEffects);
}

/** Flushes queued effects with a recursion guard. */
function flushEffects(): void {
  flushQueued = false;
  queuedFlushMode = null;
  brotoDebugState.flushes += 1;

  let iterations = 0;

  while (effectQueue.size > 0) {
    if (iterations >= maxFlushIterations) {
      effectQueue.clear();
      throw new Error(`[Broto] Effect flush exceeded ${maxFlushIterations} iterations. Check for a signal write loop inside an effect.`);
    }

    iterations += 1;
    const queued: EffectRunner[] = [];
    for (const runner of effectQueue) {
      queued[queued.length] = runner;
    }
    effectQueue.clear();

    for (let index = 0; index < queued.length; index += 1) {
      const runner = queued[index];
      try {
        runner?.();
      } catch (error) {
        const owner = runner?.owner ?? null;
        if (!handleOwnerError(error, owner)) {
          throw error;
        }
      }
    }

    if (batchDepth > 0) {
      break;
    }
  }

  if (effectQueue.size > 0 && batchDepth === 0) {
    queueFlush();
  }
}


function hasPendingTasks(): boolean {
  return taskQueues["user-blocking"].size > 0 || taskQueues.normal.size > 0 || taskQueues.background.size > 0;
}

function queueTaskFlush(): void {
  if (taskFlushQueued) {
    return;
  }

  taskFlushQueued = true;

  if (schedulerMode === "raf") {
    requestAnimationFrame(flushTasks);
    return;
  }

  if (schedulerMode === "idle" && "requestIdleCallback" in globalThis) {
    (globalThis as typeof globalThis & { requestIdleCallback(callback: () => void): number }).requestIdleCallback(flushTasks);
    return;
  }

  queueMicrotask(flushTasks);
}

function flushTasks(): void {
  taskFlushQueued = false;

  const ordered: SchedulerPriority[] = ["user-blocking", "normal", "background"];

  for (let index = 0; index < ordered.length; index += 1) {
    const queue = taskQueues[ordered[index]];
    const tasks = Array.from(queue);
    queue.clear();

    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
      try {
        tasks[taskIndex]?.();
      } catch (error) {
        if (!handleOwnerError(error)) {
          throw error;
        }
      }
    }
  }

  if (hasPendingTasks()) {
    queueTaskFlush();
  }
}

/** Prunes disposed debug rows when debug retention is disabled. */
export function pruneDebugEntries(): void {
  if (brotoDebugState.retainDisposed) return;
  const maxEntries = brotoDebugState.maxEntries ?? 1000;
  let signalCount = 0;
  for (const entry of signalDebugEntries) {
    signalCount += 1;
    if (entry.disposed || signalCount > maxEntries) signalDebugEntries.delete(entry);
  }
  let effectCount = 0;
  for (const runner of effectDebugEntries) {
    effectCount += 1;
    if (runner.disposed || runner.owner.disposed || effectCount > maxEntries) effectDebugEntries.delete(runner);
  }
}

/**
 * Returns signal diagnostics without exposing live mutable internals.
 *
 * @returns Signal debug rows.
 *
 * @example
 * ```ts
 * console.table(inspectSignals());
 * ```
 */
export function inspectSignals(): SignalDebugSnapshot[] {
  pruneDebugEntries();
  const rows: SignalDebugSnapshot[] = [];
  for (const entry of signalDebugEntries) {
    rows[rows.length] = {
      id: entry.id,
      name: entry.name,
      reads: entry.reads,
      writes: entry.writes,
      subscribers: entry.subscribers.size,
      disposed: entry.disposed,
    };
  }
  return rows;
}

/**
 * Returns effect diagnostics for devtools and leak hunting.
 *
 * @returns Effect debug rows.
 */
export function inspectEffects(): EffectDebugSnapshot[] {
  pruneDebugEntries();
  const rows: EffectDebugSnapshot[] = [];
  for (const runner of effectDebugEntries) {
    rows[rows.length] = {
      id: runner.debugId ?? 'effect',
      name: runner.debugName,
      ownerId: runner.owner.id,
      ownerName: runner.owner.name,
      deps: runner.deps.length,
      cleanups: runner.cleanups.length,
      disposed: runner.disposed || runner.owner.disposed,
      sync: runner.sync,
      schedulerMode: runner.schedulerMode,
      runs: runner.runs ?? 0,
    };
  }
  return rows;
}

/**
 * Returns scheduler queue diagnostics.
 *
 * @returns Scheduler debug snapshot.
 */
export function inspectScheduler(): SchedulerDebugSnapshot {
  return {
    mode: schedulerMode,
    queuedEffects: effectQueue.size,
    queuedTasks: {
      'user-blocking': taskQueues['user-blocking'].size,
      normal: taskQueues.normal.size,
      background: taskQueues.background.size,
    },
    batchDepth,
    flushQueued,
    maxFlushIterations,
  };
}
