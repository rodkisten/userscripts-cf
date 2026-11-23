/** Passive console subscription with one reversible wrapper per realm. */
export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
export interface ConsoleObservation {
  level: ConsoleLevel;
  time: string;
  args: unknown[];
}
type Listener = (event: ConsoleObservation) => void;
type Registry = {
  listeners: Set<Listener>;
  originals: Map<ConsoleLevel, (...args: unknown[]) => void>;
  wrappers: Map<ConsoleLevel, (...args: unknown[]) => void>;
};
const registries = new WeakMap<Console, Registry>();
const levels: readonly ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

export function observePageConsole(listener: Listener, host: Console = console): () => void {
  let registry = registries.get(host);
  if (!registry) {
    registry = { listeners: new Set(), originals: new Map(), wrappers: new Map() };
    registries.set(host, registry);
    for (const level of levels) {
      const original = host[level];
      const wrapped = function (this: Console, ...args: unknown[]): void {
        try {
          const observation: ConsoleObservation = {
            level,
            time: new Date().toISOString(),
            args,
          };
          for (const subscriber of [...registry!.listeners]) {
            try {
              subscriber(observation);
            } catch {
              /* Diagnostics must not break the page. */
            }
          }
        } finally {
          Reflect.apply(original, this, args);
        }
      };
      registry.originals.set(level, original);
      registry.wrappers.set(level, wrapped);
      try {
        host[level] = wrapped;
      } catch {
        /* Read-only console implementations. */
      }
    }
  }
  registry.listeners.add(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    registry!.listeners.delete(listener);
    if (registry!.listeners.size) return;
    for (const level of levels) {
      if (host[level] === registry!.wrappers.get(level)) {
        const original = registry!.originals.get(level);
        if (original)
          try {
            host[level] = original;
          } catch {
            /* Read-only console. */
          }
      }
    }
    registries.delete(host);
  };
}
