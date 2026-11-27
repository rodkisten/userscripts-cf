import { brotoDebugState } from "@rodkisten/broto/debug";
import { batch, computed } from "@rodkisten/broto/reactivity";
import { signal } from "@rodkisten/broto/reactivity";
import { isSignal, SIGNAL_SYMBOL } from "@rodkisten/broto/signal";
import type { Signal } from "@rodkisten/broto/types";

/** Primitive values that stay as writable signals inside a Broto store. */
type Primitive = string | number | boolean | bigint | symbol | null | undefined | Function | Date | RegExp;

/** Store path key used by patch diagnostics and deep writes. */
export type StorePath = readonly PropertyKey[];

/** Array or dot/bracket string accepted by public path APIs. */
export type StorePathInput = StorePath | string;

/** Patch metadata used by devtools and diagnostics. */
export type StorePatchMeta = {
  /** Optional human-readable reason for the mutation. */
  cause?: string;
  /** Optional path attached to path writes. Root patches infer changed paths. */
  path?: StorePath;
};

/** Patch event emitted to store subscribers. */
export type StorePatchEvent<State = unknown> = {
  /** Mutation kind. */
  type: "set" | "patch" | "update" | "path:set";
  /** Optional caller-provided cause. */
  cause?: string;
  /** Path written directly, when available. */
  path?: StorePath;
  /** Partial patch or replacement value used by the mutation. */
  patch: unknown;
  /** Plain snapshot after the mutation. */
  state: State;
};

/** Store subscriber cleanup. */
export type StoreUnsubscribe = () => void;

/** Store subscriber callback. */
export type StoreSubscriber<State> = (event: StorePatchEvent<State>) => void;

/** Store middleware receives each mutation event before subscribers. */
export type StoreMiddleware<State extends Record<string, unknown> = Record<string, unknown>> = (
  event: StorePatchEvent<State>,
  api: { readonly snapshot: () => State; readonly store: Store<State> },
  next: (event: StorePatchEvent<State>) => void,
) => void;

/** Devtools adapter event emitted after middleware processing. */
export type StoreDevtoolsListener<State extends Record<string, unknown> = Record<string, unknown>> = (event: StorePatchEvent<State>) => void;

/** Optional store creation hooks for middleware and external devtools panels. */
export interface StoreOptions<State extends Record<string, unknown>> {
  readonly name?: string;
  readonly middleware?: readonly StoreMiddleware<State>[];
  readonly devtools?: boolean | { readonly name?: string; readonly listener?: StoreDevtoolsListener<State> };
}

/** Recursively turns plain object leaves into signals while keeping nested objects reactive. */
export type DeepStoreValue<Value> = [Value] extends [Primitive]
  ? Signal<Value>
  : Value extends readonly (infer Item)[]
    ? Signal<Value> & { atSignal(index: number): DeepStoreValue<Item> | undefined }
    : Value extends Record<string, unknown>
      ? DeepStore<Value>
      : Signal<Value>;

/** Reactive store made from nested signals. */
export type DeepStore<State extends Record<string, unknown>> = (() => State) & {
  readonly [Key in keyof State]: DeepStoreValue<State[Key]>;
} & {
  /** Reads a tracked plain snapshot by calling every nested signal. */
  (): State;
  /** Reads a plain snapshot without subscribing to every field. */
  snapshot(): State;
  /** Alias for snapshot(), useful where signal-like APIs expose peek(). */
  peek(): State;
  /** JSON serialization hook. */
  toJSON(): State;
  /** Applies a deep partial patch. New keys are created on demand. */
  patch(nextState: DeepPartial<State> | StorePatchUpdater<State>, meta?: StorePatchMeta): void;
  /** Mutates a plain draft snapshot and patches the store in one batch. */
  update(mutator: StorePatchMutator<State>, meta?: StorePatchMeta): void;
  /** Alias for update(), matching the Broto snapshot/draft/peek flow. */
  draft(mutator: StorePatchMutator<State>, meta?: StorePatchMeta): void;
  /** Replaces the whole root state, or writes a nested path for backwards compatibility. */
  set(nextState: State | StorePathInput, valueOrMeta?: unknown, meta?: StorePatchMeta): void;
  /** Writes a nested path, creating intermediate plain object stores as needed. */
  setPath(path: StorePathInput, value: unknown, meta?: StorePatchMeta): void;
  /** Reads a nested signal/store by path. */
  get(path: StorePathInput): unknown;
  /** Reads a tracked value by path, resolving signals/stores to plain values. */
  select(path: StorePathInput): unknown;
  /** Creates or reads a computed path selector that can be rendered directly by Fabrica. */
  $(path: StorePathInput | StoreSelector<State>): Signal<unknown>;
  /** Alias for $(), useful when the selector is path-shaped. */
  path(path: StorePathInput): Signal<unknown>;
  /** Proxy of computed path signals, e.g. state.view.user.name renders reactively without calling it. */
  readonly view: StoreView<State>;
  /** Subscribes to root set/patch/update/path events. */
  subscribe(listener: StoreSubscriber<State>): StoreUnsubscribe;
  /** Adds middleware after store creation. */
  use(listener: StoreMiddleware<State>): StoreUnsubscribe;
  /** Subscribes an external devtools panel to post-middleware mutation events. */
  subscribeDevtools(listener: StoreDevtoolsListener<State>): StoreUnsubscribe;
};

/** Backwards compatible public store type. */
export type Store<State extends Record<string, unknown>> = DeepStore<State>;

/** Deep partial helper for patch(). */
export type DeepPartial<Value> = [Value] extends [Primitive]
  ? Value
  : Value extends readonly unknown[]
    ? Value
    : Value extends Record<string, unknown>
      ? { [Key in keyof Value]?: DeepPartial<Value[Key]> }
      : Value;


/** Selector used by store.$() for computed reads over a plain tracked snapshot. */
export type StoreSelector<State extends Record<string, unknown>> = (state: State) => unknown;

/** Read/write computed signal returned by store.view path proxies. */
export type StorePathSignal<Value = unknown> = Signal<Value> & {
  /** Writes the represented store path. */
  set(nextValue: Value): void;
  /** Updates the represented store path from its current value. */
  update(updater: (currentValue: Value) => Value): void;
};

/** Deep proxy whose leaves are computed signals backed by a store path. */
export type StoreView<Value> = [Value] extends [Primitive]
  ? StorePathSignal<Value>
  : Value extends readonly (infer Item)[]
    ? StorePathSignal<Value> & { readonly [index: number]: StoreView<Item> }
    : Value extends Record<string, unknown>
      ? StorePathSignal<Value> & { readonly [Key in keyof Value]: StoreView<Value[Key]> }
      : StorePathSignal<Value>;

/** Patch updater can mutate the draft or return a partial object. */
export type StorePatchUpdater<State extends Record<string, unknown>> = (draft: State) => DeepPartial<State> | void;

/** Update mutator receives a full plain draft snapshot. */
export type StorePatchMutator<State extends Record<string, unknown>> = (draft: State) => void | State | DeepPartial<State>;

/** Internal store marker. */
const STORE_MARKER = Symbol("broto.store");
const STORE_KEYS = new WeakMap<object, Set<string>>();
const STORE_NOTIFY = new WeakMap<object, (event: StorePatchEvent) => void>();
const STORE_VERSION = new WeakMap<object, Signal<number>>();

/**
 * Creates a deep object store from writable signals.
 *
 * @remarks
 * Stores are deliberately built without Proxy. Each plain object becomes a
 * callable branch whose primitive leaves are writable signals. Calling any
 * branch, such as `state.user()` or `state.plugins.filters()`, returns a
 * tracked plain snapshot. Use `peek()` or `snapshot()` when you need a
 * non-tracked read for diagnostics, persistence or event payloads.
 *
 * `patch()` does a controlled deep merge: nested objects patch nested stores,
 * primitive leaves update existing signals, arrays are replaced as arrays and
 * missing keys are created on demand. Every public mutation is automatically
 * batched so effects only rerun once per patch/update/set call.
 *
 * @param initialState - Initial object state.
 * @returns Store with one signal/store per key.
 *
 * @example Deep patch
 * ```ts
 * const state = store({ panel: { open: false, rect: { width: 520, x: 10 } } });
 * state.patch({ panel: { open: true, rect: { width: 640 } } }, { cause: "resize" });
 * state.panel.rect.x();
 * // 10
 * state.panel.rect.width();
 * // 640
 * ```
 *
 * @example Draft update
 * ```ts
 * state.draft((draft) => {
 *   draft.panel.open = false;
 *   draft.panel.rect.width = 320;
 * });
 * ```
 */
export function store<State extends Record<string, unknown>>(initialState: State, options: StoreOptions<State> = {}): Store<State> {
  brotoDebugState.stores += 1;
  const subscribers = new Set<StoreSubscriber<State>>();
  const middleware = Array.isArray(options.middleware) ? options.middleware.slice() : [];
  const devtoolsListeners = new Set<StoreDevtoolsListener<State>>();
  let root: Record<string, unknown>;

  if (typeof options.devtools === "object" && typeof options.devtools.listener === "function") {
    devtoolsListeners.add(options.devtools.listener);
  }

  const dispatchSubscribers = (event: StorePatchEvent<State>): void => {
    for (const listener of devtoolsListeners) listener(event);
    const pending: StoreSubscriber<State>[] = [];
    for (const subscriber of subscribers) pending[pending.length] = subscriber;
    for (let index = 0; index < pending.length; index += 1) pending[index]?.(event);
  };

  const notify = (event: StorePatchEvent): void => {
    const typedEvent = event as StorePatchEvent<State>;
    if (middleware.length === 0) {
      dispatchSubscribers(typedEvent);
      return;
    }

    let cursor = -1;
    const api = { snapshot: () => (root as Store<State>).snapshot(), store: root as Store<State> };
    const next = (nextEvent: StorePatchEvent<State>): void => {
      cursor += 1;
      const fn = middleware[cursor];
      if (fn) fn(nextEvent, api, next);
      else dispatchSubscribers(nextEvent);
    };
    next(typedEvent);
  };

  root = createStoreObject(initialState, [], notify) as Record<string, unknown>;
  installRootStoreApi(root, subscribers, notify, middleware as StoreMiddleware<State>[], devtoolsListeners);

  return root as Store<State>;
}

/** Alias for store(), useful for code that names Broto stores explicitly. */
export const createDeepStore = store;

function createStoreObject(
  initialState: Record<string, unknown>,
  basePath: StorePath,
  notify: (event: StorePatchEvent) => void,
): Record<string, unknown> {
  const keys = new Set<string>();
  const output = function readStoreBranch() {
    return readStoreObject(output as Record<string, unknown>, keys);
  } as unknown as Record<string, unknown>;

  Object.defineProperty(output, STORE_MARKER, { value: true, enumerable: false });
  STORE_KEYS.set(output, keys);
  STORE_NOTIFY.set(output, notify);
  STORE_VERSION.set(output, signal(0));

  for (const key in initialState) {
    keys.add(key);
    writeStoreKey(output, key, createStoreValue(initialState[key], appendPath(basePath, key), notify));
  }

  Object.defineProperties(output, {
    snapshot: {
      enumerable: false,
      value() {
        return snapshotStoreObject(output, keys);
      },
    },
    peek: {
      enumerable: false,
      value() {
        return snapshotStoreObject(output, keys);
      },
    },
    toJSON: {
      enumerable: false,
      value() {
        return snapshotStoreObject(output, keys);
      },
    },
    patch: {
      enumerable: false,
      value(nextState: Record<string, unknown> | StorePatchUpdater<Record<string, unknown>>, meta: StorePatchMeta = {}) {
        const patch = resolvePatchInput(output, nextState);
        if (!isPlainObject(patch)) return;
        batch(() => patchStoreObject(output, keys, patch, basePath, meta, notify));
        notify({ type: "patch", cause: meta.cause, path: meta.path, patch, state: snapshotStoreObject(output, keys) });
      },
    },
    update: {
      enumerable: false,
      value(mutator: StorePatchMutator<Record<string, unknown>>, meta: StorePatchMeta = {}) {
        if (typeof mutator !== "function") return;
        const draft = snapshotStoreObject(output, keys);
        const returned = mutator(draft as never);
        const patch = isPlainObject(returned) ? returned : draft;
        batch(() => patchStoreObject(output, keys, patch, basePath, meta, notify));
        notify({ type: "update", cause: meta.cause, path: meta.path, patch, state: snapshotStoreObject(output, keys) });
      },
    },
    draft: {
      enumerable: false,
      value(mutator: StorePatchMutator<Record<string, unknown>>, meta: StorePatchMeta = {}) {
        if (typeof mutator !== "function") return;
        const draft = snapshotStoreObject(output, keys);
        const returned = mutator(draft as never);
        const patch = isPlainObject(returned) ? returned : draft;
        batch(() => patchStoreObject(output, keys, patch, basePath, meta, notify));
        notify({ type: "update", cause: meta.cause, path: meta.path, patch, state: snapshotStoreObject(output, keys) });
      },
    },
    get: {
      enumerable: false,
      value(path: StorePathInput) {
        return getStorePath(output, path);
      },
    },
    select: {
      enumerable: false,
      value(path: StorePathInput) {
        return readStoreSelection(output, normalizeStorePath(path));
      },
    },
    $: {
      enumerable: false,
      value(pathOrSelector: StorePathInput | StoreSelector<Record<string, unknown>>) {
        if (typeof pathOrSelector === "function") {
          return computed(() => pathOrSelector(readStoreObject(output, keys)));
        }

        const path = normalizeStorePath(pathOrSelector);
        return createStorePathSignal(output, keys, path, notify);
      },
    },
    path: {
      enumerable: false,
      value(path: StorePathInput) {
        return createStorePathSignal(output, keys, normalizeStorePath(path), notify);
      },
    },
    view: {
      enumerable: false,
      get() {
        return createStoreViewProxy(output, keys, [], notify);
      },
    },
    set: {
      enumerable: false,
      value(nextStateOrPath: Record<string, unknown> | StorePathInput, valueOrMeta?: unknown, maybeMeta: StorePatchMeta = {}) {
        if (typeof nextStateOrPath === "string" || Array.isArray(nextStateOrPath)) {
          const meta = maybeMeta;
          const path = normalizeStorePath(nextStateOrPath);
          batch(() => setStorePath(output, keys, path, valueOrMeta, { ...meta, path }, notify));
          notify({ type: "path:set", cause: meta.cause, path, patch: valueOrMeta, state: snapshotStoreObject(output, keys) });
          return;
        }

        if (!isPlainObject(nextStateOrPath)) return;
        const meta = isPlainObject(valueOrMeta) ? (valueOrMeta as StorePatchMeta) : {};
        batch(() => replaceStoreObject(output, keys, nextStateOrPath, basePath, notify));
        notify({ type: "set", cause: meta.cause, path: meta.path, patch: nextStateOrPath, state: snapshotStoreObject(output, keys) });
      },
    },
    setPath: {
      enumerable: false,
      value(pathInput: StorePathInput, value: unknown, meta: StorePatchMeta = {}) {
        const path = normalizeStorePath(pathInput);
        batch(() => setStorePath(output, keys, path, value, { ...meta, path }, notify));
        notify({ type: "path:set", cause: meta.cause, path, patch: value, state: snapshotStoreObject(output, keys) });
      },
    },
  });

  return output;
}

function installRootStoreApi<State extends Record<string, unknown>>(
  root: Record<string, unknown>,
  subscribers: Set<StoreSubscriber<State>>,
  notify: (event: StorePatchEvent) => void,
  middleware: StoreMiddleware<State>[],
  devtoolsListeners: Set<StoreDevtoolsListener<State>>,
): void {
  STORE_NOTIFY.set(root, notify);

  Object.defineProperties(root, {
    subscribe: {
      enumerable: false,
      value(listener: StoreSubscriber<State>): StoreUnsubscribe {
        if (typeof listener !== "function") return () => {};
        subscribers.add(listener);
        return () => { subscribers.delete(listener); };
      },
    },
    use: {
      enumerable: false,
      value(fn: StoreMiddleware<State>): StoreUnsubscribe {
        if (typeof fn !== "function") return () => {};
        middleware.push(fn);
        return () => {
          const index = middleware.indexOf(fn);
          if (index >= 0) middleware.splice(index, 1);
        };
      },
    },
    subscribeDevtools: {
      enumerable: false,
      value(listener: StoreDevtoolsListener<State>): StoreUnsubscribe {
        if (typeof listener !== "function") return () => {};
        devtoolsListeners.add(listener);
        return () => { devtoolsListeners.delete(listener); };
      },
    },
  });
}

function createStoreValue(value: unknown, path: StorePath, notify: (event: StorePatchEvent) => void): unknown {
  if (isPlainObject(value)) return createStoreObject(value as Record<string, unknown>, path, notify);
  if (Array.isArray(value)) return createArraySignal(value, path, notify);
  return signal(value);
}

function createArraySignal(value: unknown[], path: StorePath, notify: (event: StorePatchEvent) => void): Signal<unknown[]> & { atSignal(index: number): unknown } {
  const source = signal(value.slice()) as Signal<unknown[]> & { atSignal(index: number): unknown };
  const itemStores = new Map<number, unknown>();

  source.atSignal = (index: number): unknown => {
    const list = source.peek();
    if (index < 0 || index >= list.length) return undefined;
    if (!itemStores.has(index)) itemStores.set(index, createStoreValue(list[index], appendPath(path, index), notify));
    return itemStores.get(index);
  };

  return source;
}

function patchStoreObject(
  target: Record<string, unknown>,
  keys: Set<string>,
  patch: Record<string, unknown>,
  basePath: StorePath,
  meta: StorePatchMeta,
  notify: (event: StorePatchEvent) => void,
): void {
  for (const key in patch) {
    applyStoreKey(target, keys, key, patch[key], { ...meta, path: appendPath(basePath, key) }, notify);
  }
}

function writeStoreKey(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function replaceStoreObject(
  target: Record<string, unknown>,
  keys: Set<string>,
  nextState: Record<string, unknown>,
  basePath: StorePath,
  notify: (event: StorePatchEvent) => void,
): void {
  let structureChanged = false;
  const existingKeys: string[] = [];
  for (const key of keys) existingKeys[existingKeys.length] = key;

  for (let index = 0; index < existingKeys.length; index += 1) {
    const key = existingKeys[index];
    if (key in nextState) continue;
    keys.delete(key);
    delete target[key];
    structureChanged = true;
  }

  for (const key in nextState) {
    replaceStoreKey(target, keys, key, nextState[key], appendPath(basePath, key), notify);
  }

  if (structureChanged) bumpStoreVersion(target);
}

function replaceStoreKey(
  target: Record<string, unknown>,
  keys: Set<string>,
  key: string,
  value: unknown,
  path: StorePath,
  notify: (event: StorePatchEvent) => void,
): void {
  const current = target[key];

  if (!keys.has(key)) {
    keys.add(key);
    writeStoreKey(target, key, createStoreValue(value, path, notify));
    bumpStoreVersion(target);
    return;
  }

  if (isStoreObject(current) && isPlainObject(value)) {
    replaceStoreObject(current as Record<string, unknown>, collectStoreKeys(current as Record<string, unknown>), value as Record<string, unknown>, path, notify);
    return;
  }

  if (isSignal(current)) {
    (current as Signal<unknown>).set(Array.isArray(value) ? value.slice() : value);
    return;
  }

  writeStoreKey(target, key, createStoreValue(value, path, notify));
}

function applyStoreKey(
  target: Record<string, unknown>,
  keys: Set<string>,
  key: string,
  value: unknown,
  meta: StorePatchMeta,
  notify: (event: StorePatchEvent) => void,
): void {
  const current = target[key];

  if (!keys.has(key)) {
    keys.add(key);
    writeStoreKey(target, key, createStoreValue(value, meta.path ?? [key], notify));
    bumpStoreVersion(target);
    return;
  }

  if (isStoreObject(current) && isPlainObject(value)) {
    const currentKeys = collectStoreKeys(current as Record<string, unknown>);
    patchStoreObject(current as Record<string, unknown>, currentKeys, value as Record<string, unknown>, meta.path ?? [key], meta, notify);
    return;
  }

  if (isSignal(current)) {
    (current as Signal<unknown>).set(Array.isArray(value) ? value.slice() : value);
    return;
  }

  writeStoreKey(target, key, createStoreValue(value, meta.path ?? [key], notify));
}

function getStorePath(root: Record<string, unknown>, path: StorePathInput): unknown {
  path = normalizeStorePath(path);
  let current: unknown = root;
  for (let index = 0; index < path.length; index += 1) {
    const key = path[index];
    if (isStoreObject(current)) current = (current as Record<PropertyKey, unknown>)[key];
    else if (isSignal(current)) current = (current as Signal<unknown>).peek();
    else return undefined;
  }
  return current;
}



function readStoreSelection(root: Record<string, unknown>, path: StorePath): unknown {
  const value = getStorePath(root, path);
  return readStoreValue(value);
}

function setStorePath(
  root: Record<string, unknown>,
  keys: Set<string>,
  path: StorePath,
  value: unknown,
  meta: StorePatchMeta,
  notify: (event: StorePatchEvent) => void,
): void {
  if (path.length === 0) {
    if (isPlainObject(value)) replaceStoreObject(root, keys, value, [], notify);
    return;
  }

  let current: Record<string, unknown> = root;
  let currentKeys = keys;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = String(path[index]);
    const next = current[key];
    if (!isStoreObject(next)) {
      currentKeys.add(key);
      writeStoreKey(current, key, createStoreObject({}, path.slice(0, index + 1), notify));
      bumpStoreVersion(current);
    }
    current = current[key] as Record<string, unknown>;
    currentKeys = collectStoreKeys(current);
  }

  applyStoreKey(current, currentKeys, String(path[path.length - 1]), value, meta, notify);
}

function collectStoreKeys(storeObject: Record<string, unknown>): Set<string> {
  let output = STORE_KEYS.get(storeObject);
  if (output) return output;
  output = new Set<string>();
  for (const key in storeObject) output.add(key);
  STORE_KEYS.set(storeObject, output);
  return output;
}

function readStoreObject(target: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  STORE_VERSION.get(target)?.();
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) snapshot[key] = readStoreValue(target[key]);
  return snapshot;
}

function readStoreValue(value: unknown): unknown {
  if (isStoreObject(value)) return (value as () => unknown)();
  if (isSignal(value)) {
    const rawValue = (value as Signal<unknown>)();
    return Array.isArray(rawValue) ? rawValue.slice() : rawValue;
  }
  return value;
}

function bumpStoreVersion(target: Record<string, unknown>): void {
  const version = STORE_VERSION.get(target);

  if (version) {
    version.set(version.peek() + 1);
  }
}

function snapshotStoreObject(target: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) snapshot[key] = snapshotValue(target[key]);
  return snapshot;
}

function snapshotValue(value: unknown): unknown {
  if (isStoreObject(value)) return (value as { snapshot(): unknown }).snapshot();
  if (isSignal(value)) {
    const rawValue = (value as Signal<unknown>).peek();
    return Array.isArray(rawValue) ? rawValue.slice() : rawValue;
  }
  return value;
}

function resolvePatchInput(target: Record<string, unknown>, input: Record<string, unknown> | StorePatchUpdater<Record<string, unknown>>): unknown {
  if (typeof input !== "function") return input;
  const keys = collectStoreKeys(target);
  const draft = snapshotStoreObject(target, keys);
  const returned = input(draft);
  return isPlainObject(returned) ? returned : draft;
}


function createStorePathSignal(
  root: Record<string, unknown>,
  keys: Set<string>,
  path: StorePath,
  notify: (event: StorePatchEvent) => void,
): StorePathSignal {
  const output = computed(() => readStoreSelection(root, path)) as StorePathSignal;

  output.set = (nextValue: unknown): void => {
    batch(() => setStorePath(root, keys, path, nextValue, { path }, notify));
    notify({ type: "path:set", path, patch: nextValue, state: snapshotStoreObject(root, keys) });
  };

  output.update = (updater: (currentValue: unknown) => unknown): void => {
    if (typeof updater !== "function") return;
    const nextValue = updater(output.peek());
    output.set(nextValue);
  };

  return output;
}

function createStoreViewProxy(
  root: Record<string, unknown>,
  keys: Set<string>,
  path: StorePath,
  notify: (event: StorePatchEvent) => void,
): StorePathSignal {
  const pathSignal = createStorePathSignal(root, keys, path, notify);
  const childCache = new Map<PropertyKey, unknown>();

  return new Proxy(pathSignal, {
    get(target, property, receiver) {
      if (property === SIGNAL_SYMBOL) return true;
      if (property === "then") return undefined;
      if (property === Symbol.toPrimitive) return () => stringifyStoreViewValue(target.peek());
      if (property === "toJSON") return () => target.peek();
      if (property === "toString") return () => stringifyStoreViewValue(target.peek());
      if (property === "set" || property === "update" || property === "peek" || property === "subscribe" || property === "use" || property === "subscribeDevtools") {
        return Reflect.get(target, property, receiver);
      }

      const cached = childCache.get(property);
      if (cached) return cached;

      const child = createStoreViewProxy(root, keys, appendPath(path, property), notify);
      childCache.set(property, child);
      return child;
    },
  });
}

function stringifyStoreViewValue(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function normalizeStorePath(path: StorePathInput): StorePath {
  if (Array.isArray(path)) return path;
  const text = String(path || "").trim();
  if (!text) return [];
  const output: PropertyKey[] = [];
  let token = "";
  let quote = "";
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) { token += char; escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) { quote = ""; continue; }
      token += char;
      continue;
    }

    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === ".") { pushPathToken(output, token); token = ""; continue; }
    if (char === "[") { pushPathToken(output, token); token = ""; continue; }
    if (char === "]") { pushPathToken(output, token); token = ""; continue; }
    token += char;
  }

  pushPathToken(output, token);
  return output;
}

function pushPathToken(output: PropertyKey[], token: string): void {
  const trimmed = token.trim();
  if (!trimmed) return;
  const numeric = Number(trimmed);
  output[output.length] = Number.isInteger(numeric) && String(numeric) === trimmed ? numeric : trimmed;
}

function appendPath(path: StorePath, key: PropertyKey): StorePath {
  const next = new Array<PropertyKey>(path.length + 1);
  for (let index = 0; index < path.length; index += 1) next[index] = path[index];
  next[path.length] = key;
  return next;
}



function isStoreObject(value: unknown): boolean {
  return Boolean(
    value &&
      (typeof value === "object" || typeof value === "function") &&
      (value as Record<PropertyKey, unknown>)[STORE_MARKER],
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
