export type PortalTarget = Element | ShadowRoot;

export interface PortalEntry<TNode = unknown, TContext = unknown> {
  readonly id: number;
  readonly target: PortalTarget;
  readonly node: TNode;
  readonly context?: TContext;
  /** Once connected, a later detach means this portal is no longer owned by a live host. */
  readonly wasConnected: boolean;
}

export interface PortalRegistry<TNode = unknown, TContext = unknown> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReadonlyArray<PortalEntry<TNode, TContext>>;
  add(entry: Omit<PortalEntry<TNode, TContext>, "wasConnected">): void;
  remove(id: number): void;
  removeContext(context: TContext): void;
  pruneDisconnected(): ReadonlyArray<number>;
  clear(): void;
}

export function createPortalRegistry<TNode = unknown, TContext = unknown>(): PortalRegistry<
  TNode,
  TContext
> {
  const entries = new Map<number, PortalEntry<TNode, TContext>>();
  const listeners = new Set<() => void>();
  let snapshot: ReadonlyArray<PortalEntry<TNode, TContext>> = [];

  const publish = () => {
    snapshot = Array.from(entries.values());
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    add(entry) {
      entries.set(entry.id, { ...entry, wasConnected: entry.target.isConnected });
      publish();
    },
    remove(id) {
      if (entries.delete(id)) publish();
    },
    removeContext(context) {
      let changed = false;
      for (const [id, entry] of entries) {
        if (entry.context !== context) continue;
        entries.delete(id);
        changed = true;
      }
      if (changed) publish();
    },
    pruneDisconnected() {
      const removed: number[] = [];
      for (const [id, entry] of entries) {
        if (entry.target.isConnected) {
          if (!entry.wasConnected) entries.set(id, { ...entry, wasConnected: true });
          continue;
        }
        if (!entry.wasConnected) continue;
        entries.delete(id);
        removed.push(id);
      }
      if (removed.length) publish();
      return removed;
    },
    clear() {
      if (!entries.size) return;
      entries.clear();
      publish();
    },
  };
}
