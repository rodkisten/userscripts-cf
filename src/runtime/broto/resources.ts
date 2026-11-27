import { brotoDebugState } from "@rodkisten/broto/debug";
import { getOwner, handleOwnerError, onOwnerCleanup, runWithOwner } from "@rodkisten/broto/owner";
import { effect, signal } from "@rodkisten/broto/reactivity";
import type { Resource, ResourceLoader, ResourceOptions, ResourceState } from "@rodkisten/broto/types";

const resourceCache = new Map<string, unknown>();

/**
 * Creates an owned async resource backed by a signal.
 *
 * @remarks
 * Resources are tied to the current Broto owner. When a component/effect/root is
 * disposed, the in-flight request is aborted and later results are ignored. The
 * upgraded resource supports reactive sources, optional cache keys, timeouts,
 * retries, stale-while-reload state and owner error propagation.
 *
 * @param loader - Async function used to load the value. Receives AbortSignal and source.
 * @param options - Resource options.
 * @returns Resource signal with reload and abort methods.
 *
 * @example Basic resource
 * ```ts
 * const profile = resource((signal) => fetch("/me", { signal }).then((r) => r.json()));
 * effect(() => {
 *   if (profile().loading) console.log("Loading...");
 * });
 * ```
 *
 * @example Reactive source and cache
 * ```ts
 * const userId = signal("rod");
 * const profile = resource(
 *   (abort, id) => fetch(`/users/${id}`, { signal: abort }).then((r) => r.json()),
 *   { source: userId, cacheKey: (id) => `user:${id}` },
 * );
 * userId.set("ana");
 * ```
 *
 * @example Output state
 * ```ts
 * profile();
 * // { loading: false, value: { name: "Rod" }, error: undefined, stale: false }
 * ```
 */
export function resource<Value, ErrorValue = unknown, Source = void>(
  loader: ResourceLoader<Value, Source>,
  options: ResourceOptions<Source> = {},
): Resource<Value, ErrorValue> {
  brotoDebugState.resources += 1;

  const owner = getOwner();
  let controller: AbortController | null = null;
  let version = 0;
  let disposed = false;
  let previousSource: Source | undefined;
  let intervalId: ReturnType<typeof globalThis.setInterval> | 0 = 0;

  const state = signal<ResourceState<Value, ErrorValue>>({
    loading: false,
    value: undefined,
    error: undefined,
    stale: false,
  });

  function readSource(): Source {
    const source = options.source;

    if (typeof source === "function") {
      return (source as () => Source)();
    }

    return source as Source;
  }

  function resolveCacheKey(source: Source): string | null {
    if (!options.cacheKey) {
      return null;
    }

    return typeof options.cacheKey === "function" ? options.cacheKey(source) : options.cacheKey;
  }

  function abort(reason?: unknown): void {
    controller?.abort(reason);
    controller = null;
  }

  async function runLoader(signal: AbortSignal, source: Source): Promise<Value> {
    const timeoutMs = options.timeoutMs;

    if (!timeoutMs || timeoutMs <= 0) {
      return loader(signal, source);
    }

    let timeoutId: ReturnType<typeof globalThis.setTimeout> | 0 = 0;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = globalThis.setTimeout(() => reject(new Error(`[Broto] Resource timed out after ${timeoutMs}ms.`)), timeoutMs);
    });

    try {
      return await Promise.race([loader(signal, source), timeout]);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  async function reload(): Promise<Value | undefined> {
    if (disposed) {
      return undefined;
    }

    abort("reload");
    const localVersion = ++version;
    controller = new AbortController();
    const source = readSource();
    previousSource = source;
    const cacheKey = resolveCacheKey(source);

    if (cacheKey && resourceCache.has(cacheKey)) {
      const value = resourceCache.get(cacheKey) as Value;
      state.set({ loading: false, value, error: undefined, stale: false });
      return value;
    }

    const previous = state.peek();
    state.set({ ...previous, loading: true, error: undefined, stale: previous.value !== undefined });

    const attempts = Math.max(1, (options.retries ?? 0) + 1);
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const value = await runLoader(controller.signal, source);

        if (disposed || localVersion !== version || controller.signal.aborted) {
          return undefined;
        }

        if (cacheKey) {
          resourceCache.set(cacheKey, value);
        }

        state.set({ loading: false, value, error: undefined, stale: false });
        return value;
      } catch (error) {
        lastError = error;

        if (disposed || localVersion !== version || controller.signal.aborted) {
          return undefined;
        }
      }
    }

    state.set({ loading: false, value: state.peek().value, error: lastError as ErrorValue, stale: false });

    if (owner) {
      handleOwnerError(lastError, owner);
    }

    return undefined;
  }

  function mutate(value: Value | ((current: Value | undefined) => Value)): Value {
    const previous = state.peek();
    const nextValue = typeof value === "function" ? (value as (current: Value | undefined) => Value)(previous.value) : value;
    state.set({ loading: false, value: nextValue, error: undefined, stale: false });
    return nextValue;
  }

  function refreshInterval(ms: number) {
    if (intervalId) {
      globalThis.clearInterval(intervalId);
      intervalId = 0;
    }

    if (!Number.isFinite(ms) || ms <= 0) {
      return () => {};
    }

    intervalId = globalThis.setInterval(() => {
      void reload();
    }, ms);

    return () => {
      if (intervalId) {
        globalThis.clearInterval(intervalId);
        intervalId = 0;
      }
    };
  }

  onOwnerCleanup(() => {
    disposed = true;
    if (intervalId) {
      globalThis.clearInterval(intervalId);
      intervalId = 0;
    }
    abort("dispose");
  });

  if (options.source !== undefined) {
    const stop = effect(() => {
      const nextSource = readSource();
      if (Object.is(previousSource, nextSource) && previousSource !== undefined) {
        return;
      }
      void reload();
    }, { name: "resource.source" });

    onOwnerCleanup(stop);
  } else if (options.immediate !== false) {
    if (owner) {
      runWithOwner(owner, () => void reload());
    } else {
      void reload();
    }
  }

  if (options.refreshIntervalMs && options.refreshIntervalMs > 0) {
    const stopRefresh = refreshInterval(options.refreshIntervalMs);
    onOwnerCleanup(stopRefresh);
  }

  const output = state as Resource<Value, ErrorValue>;
  output.reload = reload;
  output.retry = reload;
  output.mutate = mutate;
  output.abort = abort;
  output.refreshInterval = refreshInterval;
  output.poll = refreshInterval;

  return output;
}
