import { debug } from "@rodkisten/broto/debug";
import { getOwnerRoots, inspectOwnerGraph } from "@rodkisten/broto/owner";
import { inspectEffects, inspectScheduler, inspectSignals } from "@rodkisten/broto/reactivity";
import type { BrotoLeakRecord, BrotoLeakSnapshot, BrotoRuntimeSnapshot, Owner, OwnerGraphSnapshot } from "@rodkisten/broto/types";

/**
 * Creates a complete runtime snapshot for debug panels and devtools adapters.
 *
 * @remarks
 * This is intentionally read-only and allocation-aware: it snapshots counters,
 * owners, signals, effects and scheduler queues into plain JSON-compatible data
 * without exposing live Sets/Maps. It is safe to call from userscripts, tests and
 * UI inspectors. Existing APIs stay untouched, this is a pure additive surface.
 *
 * @param root - Optional owner root. When omitted, every known root owner is included.
 * @returns Serializable runtime snapshot.
 */
export function inspectRuntime(root?: Owner | null): BrotoRuntimeSnapshot {
  const roots: OwnerGraphSnapshot[] = [];

  if (root) {
    const single = inspectOwnerGraph(root);
    if (single) roots[roots.length] = single;
  } else {
    const knownRoots = getOwnerRoots();
    for (let index = 0; index < knownRoots.length; index += 1) {
      const snapshot = inspectOwnerGraph(knownRoots[index]);
      if (snapshot) roots[roots.length] = snapshot;
    }
  }

  return {
    debug: debug(),
    owners: roots,
    signals: inspectSignals(),
    effects: inspectEffects(),
    scheduler: inspectScheduler(),
  };
}

/** Flattens an owner graph into rows that are easy to render in tables. */
export function flattenOwnerGraph(graph: OwnerGraphSnapshot | null): Array<Omit<OwnerGraphSnapshot, "children"> & { depth: number; parentId: string | null }> {
  const rows: Array<Omit<OwnerGraphSnapshot, "children"> & { depth: number; parentId: string | null }> = [];
  if (!graph) return rows;
  appendOwnerRows(rows, graph, 0, null);
  return rows;
}

function appendOwnerRows(
  rows: Array<Omit<OwnerGraphSnapshot, "children"> & { depth: number; parentId: string | null }>,
  graph: OwnerGraphSnapshot,
  depth: number,
  parentId: string | null,
): void {
  rows[rows.length] = {
    id: graph.id,
    name: graph.name,
    disposed: graph.disposed,
    cleanups: graph.cleanups,
    context: graph.context,
    contexts: graph.contexts,
    errorHandlers: graph.errorHandlers,
    createdAt: graph.createdAt,
    descendants: graph.descendants,
    depth,
    parentId,
  };

  for (let index = 0; index < graph.children.length; index += 1) {
    appendOwnerRows(rows, graph.children[index], depth + 1, graph.id);
  }
}

/** Inspects likely lifecycle leaks without mutating the runtime. */
export function inspectLeaks(): BrotoLeakSnapshot {
  const runtime = inspectRuntime();
  const leaks: BrotoLeakRecord[] = [];
  let ownerCount = 0;

  for (let index = 0; index < runtime.owners.length; index += 1) {
    collectOwnerLeaks(runtime.owners[index], leaks);
    ownerCount += 1 + runtime.owners[index].descendants;
  }

  for (let index = 0; index < runtime.effects.length; index += 1) {
    const effect = runtime.effects[index];
    if (effect.disposed && (effect.deps > 0 || effect.cleanups > 0)) {
      leaks[leaks.length] = {
        id: effect.id,
        name: effect.name,
        kind: "effect",
        reason: "Disposed effect still retains deps or cleanups.",
        count: effect.deps + effect.cleanups,
      };
    }
  }

  for (let index = 0; index < runtime.signals.length; index += 1) {
    const signal = runtime.signals[index];
    if (signal.subscribers > 1000) {
      leaks[leaks.length] = {
        id: signal.id,
        name: signal.name,
        kind: "signal",
        reason: "Signal has an unusually high subscriber count.",
        count: signal.subscribers,
      };
    }
  }

  return {
    leaks,
    owners: ownerCount,
    effects: runtime.effects.length,
    signals: runtime.signals.length,
  };
}

function collectOwnerLeaks(owner: OwnerGraphSnapshot, leaks: BrotoLeakRecord[]): void {
  if (owner.disposed && (owner.cleanups > 0 || owner.children.length > 0)) {
    leaks[leaks.length] = {
      id: owner.id,
      name: owner.name,
      kind: "owner",
      reason: "Disposed owner still retains cleanups or children.",
      count: owner.cleanups + owner.children.length,
    };
  }

  for (let index = 0; index < owner.children.length; index += 1) {
    collectOwnerLeaks(owner.children[index], leaks);
  }
}
