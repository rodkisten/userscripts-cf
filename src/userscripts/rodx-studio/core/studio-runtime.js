import { XDOM } from "../platform/selectors.js";

export function createStudioRuntime() {
  const key = "rodx:studio:runtime:v3";
  const defaults = {
    feedDefaults: {
      media: "media",
      reposts: true,
    },
    budgetMs: 7,
    scanDelayMs: 110,
    maintenanceMs: 15000,
    modules: {
      lists: true,
      profile: true,
      layout: true,
      media: true,
      links: true,
      translation: true,
      hygiene: true,
      customTimeline: false,
    },
    homeListLimit: 12,
  };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(key) || "{}");
  } catch {}
  const config = {
    ...defaults,
    ...saved,
    feedDefaults: {
      ...defaults.feedDefaults,
      ...saved.feedDefaults,
    },
    modules: {
      ...defaults.modules,
      ...saved.modules,
    },
  };
  config.budgetMs = Math.max(3, Math.min(12, Number(config.budgetMs) || 7));
  config.scanDelayMs = Math.max(60, Math.min(500, Number(config.scanDelayMs) || 110));
  config.maintenanceMs = Math.max(5000, Number(config.maintenanceMs) || 15000);
  config.homeListLimit = Math.max(0, Math.min(50, Number(config.homeListLimit) || 12));
  const state = {
    config,
    network: {
      ready: false,
      authReady: false,
      error: "",
    },
    route: location.pathname + location.search,
  };
  const listeners = new Map(),
    jobs = new Map(),
    pending = new Set(),
    stats = new Map(),
    cache = new Map();
  let drainTimer = 0,
    domTimer = 0,
    started = false,
    generation = 0;
  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type)?.delete(fn);
  }
  function emit(type, data) {
    for (const fn of listeners.get(type) || [])
      try {
        fn(data);
      } catch (e) {
        console.warn("[RodX Studio]", type, e);
      }
  }
  function slice(name, value) {
    if (state[name]) return state[name];
    state[name] = value;
    return value;
  }
  function enabled(group) {
    return !group || config.modules[group] !== false;
  }
  function queue(id) {
    if (!jobs.has(id)) return;
    pending.add(id);
    if (!drainTimer && !document.hidden) drainTimer = setTimeout(drain, config.scanDelayMs);
  }
  function invalidate(reason = "dom") {
    if (reason === "dom" || reason === "route") {
      generation++;
      cache.clear();
    }
    for (const [id, job] of jobs) if (job.events.includes(reason)) queue(id);
    emit(reason, state.route);
  }
  function register(
    id,
    fn,
    { events = ["dom", "route", "state", "maintenance"], group = "", minMs = 0 } = {},
  ) {
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
  function drain() {
    drainTimer = 0;
    if (document.hidden) return;
    const begin = performance.now();
    let remainingDelay = Infinity;
    for (const id of [...pending]) {
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
      const metric = stats.get(id),
        at = performance.now();
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
        if (result?.then)
          Promise.resolve(result)
            .catch((error) => {
              metric.errors++;
              console.warn("[RodX Studio]", id, error);
            })
            .finally(finish);
        else finish();
      } catch (error) {
        metric.errors++;
        metric.ms += performance.now() - at;
        finish();
        console.warn("[RodX Studio]", id, error);
      }
      if (performance.now() - begin >= config.budgetMs) break;
    }
    if (pending.size && !drainTimer)
      drainTimer = setTimeout(drain, Number.isFinite(remainingDelay) ? Math.max(16, remainingDelay) : 16);
  }
  function nodes(selector) {
    const hit = cache.get(selector);
    if (hit?.generation === generation) return hit.nodes;
    const nodes = [...document.querySelectorAll(selector)];
    cache.set(selector, {
      generation,
      nodes,
    });
    return nodes;
  }
  const ownSelector =
    "#rodx-search-deck-root,#rodx-search-deck-dock,#rodx-navigation-strip,#rodx-feed-filters,#rodx-active-tweetbar,#x-lists-studio-root,#rodx-profile-lists,#rodx-list-id,#rodx-floating-search,.rodx-quick-search,[data-rod-menu-host],[data-rodx-list-video]";
  const owned = (node) => node?.nodeType === 1 && Boolean(node.closest?.(ownSelector));
  function start() {
    if (started || !document.body) return;
    started = true;
    new MutationObserver((records) => {
      if (
        !records.some(
          (r) =>
            !owned(r.target) &&
            !(
              r.type === "childList" &&
              [...r.addedNodes, ...r.removedNodes].length &&
              [...r.addedNodes, ...r.removedNodes].every(owned)
            ),
        )
      )
        return;
      if (!domTimer)
        domTimer = setTimeout(() => {
          domTimer = 0;
          invalidate("dom");
        }, config.scanDelayMs);
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href"],
    });
    let last = state.route;
    const route = () => {
      const next = location.pathname + location.search;
      if (next === last) return;
      last = next;
      state.route = next;
      invalidate("route");
    };
    document.addEventListener("rodx:route", route);
    window.addEventListener("popstate", route);
    window.addEventListener("pageshow", () => {
      route();
      invalidate("dom");
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        route();
        invalidate("dom");
        invalidate("media");
      }
    });
    // One watchdog for SPA managers that isolate history. No timeline scan on it.
    setInterval(() => {
      if (!document.hidden) route();
    }, 1000);
    setInterval(() => {
      if (!document.hidden) invalidate("maintenance");
    }, config.maintenanceMs);
    setInterval(() => {
      if (!document.hidden && enabled("media") && nodes("video").length) invalidate("media");
    }, 500);
    invalidate("dom");
  }
  function configure(patch) {
    Object.assign(config, patch);
    try {
      localStorage.setItem(key, JSON.stringify(config));
    } catch {}
    invalidate("state");
  }
  const diagnostics = () => ({
    version: "3.7.0",
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
      [...stats].map(([id, s]) => [
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
  return {
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
}
