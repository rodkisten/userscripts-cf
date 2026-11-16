import { captureDiagnostic } from "../diagnostics.js";

/** Capture errors from callbacks outside Solid's reactive ownership tree. */
export function createErrorGuard(script: string, onError?: (error: unknown) => void) {
  const report = (error: unknown, source: string): void => {
    captureDiagnostic(error, source, script);
    try {
      onError?.(error);
    } catch {
      /* never mask the original failure */
    }
  };

  return {
    report,
    /** For event listeners; preserves synchronous and asynchronous error reporting. */
    event<T extends Event>(callback: (event: T) => void | Promise<unknown>, source = "event") {
      return (event: T): void => {
        try {
          const result = callback(event);
          if (result && typeof (result as PromiseLike<unknown>).then === "function") {
            void Promise.resolve(result).catch((error) => report(error, source));
          }
        } catch (error) {
          report(error, source);
        }
      };
    },
    /** For timers, observers and callbacks that do not receive an Event. */
    callback<T extends unknown[]>(callback: (...args: T) => void | Promise<unknown>, source = "callback") {
      return (...args: T): void => {
        try {
          const result = callback(...args);
          if (result && typeof (result as PromiseLike<unknown>).then === "function") {
            void Promise.resolve(result).catch((error) => report(error, source));
          }
        } catch (error) {
          report(error, source);
        }
      };
    },
    /** Preserve rejection semantics for awaited work while reporting it once. */
    async promise<T>(operation: Promise<T> | (() => Promise<T>), source = "promise"): Promise<T> {
      try {
        return await (typeof operation === "function" ? operation() : operation);
      } catch (error) {
        report(error, source);
        throw error;
      }
    },
  };
}
