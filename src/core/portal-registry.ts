// ============================================================================
// TIPOS REUTILIZÁVEIS (Candidatos à extração)
// ============================================================================

// TODO(extract): Mover para `@shared/types/nominal.ts` (ou equivalente de utilitários de tipo).
// Garante segurança nominal para evitar mistura de IDs numéricos distintos em tempo de compilação.
export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

// TODO(extract): Mover para `@shared/reactivity/store.ts`.
// Contrato padrão compatível com `React.useSyncExternalStore` e stores reativas agnósticas de framework.
export type StoreListener = () => void;
export type Unsubscribe = () => void;

export interface SubscribableStore<TSnapshot> {
  subscribe(listener: StoreListener): Unsubscribe;
  getSnapshot(): TSnapshot;
}

// ============================================================================
// DOMÍNIO: PORTAL REGISTRY
// ============================================================================

// TODO(extract): Mover para `@shared/dom/types.ts` se outros módulos manipularem nós de montagem/DOM.
export type PortalTarget = Element | ShadowRoot;

export type PortalId = Brand<number, "PortalId">;

/** Helper opcional para criação segura de IDs tipados */
export const createPortalId = (id: number): PortalId => id as PortalId;

export interface PortalEntry<TNode = unknown, TContext = unknown> {
  readonly id: PortalId;
  readonly target: PortalTarget;
  readonly node: TNode;
  readonly context?: TContext;
  /** Once connected, a later detach means this portal is no longer owned by a live host. */
  readonly wasConnected: boolean;
}

export type NewPortalEntry<TNode = unknown, TContext = unknown> = Omit<
  PortalEntry<TNode, TContext>,
  "wasConnected"
>;

export interface PortalRegistry<TNode = unknown, TContext = unknown> extends SubscribableStore<
  ReadonlyArray<PortalEntry<TNode, TContext>>
> {
  add(entry: NewPortalEntry<TNode, TContext>): void;
  remove(id: PortalId): boolean;
  removeContext(context: TContext): number;
  pruneDisconnected(connectedTargets?: ReadonlySet<PortalTarget>): ReadonlyArray<PortalId>;
  clear(): void;
}

const EMPTY_TARGETS: ReadonlySet<PortalTarget> = new Set();

export function createPortalRegistry<TNode = unknown, TContext = unknown>(): PortalRegistry<TNode, TContext> {
  const entries = new Map<PortalId, PortalEntry<TNode, TContext>>();
  const listeners = new Set<StoreListener>();
  let snapshot: ReadonlyArray<PortalEntry<TNode, TContext>> = Object.freeze([]);

  const publish = (): void => {
    snapshot = Object.freeze(Array.from(entries.values()));
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,

    add(entry) {
      entries.set(entry.id, {
        ...entry,
        wasConnected: entry.target.isConnected,
      });
      publish();
    },

    remove(id) {
      const deleted = entries.delete(id);
      if (deleted) {
        publish();
      }
      return deleted;
    },

    removeContext(context) {
      let removedCount = 0;

      for (const [id, entry] of entries) {
        if (Object.is(entry.context, context)) {
          entries.delete(id);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        publish();
      }

      return removedCount;
    },

    pruneDisconnected(connectedTargets = EMPTY_TARGETS) {
      const removed: PortalId[] = [];
      let stateMutated = false;

      for (const [id, entry] of entries) {
        const isCurrentlyConnected = entry.target.isConnected;
        const wasEverConnected =
          entry.wasConnected || isCurrentlyConnected || connectedTargets.has(entry.target);

        if (!wasEverConnected) {
          continue;
        }

        if (isCurrentlyConnected) {
          if (!entry.wasConnected) {
            entries.set(id, { ...entry, wasConnected: true });
            stateMutated = true;
          }
          continue;
        }

        entries.delete(id);
        removed.push(id);
        stateMutated = true;
      }

      if (stateMutated) {
        publish();
      }

      return Object.freeze(removed);
    },

    clear() {
      if (entries.size === 0) {
        return;
      }
      entries.clear();
      publish();
    },
  };
}
