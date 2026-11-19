export type RuntimeCleanup = () => void | Promise<void>;

export interface RuntimeCleanupScope {
  readonly disposed: boolean;
  add(cleanup: RuntimeCleanup): void;
  dispose(): Promise<void>;
}

/**
 * Owns per-instance cleanup callbacks.
 * - callbacks run once, in reverse registration order;
 * - concurrent dispose calls share the same promise;
 * - callbacks registered after disposal starts are executed immediately;
 * - one failing callback never prevents the remaining cleanups.
 */
export function createRuntimeCleanupScope(
  onError: (error: unknown) => void = (error) => console.error("[Userscripts CF cleanup]", error),
): RuntimeCleanupScope {
  const cleanups: RuntimeCleanup[] = [];
  let disposed = false;
  let disposal: Promise<void> | undefined;

  const run = async (cleanup: RuntimeCleanup): Promise<void> => {
    try {
      await cleanup();
    } catch (error) {
      onError(error);
    }
  };

  return {
    get disposed() {
      return disposed;
    },
    add(cleanup) {
      if (typeof cleanup !== "function") throw new TypeError("Cleanup must be a function");
      if (disposed) {
        void run(cleanup);
        return;
      }
      cleanups.push(cleanup);
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      const pending = cleanups.splice(0).reverse();
      disposal = (async () => {
        for (const cleanup of pending) await run(cleanup);
      })();
      return disposal;
    },
  };
}
