import type { createGMBridge } from "../runtime/gm-bridge.js";
import { createGMFeature } from "../runtime/modular/features/gm.js";
import { createEventBus } from "../runtime/events/event-bus.js";
import { createSharedEvents } from "../runtime/events/shared-events.js";
import { matches, readScriptRules, SCRIPT_RULES_KEY } from "./script-manager.js";
import { createHttpFeature } from "../runtime/modular/features/http.js";
import type { createClipboardManager } from "../runtime/clipboard-manager.js";
import { createClipboardFeature } from "../runtime/modular/features/clipboard.js";
import type { createDomEngine } from "../runtime/dom-engine.js";
import { createDomFeature } from "../runtime/modular/features/dom.js";
import { createMenuFeature } from "../runtime/modular/features/menu.js";
import { createToasterFeature } from "../runtime/modular/features/toaster.js";
import { createStorageFeature } from "../runtime/modular/features/storage.js";
import { createUIFeature } from "../runtime/modular/features/ui.js";

// Build-time constants are replaced by Vite for each userscript target.
// Direct runtime consumers retain the complete backwards-compatible API.
declare const __ROD_FEATURE_MENU__: boolean;
declare const __ROD_FEATURE_TOASTER__: boolean;
declare const __ROD_FEATURE_CLIPBOARD__: boolean;
declare const __ROD_FEATURE_GM__: boolean;
declare const __ROD_FEATURE_DOM__: boolean;
declare const __ROD_FEATURE_HTTP__: boolean;
declare const __ROD_FEATURE_UI__: boolean;

// Tipos auxiliares e interfaces globais
export interface ScriptDefinition {
  id: string;
  name: string;
  match?: string | string[];
  module: {
    init: (ctx: ScriptContext) => void | (() => void) | Promise<void | (() => void)>;
  };
}

export interface DockAction {
  id: string;
  label: string;
  run: () => void | Promise<void>;
}

export interface ScriptContext {
  id: string;
  events: Readonly<Record<string, any> & { dom: DomEventsEngine }>;
  http: any;
  interceptRequest: (handler: any) => void;
  interceptResponse: (handler: any) => void;
  gm: ReturnType<typeof createGMBridge>;
  clipboard: (ReturnType<typeof createClipboardManager> & { open: () => void }) | null;
  dom: ReturnType<typeof createDomEngine>;
  db: (name?: string, options?: Record<string, any>) => any;
  signal: AbortSignal;
  storage: {
    get(key: string, fallback?: any): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
  };
  menu: any;
  dock: {
    register(actions: DockAction[]): void;
  };
  toaster: any;
  readonly url: URL;
  state: {
    get: () => any;
    set: (value: any) => void;
    subscribe: (callback: (value: any) => void) => () => void;
  };
  onDispose: (callback: () => void | Promise<void>) => void;
  listen(target: EventTarget, event: string, callback: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
  ui: {
    readonly root: ShadowRoot;
    readonly host: HTMLDivElement;
    mount(node: Node): Node;
    style(css: string): HTMLStyleElement;
    registerStyles(...styles: any[]): () => void;
    mountSolid(component: any, options?: Record<string, any>): () => void;
  };
  style(css: string): HTMLStyleElement;
  pageStyle(css: string): HTMLStyleElement;
  dispose(): Promise<void>;
}

interface DomEventsEngine {
  add(target: EventTarget | null, type: string, callback: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  remove(target: EventTarget | null, type: string, callback: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  dispose(): void;
}

export interface RuntimeAPI {
  ready: Promise<void>;
  navigate: () => Promise<void>;
  readonly active: string[];
  dispose: () => Promise<void>;
}

//@todo get toast from rodtoaster. source code is at rodkisten.github.ior repo
function toast(): void {}
function menu(): void {}

export function createRuntime(definitions: ScriptDefinition[], bridge: any, host: Window & typeof globalThis = window): RuntimeAPI {
  const rod = {
    menu: (typeof __ROD_FEATURE_MENU__ === "undefined" || __ROD_FEATURE_MENU__) ? createMenuFeature() : undefined,
    toaster: (typeof __ROD_FEATURE_TOASTER__ === "undefined" || __ROD_FEATURE_TOASTER__) ? createToasterFeature(host) : undefined,
    storage: createStorageFeature(host),
  };
  const uiFeature = (typeof __ROD_FEATURE_UI__ === "undefined" || __ROD_FEATURE_UI__) ? createUIFeature() : null;
  const stores = new Map<string, any>();
  const clipboard = (typeof __ROD_FEATURE_CLIPBOARD__ === "undefined" || __ROD_FEATURE_CLIPBOARD__) ? createClipboardFeature(host) : null;
  if (clipboard) (host as any).__RodClipboard = clipboard;

  function openClipboardMenu(): void {
    if (!clipboard) return;
    const entries = clipboard.list().slice(0, 30);
    rod.menu?.open({
      id: "rod-clipboard-history", title: "📋 Clipboard", presentation: "bottom-sheet", size: "lg",
      description: "Histórico local. Selecione um item para copiar novamente.",
      fields: [{ type: "search", name: "query", label: "Buscar", placeholder: "Buscar no histórico" },
        { type: "select", name: "item", label: "Itens recentes", searchable: true,
          options: entries.map((item: any) => ({ value: item.id, label: item.text.slice(0, 90) })) }],
      actions: [
        { id: "copy", label: "Copiar", handler: async (ctx: any) => clipboard.copy(ctx.values.item) },
        { id: "read", label: "Ler clipboard", handler: () => clipboard.read() },
        { id: "clear", label: "Excluir item", variant: "danger", handler: (ctx: any) => clipboard.remove(ctx.values.item) },
      ],
    });
  }

  const clipboardModule = { 
    id: "rod-clipboard", 
    name: "Clipboard", 
    actions: [
      { id: "open", label: "📋 Histórico", run: openClipboardMenu }, 
      { id: "read", label: "Ler clipboard", run: () => clipboard?.read() }
    ] 
  };

  if (clipboard) {
    host.document.dispatchEvent(new host.CustomEvent("rod-dock:registry", { detail: { type: "register", module: clipboardModule } }));
  }

  const clipboardKeydown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "v") {
      event.preventDefault(); 
      openClipboardMenu();
    }
  };

  if (clipboard) host.document.addEventListener("keydown", clipboardKeydown as EventListener, true);
  
  const rules = () => readScriptRules(host.localStorage);
  const permitted = (definition: ScriptDefinition, url: string) => matches(definition, url, rules()[definition.id]);
  const onRulesChange = () => { void navigate(); };

  host.addEventListener("storage", onRulesChange);
  host.document.addEventListener("rod-script-manager:change", onRulesChange);

  const active = new Map<string, { definition: ScriptDefinition; context: ScriptContext }>();
  const state = new Map<string, any>();
  const listeners = new Map<string, Set<(value: any) => void>>();
  const failures = new Map<string, string>();
  const undoHistory: Array<() => void> = [];
  
  let desiredURL = host.location.href;
  let scheduled: Promise<void> | null = null;
  let closed = false;

  function publish(id: string, value: any): void {
    state.set(id, value);
    for (const callback of listeners.get(id) || []) {
      try {
        callback(value);
      } catch (error) {
        console.error("[Userscripts CF subscriber]", error);
      }
    }
  }

  function context(definition: ScriptDefinition): ScriptContext {
    const abort = new host.AbortController();
    const cleanups: Array<() => void | Promise<void>> = [];
    const onDispose = (callback: () => void | Promise<void>) => cleanups.push(callback);
    
    const eventBus = createEventBus({ 
      namespace: definition.id, 
      signal: abort.signal, 
      onDiagnostic: (diagnostic: any) => console.warn("[Userscripts CF events]", diagnostic) 
    });

    const domListeners = new Map<EventTarget, Map<string, Map<EventListenerOrEventListenerObject, Map<boolean, { listener: EventListener; options: any }>>>>();
    const captureOf = (options?: boolean | AddEventListenerOptions) => typeof options === "boolean" ? options : !!options?.capture;
    
    const domEvents: DomEventsEngine = Object.freeze({
      add(target, type, callback, options) {
        if (!target || typeof target.addEventListener !== "function") throw new TypeError("Expected EventTarget");
        let types = domListeners.get(target);
        if (!types) domListeners.set(target, (types = new Map()));
        let handlers = types.get(type);
        if (!handlers) types.set(type, (handlers = new Map()));
        let captures = handlers.get(callback);
        if (!captures) handlers.set(callback, (captures = new Map()));
        
        const capture = captureOf(options);
        if (captures.has(capture)) return;
        
        const once = typeof options === "object" && options?.once;
        const listener: EventListener = once
          ? function (this: EventTarget, ...args: any[]) {
              domEvents.remove(target, type, callback, options);
              return typeof callback === "function"
                ? (callback as Function).apply(this, args)
                : (callback as EventListenerObject).handleEvent(...(args as [Event]));
            }
          : (callback as EventListener);

        target.addEventListener(type, listener, options);
        captures.set(capture, { listener, options });
      },
      remove(target, type, callback, options) {
        if (!target) return;
        const capture = captureOf(options);
        const handlers = domListeners.get(target)?.get(type);
        const captures = handlers?.get(callback);
        const record = captures?.get(capture);
        target.removeEventListener(type, record?.listener ?? callback, options);
        captures?.delete(capture);
        if (captures && !captures.size) handlers.delete(callback);
      },
      dispose() {
        for (const [target, types] of domListeners)
          for (const [type, handlers] of types)
            for (const [, captures] of handlers)
              for (const [capture, record] of captures)
                target.removeEventListener(type, record.listener, capture);
        domListeners.clear();
      },
    });

    onDispose(() => domEvents.dispose());
    const sharedEvents = createSharedEvents({ host, signal: abort.signal });
    const events = Object.freeze({ ...eventBus, shared: sharedEvents, dom: domEvents });
    
    let uiHost: HTMLDivElement | undefined;
    let uiRoot: ShadowRoot | undefined;

    function ensureUIRoot(): ShadowRoot {
      if (uiRoot?.isConnected) return uiRoot;
      const parent = host.document.body || host.document.documentElement;
      if (!parent) throw new Error("Document root is not available");
      
      uiHost = host.document.createElement("div");
      uiHost.dataset.userscriptsCfUi = definition.id;
      // The runtime owns the stacking context for all mounted Solid components.
      // Keep the host non-interactive while allowing its UI descendants to receive input.
      uiHost.style.setProperty("all", "initial");
      uiHost.style.setProperty("position", "fixed", "important");
      uiHost.style.setProperty("inset", "0", "important");
      uiHost.style.setProperty("width", "0", "important");
      uiHost.style.setProperty("height", "0", "important");
      uiHost.style.setProperty("z-index", "2147483647", "important");
      uiHost.style.setProperty("pointer-events", "none", "important");
      uiHost.style.setProperty("visibility", "visible", "important");
      uiRoot = uiHost.attachShadow({ mode: "open" });
      parent.append(uiHost);
      
      onDispose(() => {
        uiHost?.remove();
        uiHost = undefined;
        uiRoot = undefined;
      });
      return uiRoot;
    }

    function addStyle(css: string, target: ParentNode): HTMLStyleElement {
      const node = host.document.createElement("style");
      node.textContent = String(css);
      target.append(node);
      onDispose(() => node.remove());
      return node;
    }

    // Initialize persistent storage only when a script actually uses ctx.storage.
    // Context creation is frequent on SPA navigation; unused stores need not
    // open a backend just because the runtime exposes the storage API.
    function getStore() {
      let store = stores.get(definition.id);
      if (!store) {
        store = rod.storage.create({ namespace: "userscripts-cf/" + definition.id, backend: "auto" });
        stores.set(definition.id, store);
      }
      return store;
    }

    const databases = new Map<string, any>();
    function db(name: string = "default", options: Record<string, any> = {}) {
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
      async get(key: string, fallback?: any) {
        const value = await getStore().get(key);
        if (value !== undefined) return value;
        const legacy = await bridge.call("get", { id: definition.id, key, fallback: undefined });
        if (legacy !== undefined) {
          await getStore().set(key, legacy);
          return legacy;
        }
        return fallback;
      },
      async set(key: string, value: any) {
        await getStore().set(key, value);
        await bridge.call("set", { id: definition.id, key, value });
      },
      async delete(key: string) {
        await getStore().delete(key);
        await bridge.call("delete", { id: definition.id, key });
      },
    });

    const gm = (typeof __ROD_FEATURE_GM__ === "undefined" || __ROD_FEATURE_GM__) ? createGMFeature(host, definition.id) : undefined as any;
    const network = (typeof __ROD_FEATURE_HTTP__ === "undefined" || __ROD_FEATURE_HTTP__) ? createHttpFeature(host, abort.signal, storage, definition.id) : null;
    if (network) onDispose(() => network.dispose());

    const dom = (typeof __ROD_FEATURE_DOM__ === "undefined" || __ROD_FEATURE_DOM__) ? createDomFeature(host, abort.signal) : undefined as any;
    if (dom) onDispose(() => dom.dispose());

    return {
      id: definition.id,
      events,
      http: network?.http,
      interceptRequest: network?.interceptRequest ?? (() => {}),
      interceptResponse: network?.interceptResponse ?? (() => {}),
      gm,
      clipboard: clipboard && Object.freeze({ ...clipboard, open: openClipboardMenu }),
      dom,
      db,
      signal: abort.signal,
      storage,
      menu: rod.menu,
      dock: Object.freeze({
        register(actions: DockAction[]) {
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
        set: (value: any) => publish(definition.id, value),
        subscribe(callback: (value: any) => void) {
          let set = listeners.get(definition.id);
          if (!set) {
            set = new Set();
            listeners.set(definition.id, set);
          }
          set.add(callback);
          const off = () => set!.delete(callback);
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
          return uiHost!;
        },
        mount(node: Node) {
          ensureUIRoot().append(node);
          return node;
        },
        style(css: string) {
          return addStyle(css, ensureUIRoot());
        },
        registerStyles(...styles: any[]) {
          if (!uiFeature) throw new Error("ctx.ui is not enabled in this bundle");
          const release = uiFeature.registerShadowStyles(ensureUIRoot(), styles.flat());
          onDispose(release);
          return release;
        },
        mountSolid(component: any, options: Record<string, any> = {}) {
          if (!uiFeature) throw new Error("ctx.ui is not enabled in this bundle");
          const release = uiFeature.mountSolidShadow(component, {
            ...options,
            target: ensureUIRoot(),
          });
          onDispose(release);
          return release;
        },
      }),
      style(css: string) {
        return addStyle(css, ensureUIRoot());
      },
      pageStyle(css: string) {
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

  async function reconcile(): Promise<void> {
    while (!closed) {
      const url = desiredURL;
      for (const [id, instance] of active) {
        if (permitted(instance.definition, url)) continue;
        active.delete(id);
        await instance.context.dispose();
      }
      for (const definition of definitions) {
        if (closed || desiredURL !== url) break;
        if (
          active.has(definition.id) ||
          failures.get(definition.id) === url ||
          !permitted(definition, url)
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

  function navigate(): Promise<void> {
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

  for (const method of ["pushState", "replaceState"] as const) {
    const original = host.history[method];
    const wrapper = function (this: History, ...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      void navigate();
      return result;
    };
    host.history[method] = wrapper as any;
    undoHistory.push(() => {
      if (host.history[method] === wrapper) host.history[method] = original;
    });
  }

  host.addEventListener("popstate", navigate);
  host.addEventListener("hashchange", navigate);

  const api: RuntimeAPI = {
    ready: navigate(),
    navigate,
    get active() {
      return [...active.keys()];
    },
    async dispose() {
      closed = true;
      host.document.removeEventListener("keydown", clipboardKeydown as EventListener, true);
      if ((host as any).__RodClipboard === clipboard) delete (host as any).__RodClipboard;
      clipboard?.dispose();
      if (clipboard) {
        host.document.dispatchEvent(new host.CustomEvent("rod-dock:registry", { detail: { type: "unregister", id: clipboardModule.id } }));
      }
      host.removeEventListener("storage", onRulesChange);
      host.document.removeEventListener("rod-script-manager:change", onRulesChange);
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
