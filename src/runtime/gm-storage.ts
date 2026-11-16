export interface GMStorageAPI {
  available: boolean;
  get(key: string, fallback?: unknown): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

type NativeGetValue = (key: string, defaultValue?: unknown) => Promise<unknown> | unknown;
type NativeSetValue = (key: string, value: unknown) => Promise<void> | void;
type NativeDeleteValue = (key: string) => Promise<void> | void;

interface TampermonkeyAPI {
  getValue?: NativeGetValue;
  setValue?: NativeSetValue;
  deleteValue?: NativeDeleteValue;
  [key: string]: unknown;
}

type ExtendedWindow = Window &
  typeof globalThis & {
    GM?: TampermonkeyAPI;
    GM_getValue?: NativeGetValue;
    GM_setValue?: NativeSetValue;
    GM_deleteValue?: NativeDeleteValue;
  };

// The only userscript-facing boundary for GM storage APIs.
// Legacy callers retain their serialized JSON format during migration.
export function createGMStorage(host: ExtendedWindow = window as ExtendedWindow): GMStorageAPI {
  const modern = host.GM;

  const get: NativeGetValue | undefined =
    typeof modern?.getValue === "function" ? modern.getValue.bind(modern) : host.GM_getValue;

  const set: NativeSetValue | undefined =
    typeof modern?.setValue === "function" ? modern.setValue.bind(modern) : host.GM_setValue;

  const remove: NativeDeleteValue | undefined =
    typeof modern?.deleteValue === "function" ? modern.deleteValue.bind(modern) : host.GM_deleteValue;

  const available = typeof get === "function" && typeof set === "function";

  return Object.freeze({
    available,
    async get(key: string, fallback: unknown = null): Promise<unknown> {
      if (available && get) {
        try {
          return (await get(key, fallback)) ?? fallback;
        } catch {
          return fallback;
        }
      }
      try {
        return host.localStorage?.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      if (available && set) {
        return set(key, value);
      }
      if (!host.localStorage) throw new Error("Storage unavailable");
      host.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    },
    async delete(key: string): Promise<void> {
      if (typeof remove === "function") {
        return remove(key);
      }
      if (!host.localStorage) throw new Error("Storage unavailable");
      host.localStorage.removeItem(key);
    },
  });
}
