import { createSignal } from "solid-js";

/** Small immutable store for Solid 2; replaces the removed solid-js/store entrypoint. */
export function createStore<T extends object>(initial: T): [
  T,
  (...args: unknown[]) => void,
] {
  const [read, write] = createSignal<T>(initial, { equals: false });
  const wrap = (path: PropertyKey[]): unknown =>
    new Proxy(Array.isArray(path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown>)?.[k], read())) ? [] : {}, {
      get(_target, key) {
        if (key === "toJSON") return () => path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown>)?.[k], read());
        const value = [...path, key].reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown>)?.[k], read());
        if (typeof value === "function") {
          const owner = path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown>)?.[k], read());
          return value.bind(owner);
        }
        return value !== null && typeof value === "object" ? wrap([...path, key]) : value;
      },
      ownKeys() {
        const value = path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown>)?.[k], read());
        return value && typeof value === "object" ? Reflect.ownKeys(value) : [];
      },
      getOwnPropertyDescriptor(_target, key) {
        const value = path.reduce<unknown>((v, k) => (v as Record<PropertyKey, unknown>)?.[k], read());
        if (!value || typeof value !== "object") return undefined;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor ? { ...descriptor, configurable: true } : undefined;
      },
    });
  const set = (...args: unknown[]) => {
    const updater = args.pop();
    const path = args as PropertyKey[];
    write((previous) => {
      const root = Array.isArray(previous) ? [...previous] : { ...previous };
      let target: Record<PropertyKey, unknown> = root as Record<PropertyKey, unknown>;
      let source: unknown = previous;
      for (const key of path.slice(0, -1)) {
        source = (source as Record<PropertyKey, unknown>)?.[key];
        const copy = Array.isArray(source) ? [...source] : { ...(source as object ?? {}) };
        target[key] = copy;
        target = copy as Record<PropertyKey, unknown>;
      }
      const key = path[path.length - 1];
      const current = key === undefined ? previous : (source as Record<PropertyKey, unknown>)?.[key];
      const next = typeof updater === "function" ? (updater as (value: unknown) => unknown)(current) : updater;
      if (key === undefined) return next as T;
      target[key] = next;
      return root as T;
    });
  };
  return [wrap([]) as T, set];
}
