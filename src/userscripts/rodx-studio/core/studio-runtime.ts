import type { ScriptContext } from "../../../core/runtime.js";
import { readLegacyPageJSON } from "../../../runtime/modular/features/legacy-storage.js";
import { RUNTIME_LIMITS, STUDIO_RANGES } from "../../../config/runtime.js";
import { createDefaults } from "../../../config/defaults.js";
import { XDOM } from "../platform/selectors.js";

// ============================================================================
// Tipos e Interfaces
// ============================================================================
export type StudioConfig = ReturnType<typeof createDefaults>["studio"] & {
  budgetMs: number;
  scanDelayMs: number;
  maintenanceMs: number;
  homeListLimit: number;
  [key: string]: unknown;
};

export interface NetworkState {
  ready: boolean;
  authReady: boolean;
  error: string;
}

export interface StudioState {
  config: StudioConfig;
  network: NetworkState;
  route: string;
  [key: string]: unknown;
}

export type EventCallback = (data?: unknown) => void;
export type JobFunction = () => void | Promise<unknown>;

export interface JobDefinition {
  fn: JobFunction;
  events: string[];
  group: string;
  minMs: number;
  last: number;
  running: boolean;
  again: boolean;
}

export interface JobStats {
  calls: number;
  ms: number;
  errors: number;
}

export interface RegisterOptions {
  events?: string[];
  group?: string;
  minMs?: number;
}

export interface DiagnosticInfo {
  version: string;
  network: NetworkState;
  selectors: {
    tweets: number;
    userCells: number;
    primaryColumnFound: boolean;
    nativeSearchFound: boolean;
  };
  modules: Record<string, { calls: number; ms: number; errors: number }>;
  queued: number;
  domGeneration: number;
}

export interface StudioRuntime {
  state: StudioState;
  config: StudioConfig;
  on(type: string, fn: EventCallback): () => void;
  emit(type: string, data?: unknown): void;
  slice<T>(name: string, value: T): T;
  register(id: string, fn: JobFunction, options?: RegisterOptions): () => void;
  invalidate(reason?: string): void;
  queue(id: string): void;
  enabled(group: string): boolean;
  dom: {
    nodes(selector: string): Element[];
  };
  start(): void;
  configure(patch: Partial<StudioConfig>): void;
  diagnostics(): DiagnosticInfo;
  services: Record<string, unknown>;
  ctx?: ScriptContext;
}

// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const CONFIG_STORAGE_KEY = "rodx:studio:runtime:v3";
const STUDIO_SECTION_NAME = "studio";
const DEFAULT_ROUTE_REASON = "dom";
const STUDIO_LOGGER_TAG = "[RodX Studio]";
const STUDIO_VERSION = "3.7.0";

const OWN_SELECTOR = [
  "#rodx-search-deck-root",
  "#rodx-search-deck-dock",
  "#rodx-navigation-strip",
  "#rodx-feed-filters",
  "#rodx-active-tweetbar",
  "#x-lists-studio-root",
  "#rodx-profile-lists",
  "#rodx-list-id",
  "#rodx-floating-search",
  ".rodx-quick-search",
  "[data-rod-menu-host]",
  "[data-rodx-list-video]",
].join(",");

// TODO: create useRuntime() ou useContext() pra usar isso certo
export function createStudioRuntime(): StudioRuntime {
  const defaults = createDefaults(STUDIO_SECTION_NAME);
  const saved: Record<string, unknown> = {};

  const config: StudioConfig = {
    ...defaults,
    ...saved,
    feedDefaults: {
      ...defaults.feedDefaults,
      ...((saved.feedDefaults as Record<string, unknown>) || {}),
    },
    modules: {
      ...defaults.modules,
      ...((saved.modules as Record<string, boolean>) || {}),
    },
    budgetMs: Math.max(
      STUDIO_RANGES.budgetMs.min,
      Math.min(STUDIO_RANGES.budgetMs.max, Number(saved.budgetMs) || defaults.budgetMs),
    ),
    scanDelayMs: Math.max(
      STUDIO_RANGES.scanDelayMs.min,
      Math.min(STUDIO_RANGES.scanDelayMs.max, Number(saved.scanDelayMs) || defaults.scanDelayMs),
    ),
    maintenanceMs: Math.max(
      STUDIO_RANGES.maintenanceMs.min,
      Number(saved.maintenanceMs) || defaults.maintenanceMs,
    ),
    homeListLimit: Math.max(
      STUDIO_RANGES.homeListLimit.min,
      Math.min(STUDIO_RANGES.homeListLimit.max, Number(saved.homeListLimit) || defaults.homeListLimit),
    ),
  };

  const state: StudioState = {
    config,
    network: {
      ready: false,
      authReady: false,
      error: "",
    },
    route: location.pathname + location.search,
  };

  const listeners = new Map<string, Set<EventCallback>>();
  const jobs = new Map<string, JobDefinition>();
  const pending = new Set<string>();
  const stats = new Map<string, JobStats>();
  const cache = new Map<string, { generation: number; nodes: Element[] }>();

  let drainTimer = 0;
  let domTimer = 0;
  let started = false;
  let configEdited = false;
  let persistenceQueue: Promise<void> = Promise.resolve();
  let generation = 0;

  function on(type: string, fn: EventCallback): () => void {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
    return () => {
      listeners.get(type)?.delete(fn);
    };
  }

  function emit(type: string, data?: unknown): void {
    for (const fn of listeners.get(type) || []) {
      try {
        fn(data);
      } catch (e) {
        console.warn(STUDIO_LOGGER_TAG, type, e);
      }
    }
  }

  function slice<T>(name: string, value: T): T {
    if (state[name] !== undefined) return state[name] as T;
    state[name] = value;
    return value;
  }

  function enabled(group: string): boolean {
    return !group || config.modules[group] !== false;
  }

  function queue(id: string): void {
    if (!jobs.has(id)) return;
    pending.add(id);
    if (!drainTimer && !document.hidden) {
      drainTimer = window.setTimeout(drain, config.scanDelayMs);
    }
  }

  function invalidate(reason: string = DEFAULT_ROUTE_REASON): void {
    if (reason === "dom" || reason === "route") {
      generation++;
      cache.clear();
    }
    for (const [id, job] of jobs) {
      if (job.events.includes(reason)) queue(id);
    }
    emit(reason, state.route);
  }

  function register(
    id: string,
    fn: JobFunction,
    { events = ["dom", "route", "state", "maintenance"], group = "", minMs = 0 }: RegisterOptions = {},
  ): () => void {
    if (jobs.has(id)) throw Error("Duplicate module: " + id);

    jobs.set(id, {
      fn,
      events,
      group,
      minMs,
      last: -Infinity,
      running: false,
      again: false,
    });

    stats.set(id, {
      calls: 0,
      ms: 0,
      errors: 0,
    });

    queue(id);

    return () => {
      jobs.delete(id);
      pending.delete(id);
    };
  }

  function drain(): void {
    drainTimer = 0;
    if (document.hidden) return;

    const begin = performance.now();
    let remainingDelay = Infinity;

    for (const id of Array.from(pending)) {
      const job = jobs.get(id);
      if (!job) {
        pending.delete(id);
        continue;
      }
      if (!enabled(job.group)) {
        pending.delete(id);
        continue;
      }

      const remaining = job.minMs - (performance.now() - job.last);
      if (remaining > 0) {
        remainingDelay = Math.min(remainingDelay, remaining);
        continue;
      }

      pending.delete(id);
      if (job.running) {
        job.again = true;
        continue;
      }

      job.last = performance.now();
      job.running = true;

      const metric = stats.get(id)!;
      const at = performance.now();
      metric.calls++;

      const finish = () => {
        job.running = false;
        if (job.again) {
          job.again = false;
          queue(id);
        }
      };

      try {
        const result = job.fn();
        metric.ms += performance.now() - at;

        if (result && typeof (result as Promise<unknown>).then === "function") {
          Promise.resolve(result)
            .catch((error) => {
              metric.errors++;
              console.warn(STUDIO_LOGGER_TAG, id, error);
            })
            .finally(finish);
        } else {
          finish();
        }
      } catch (error) {
        metric.errors++;
        metric.ms += performance.now() - at;
        finish();
        console.warn(STUDIO_LOGGER_TAG, id, error);
      }

      if (performance.now() - begin >= config.budgetMs) break;
    }

    if (pending.size && !drainTimer) {
      drainTimer = window.setTimeout(
        drain,
        Number.isFinite(remainingDelay)
          ? Math.max(RUNTIME_LIMITS.scheduler.minimumFrameDelayMs, remainingDelay)
          : RUNTIME_LIMITS.scheduler.minimumFrameDelayMs,
      );
    }
  }

  function nodes(selector: string): Element[] {
    const hit = cache.get(selector);
    if (hit?.generation === generation) return hit.nodes;

    const elementNodes = Array.from(document.querySelectorAll(selector));
    cache.set(selector, {
      generation,
      nodes: elementNodes,
    });
    return elementNodes;
  }

  const owned = (node: Node | null): boolean =>
    node?.nodeType === 1 && Boolean((node as Element).closest?.(OWN_SELECTOR));

  function start(): void {
    if (started || !document.body) return;
    started = true;

    const context = runtime.ctx;
    if (!context) {
      started = false;
      console.warn("[RodX] ScriptContext unavailable; delaying runtime startup");
      return;
    }
    // Hydrate the runtime configuration without blocking DOM startup.
    // User changes made before hydration completes always take precedence.
    void context.storage.get(CONFIG_STORAGE_KEY).then(async (stored: unknown) => {
      // Keep historical page storage access inside the compatibility adapter.
      const legacy = stored === undefined ? readLegacyPageJSON(CONFIG_STORAGE_KEY) : undefined;
      const value = stored === undefined ? legacy : stored;
      if (context.signal.aborted || configEdited || !value || typeof value !== "object" || Array.isArray(value)) return;
      const loaded = value as Partial<StudioConfig>;
      Object.assign(config, loaded, {
        feedDefaults: { ...defaults.feedDefaults, ...loaded.feedDefaults },
        modules: { ...defaults.modules, ...loaded.modules },
      });
      if (legacy !== undefined && !configEdited) await context.storage.set(CONFIG_STORAGE_KEY, { ...config });
      if (!context.signal.aborted && !configEdited) invalidate("state");
    }).catch((error: unknown) => {
      console.warn("[RodX] Could not hydrate runtime configuration", error);
    });

    context.observe(
      document.body,
      (records) => {
        if (
          !records.some(
            (r) =>
              !owned(r.target) &&
              !(
                r.type === "childList" &&
                Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).length &&
                Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).every(owned)
              ),
          )
        )
          return;

        if (!domTimer) {
          domTimer = window.setTimeout(() => {
            domTimer = 0;
            invalidate("dom");
          }, config.scanDelayMs);
        }
      },
      {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href"],
      },
    );

    let lastRoute = state.route;
    const route = () => {
      const next = location.pathname + location.search;
      if (next === lastRoute) return;
      lastRoute = next;
      state.route = next;
      invalidate("route");
    };

    context.listen(document, "rodx:route", route);
    context.listen(window, "popstate", route);
    context.listen(window, "pageshow", () => {
      route();
      invalidate("dom");
    });

    context.listen(document, "visibilitychange", () => {
      if (!document.hidden) {
        route();
        invalidate("dom");
        invalidate("media");
      }
    });

    // One watchdog for SPA managers that isolate history. No timeline scan on it.
    context.interval(() => {
      if (!document.hidden) route();
    }, RUNTIME_LIMITS.coreStudioRuntime.startIntervalMs);

    context.interval(() => {
      if (!document.hidden) invalidate("maintenance");
    }, config.maintenanceMs);

    context.interval(() => {
      if (!document.hidden && enabled("media") && nodes("video").length) invalidate("media");
    }, 500);

    context.onDispose(() => {
      started = false;
      window.clearTimeout(domTimer);
      window.clearTimeout(drainTimer);
      domTimer = 0;
      drainTimer = 0;
      pending.clear();
      cache.clear();
    });
    invalidate("dom");
  }

  function configure(patch: Partial<StudioConfig>): void {
    Object.assign(config, patch);
    configEdited = true;
    const snapshot = JSON.parse(JSON.stringify(config)) as StudioConfig;
    const context = runtime.ctx;
    if (context && !context.signal.aborted) {
      // Serialize writes to preserve the order of rapid UI changes.
      persistenceQueue = persistenceQueue
        .catch(() => {})
        .then(() => context.storage.set(CONFIG_STORAGE_KEY, snapshot));
      void persistenceQueue.catch((error: unknown) => {
        console.warn("[RodX] Could not persist runtime configuration", error);
      });
    }
    invalidate("state");
  }

  const diagnostics = (): DiagnosticInfo => ({
    version: STUDIO_VERSION,
    network: {
      ...state.network,
    },
    selectors: {
      tweets: document.querySelectorAll(XDOM.tweet).length,
      userCells: document.querySelectorAll(XDOM.userCell).length,
      primaryColumnFound: Boolean(document.querySelector(XDOM.primary)),
      nativeSearchFound: Boolean(document.querySelector(XDOM.nativeSearch)),
    },
    modules: Object.fromEntries(
      Array.from(stats.entries()).map(([id, s]) => [
        id,
        {
          ...s,
          ms: Math.round(s.ms),
        },
      ]),
    ),
    queued: pending.size,
    domGeneration: generation,
  });

  const runtime: StudioRuntime = {
    state,
    config,
    on,
    emit,
    slice,
    register,
    invalidate,
    queue,
    enabled,
    dom: {
      nodes,
    },
    start,
    configure,
    diagnostics,
    services: {},
  };
  return runtime;
}
