import { createGMBridge } from "../runtime/gm-bridge.js";
import { createEventBus } from "../runtime/events/event-bus.js";
import { matchesRoute } from "./match.js";
import { createHttpClient } from "../runtime/http-client.js";
import { createDomEngine } from "../runtime/dom-engine.js";
import { rodLibraries } from "../runtime/rod-libraries.js";
import { mountSolidShadow, registerShadowStyles } from "../runtime/solid-ui/shadow-mount";

//@todo get toast from rodtoaster. source code is at rodkisten.github.ior repo
function toast() {}
function menu() {}

export function createRuntime(definitions, bridge, host = window) {
  const rod = rodLibraries(host);
  const stores = new Map();
  const active = new Map();
  const state = new Map();
  const listeners = new Map();
  const failures = new Map();
  const undoHistory = [];
  let desiredURL = host.location.href;
  let scheduled;
  let closed = false;

  function publish(id, value) {
    state.set(id, value);
    for (const callback of listeners.get(id) || []) {
      try {
        callback(value);
      } catch (error) {
        console.error("[Userscripts CF subscriber]", error);
      }
    }
  }

  function context(definition) {
    const abort = new host.AbortController();
    const cleanups = [];
    const events = createEventBus({ namespace: definition.id, signal: abort.signal, onDiagnostic: (diagnostic) => console.warn("[Userscripts CF events]", diagnostic) });
    let uiHost;
    let uiRoot;
    function ensureUIRoot() {
      if (uiRoot?.isConnected) return uiRoot;
      const parent = host.document.body || host.document.documentElement;
      if (!parent) throw new Error("Document root is not available");
      uiHost = host.document.createElement("div");
      uiHost.dataset.userscriptsCfUi = definition.id;
      uiHost.style.setProperty("all", "initial");
      uiHost.style.setProperty("position", "relative");
      uiHost.style.setProperty("z-index", "2147483000");
      uiRoot = uiHost.attachShadow({ mode: "open" });
      parent.append(uiHost);
      onDispose(() => {
        uiHost?.remove();
        uiHost = undefined;
        uiRoot = undefined;
      });
      return uiRoot;
    }
    function addStyle(css, target) {
      const node = host.document.createElement("style");
      node.textContent = String(css);
      target.append(node);
      onDispose(() => node.remove());
      return node;
    }
    const onDispose = (callback) => cleanups.push(callback);
    let store = stores.get(definition.id);
    if (!store) {
      store = rod.storage.create({ namespace: "userscripts-cf/" + definition.id, backend: "auto" });
      stores.set(definition.id, store);
    }
    // Dedicated IndexedDB stores never silently fall back to localStorage or GM.
    // Call ctx.db("history") to create a namespaced, lifecycle-managed RodStorage instance.
    const databases = new Map();
    function db(name = "default", options = {}) {
      if (typeof name !== "string" || !name.trim() || name.includes("..")) {
        throw new TypeError("Database name must be a non-empty namespace segment");
      }
      if (databases.has(name)) return databases.get(name);
      const instance = rod.storage.create({
        ...options,
        namespace: "userscripts-cf/" + definition.id + "/db/" + name,
        backend: { preferred: "indexeddb", fallbacks: [] },
      });
      databases.set(name, instance);
      onDispose(() => instance.close());
      return instance;
    }
    const storage = Object.freeze({
      async get(key, fallback) {
        const value = await store.get(key);
        if (value !== undefined) return value;
        const legacy = await bridge.call("get", { id: definition.id, key, fallback: undefined });
        if (legacy !== undefined) {
          await store.set(key, legacy);
          return legacy;
        }
        return fallback;
      },
      async set(key, value) {
        await store.set(key, value);
        await bridge.call("set", { id: definition.id, key, value });
      },
      async delete(key) {
        await store.delete(key);
        await bridge.call("delete", { id: definition.id, key });
      },
    });
    const gm = createGMBridge(host);
    const http = createHttpClient({ host, signal: abort.signal, storage, namespace: definition.id });
    onDispose(() => http.dispose());
    const dom = createDomEngine({ root: host.document, signal: abort.signal });
    onDispose(() => dom.dispose());
    return {
      id: definition.id,
      events,
      http,
      gm,
      dom,
      db,
      signal: abort.signal,
      storage,
      menu: rod.menu,
      dock: Object.freeze({
        register(actions) {
          const module = {
            id: definition.id,
            name: definition.name,
            actions: actions.map((action) => ({
              id: action.id,
              label: action.label,
              run: action.run,
            })),
          };
          host.document.dispatchEvent(new host.CustomEvent("rod-dock:registry", {
            detail: { type: "register", module },
          }));
          onDispose(() => host.document.dispatchEvent(new host.CustomEvent("rod-dock:registry", {
            detail: { type: "unregister", id: definition.id },
          })));
        },
      }),
      toaster: rod.toaster,
      get url() {
        return new URL(desiredURL);
      },
      state: Object.freeze({
        get: () => state.get(definition.id),
        set: (value) => publish(definition.id, value),
        subscribe(callback) {
          const set = listeners.get(definition.id) || new Set();
          listeners.set(definition.id, set);
          set.add(callback);
          const off = () => set.delete(callback);
          onDispose(off);
          return off;
        },
      }),
      onDispose,
      listen(target, event, callback, options = {}) {
        target.addEventListener(event, callback, {
          ...options,
          signal: abort.signal,
        });
      },
      ui: Object.freeze({
        get root() {
          return ensureUIRoot();
        },
        get host() {
          ensureUIRoot();
          return uiHost;
        },
        mount(node) {
          ensureUIRoot().append(node);
          return node;
        },
        style(css) {
          return addStyle(css, ensureUIRoot());
        },
        registerStyles(...styles) {
          const release = registerShadowStyles(ensureUIRoot(), styles.flat());
          onDispose(release);
          return release;
        },
        mountSolid(component, options = {}) {
          const release = mountSolidShadow(component, {
            ...options,
            target: ensureUIRoot(),
          });
          onDispose(release);
          return release;
        },
      }),
      // Isolated by default: styles here cannot match page DOM.
      style(css) {
        return addStyle(css, ensureUIRoot());
      },
      // Explicit opt-in for scripts that intentionally modify the website.
      pageStyle(css) {
        return addStyle(css, host.document.head || host.document.documentElement);
      },
      async dispose() {
        abort.abort();
        for (const cleanup of cleanups.reverse()) {
          try {
            await cleanup();
          } catch (error) {
            console.error("[Userscripts CF cleanup]", error);
          }
        }
        cleanups.length = 0;
        listeners.delete(definition.id);
        state.delete(definition.id);
      },
    };
  }

  async function reconcile() {
    while (!closed) {
      const url = desiredURL;
      for (const [id, instance] of active) {
        if (matchesRoute(instance.definition, url)) continue;
        active.delete(id);
        await instance.context.dispose();
      }
      for (const definition of definitions) {
        if (closed || desiredURL !== url) break;
        if (
          active.has(definition.id) ||
          failures.get(definition.id) === url ||
          !matchesRoute(definition, url)
        )
          continue;
        const ctx = context(definition);
        try {
          const cleanup = await definition.module.init(ctx);
          if (typeof cleanup === "function") ctx.onDispose(cleanup);
          if (closed || desiredURL !== url) await ctx.dispose();
          else {
            active.set(definition.id, { definition, context: ctx });
            failures.delete(definition.id);
          }
        } catch (error) {
          await ctx.dispose();
          failures.set(definition.id, url);
          console.error(`[Userscripts CF: ${definition.id}]`, error);
        }
      }
      if (desiredURL === url) break;
    }
  }
  function navigate() {
    if (closed) return Promise.resolve();
    desiredURL = host.location.href;
    if (!scheduled) {
      scheduled = Promise.resolve()
        .then(reconcile)
        .finally(() => {
          scheduled = null;
        });
    }
    return scheduled;
  }
  for (const method of ["pushState", "replaceState"]) {
    const original = host.history[method];
    const wrapper = function (...args) {
      const result = original.apply(this, args);
      void navigate();
      return result;
    };
    host.history[method] = wrapper;
    undoHistory.push(() => {
      if (host.history[method] === wrapper) host.history[method] = original;
    });
  }
  host.addEventListener("popstate", navigate);
  host.addEventListener("hashchange", navigate);
  const api = {
    ready: navigate(),
    navigate,
    get active() {
      return [...active.keys()];
    },
    async dispose() {
      closed = true;
      host.removeEventListener("popstate", navigate);
      host.removeEventListener("hashchange", navigate);
      undoHistory.forEach((undo) => undo());
      await scheduled;
      for (const instance of active.values()) await instance.context.dispose();
      active.clear();
      failures.clear();
      state.clear();
      listeners.clear();
      for (const store of stores.values()) store.close?.();
      stores.clear();
      bridge.dispose?.();
    },
  };
  return api;
}
