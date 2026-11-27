import { SIGNAL_SYMBOL } from "@rodkisten/broto/signal";

/**
 * Shared types for Broto, the reactive runtime used by Fábrica.
 *
 * @remarks
 * Broto owns dependency tracking, scheduling, writable signals, computed
 * values, effects, batching, stores, async resources and small graph helpers.
 * Keeping these types outside Fábrica lets the DOM renderer stay focused on
 * HTML/UI while other packages can reuse the same reactive primitives.
 */

/** Runs when an effect, resource or owner is disposed. */
export type Cleanup = () => void;

/** Owner options used by createRoot/createOwner. */
export type OwnerOptions = {
  id?: string;
  name?: string;
  parent?: Owner | null;
  onError?: OwnerErrorHandler;
};

/** Context token used by Broto owner trees. */
export type ContextToken<Value> = {
  readonly id: symbol;
  readonly description: string;
  readonly defaultValue?: Value;
  readonly required: boolean;
  readonly hasDefault: boolean;
  readonly kind: "context" | "reactive-context";
};

/** Context token whose value is a writable Broto signal. */
export type ReactiveContextToken<Value> = ContextToken<Signal<Value>> & {
  readonly kind: "reactive-context";
  readonly initialValue: Value;
};

/** Serializable context metadata exposed by owner diagnostics. */
export type ContextDebugSnapshot = {
  description: string;
  required: boolean;
  kind: ContextToken<unknown>["kind"];
};

/** Lifecycle owner used for effects, resources and UI component boundaries. */
export type OwnerErrorHandler = (error: unknown, owner: Owner) => void | boolean;

/** Result of resolving a context against an owner chain. */
export type ContextResolution<Value> = {
  readonly found: boolean;
  readonly owner: Owner | null;
  readonly value: Value;
};

/** Reusable persistent owner boundary. */
export type OwnerScope = {
  readonly owner: Owner;
  run<Value>(callback: () => Value): Value;
  dispose(): void;
};

export type Owner = {
  id: string;
  name?: string;
  parent: Owner | null;
  children: Set<Owner>;
  cleanups: Cleanup[];
  context: Map<ContextToken<unknown>, unknown>;
  errorHandlers: OwnerErrorHandler[];
  disposed: boolean;
  /** Creation timestamp from performance.now()/Date.now() for diagnostics. */
  createdAt: number;
};

/** Registers a cleanup callback in the currently running effect. */
export type CleanupRegistrar = (cleanup: Cleanup) => void;

/** A lazily evaluated value that may read signals. */
export type ReactiveExpression<Value> = () => Value;

/** Custom equality behavior for writable and derived signals. */
export type SignalOptions<Value> = {
  /** Pass false to always notify subscribers. */
  equals?: false | ((previousValue: Value, nextValue: Value) => boolean);
  /** Optional debug label surfaced by inspectRuntime()/inspectSignals(). */
  name?: string;
};

/** Reactive scheduler mode used by the fine-grained effect queue. */
export type SchedulerMode = "microtask" | "raf" | "idle" | "sync";

/** Priority used by scheduleTask(). */
export type SchedulerPriority = "user-blocking" | "normal" | "background";

/** Writable fine-grained signal. */
export type Signal<Value> = (() => Value) & {
  /** Stable non-enumerable runtime brand used by isSignal(). */
  readonly [SIGNAL_SYMBOL]: true;
  /** Stores a new value and notifies subscribers when it changed. */
  set(nextValue: Value): void;
  /** Updates the value from the current value. */
  update(updater: (currentValue: Value) => Value): void;
  /** Reads the value without tracking the current effect. */
  peek(): Value;
  /** Subscribes an effect runner directly. Mostly used internally. */
  subscribe(listener: EffectRunner): Cleanup;
};

/** Internal tracked effect runner. */
export type EffectRunner = (() => void) & {
  deps: Array<Set<EffectRunner>>;
  cleanups: Cleanup[];
  disposed: boolean;
  sync: boolean;
  schedulerMode?: SchedulerMode;
  owner: Owner;
  /** Optional debug name for diagnostics. */
  debugName?: string;
};

/** Effect options. */
export type EffectOptions = {
  sync?: boolean;
  /** Overrides the global scheduler for this effect. */
  scheduler?: SchedulerMode;
  name?: string;
};

/** Snapshot of Broto runtime counters. */
export type BrotoDebugOptions = {
  enabled?: boolean;
  retainDisposed?: boolean;
  maxEntries?: number;
};

export type BrotoLeakRecord = {
  id: string;
  name?: string;
  kind: 'owner' | 'effect' | 'signal';
  reason: string;
  count?: number;
};

export type BrotoLeakSnapshot = {
  leaks: BrotoLeakRecord[];
  owners: number;
  effects: number;
  signals: number;
};

export type BrotoDebugSnapshot = {
  enabled: boolean;
  signals: number;
  effects: number;
  computed: number;
  stores: number;
  resources: number;
  flushes: number;
  updates: number;
  retainDisposed?: boolean;
  maxEntries?: number;
};

/** Async resource state. */
export type ResourceState<Value, ErrorValue = unknown> = {
  loading: boolean;
  value: Value | undefined;
  error: ErrorValue | undefined;
  stale?: boolean;
};

/** Async resource controls. */
export type ResourceLoader<Value, Source = void> = (signal: AbortSignal, source: Source) => Promise<Value>;

export type ResourceOptions<Source = void> = {
  source?: Source | Signal<Source> | (() => Source);
  immediate?: boolean;
  cacheKey?: string | ((source: Source) => string);
  timeoutMs?: number;
  retries?: number;
  /** Optional polling interval in milliseconds. Disabled by default. */
  refreshIntervalMs?: number;
};

/** Async resource controls. */
export type Resource<Value, ErrorValue = unknown> = Signal<ResourceState<Value, ErrorValue>> & {
  reload(): Promise<Value | undefined>;
  retry(): Promise<Value | undefined>;
  mutate(value: Value | ((current: Value | undefined) => Value)): Value;
  abort(reason?: unknown): void;
  refreshInterval(ms: number): Cleanup;
  poll(ms: number): Cleanup;
};

/** Serializable owner graph node used by diagnostics and devtools. */
export type OwnerGraphSnapshot = {
  id: string;
  name?: string;
  disposed: boolean;
  cleanups: number;
  context: number;
  contexts: ContextDebugSnapshot[];
  errorHandlers: number;
  createdAt: number;
  descendants: number;
  children: OwnerGraphSnapshot[];
};

/** Serializable signal diagnostics. */
export type SignalDebugSnapshot = {
  id: string;
  name?: string;
  reads: number;
  writes: number;
  subscribers: number;
  disposed: boolean;
};

/** Serializable effect diagnostics. */
export type EffectDebugSnapshot = {
  id: string;
  name?: string;
  ownerId: string;
  ownerName?: string;
  deps: number;
  cleanups: number;
  disposed: boolean;
  sync: boolean;
  schedulerMode?: SchedulerMode;
  runs: number;
};

/** Serializable scheduler diagnostics. */
export type SchedulerDebugSnapshot = {
  mode: SchedulerMode;
  queuedEffects: number;
  queuedTasks: Record<SchedulerPriority, number>;
  batchDepth: number;
  flushQueued: boolean;
  maxFlushIterations: number;
};

/** Complete Broto runtime diagnostics snapshot. */
export type BrotoRuntimeSnapshot = {
  debug: BrotoDebugSnapshot;
  owners: OwnerGraphSnapshot[];
  signals: SignalDebugSnapshot[];
  effects: EffectDebugSnapshot[];
  scheduler: SchedulerDebugSnapshot;
};

/** Small graph edge used by debugging/devtools. */
export type GraphEdge = {
  from: string;
  to: string;
  label?: string;
};
