import { createUpdateChecker } from "./update-checker.js";
import { QueryClient } from "@tanstack/query-core";
import { captureDiagnostic, observeNetworkDiagnostics } from "../runtime/diagnostics.js";
import { createAsyncOptions } from "../runtime/solid-ui/form-controls/createAsyncOptions.js";
import type { AsyncOptionsConfig } from "../runtime/solid-ui/form-controls/createAsyncOptions.js";
import { createRoot, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";
import type { OptionsSource } from "../runtime/solid-ui/form-controls/options.js";
import type { createGMBridge } from "../runtime/gm-bridge.js";
import { createGMFeature } from "../runtime/modular/features/gm.js";
import { createEventBus } from "../runtime/events/event-bus.js";
import { createSharedEvents } from "../runtime/events/shared-events.js";
import { matches, readScriptRules } from "./script-manager.js";
import { createHttpFeature } from "../runtime/modular/features/http.js";
import type { createClipboardManager } from "../runtime/clipboard-manager.js";
import { createClipboardFeature } from "../runtime/modular/features/clipboard.js";
import type { createDomEngine } from "../runtime/dom-engine.js";
import { createDomFeature } from "../runtime/modular/features/dom.js";
import { createMenuFeature } from "../runtime/modular/features/menu.js";
import { createToasterFeature } from "../runtime/modular/features/toaster.js";
import { createStorageFeature } from "../runtime/modular/features/storage.js";
import { createUIFeature } from "../runtime/modular/features/ui.js";

// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const STORAGE_NAMESPACE_PREFIX = "userscripts-cf/";
const DB_NAMESPACE_SEGMENT = "/db/";
const CLIPBOARD_ID = "rod-clipboard";
const CLIPBOARD_TITLE = "📋 Clipboard";
const CLIPBOARD_DESCRIPTION = "Histórico local. Selecione um item para copiar novamente.";
const CLIPBOARD_SEARCH_NAME = "query";
const CLIPBOARD_SEARCH_LABEL = "Buscar";
const CLIPBOARD_SEARCH_PLACEHOLDER = "Buscar no histórico";
const CLIPBOARD_ITEM_NAME = "item";
const CLIPBOARD_ITEM_LABEL = "Itens recentes";
const CLIPBOARD_ACTION_COPY = "copy";
const CLIPBOARD_ACTION_COPY_LABEL = "Copiar";
const CLIPBOARD_ACTION_READ = "read";
const CLIPBOARD_ACTION_READ_LABEL = "Ler clipboard";
const CLIPBOARD_ACTION_CLEAR = "clear";
const CLIPBOARD_ACTION_CLEAR_LABEL = "Excluir item";
const UPDATE_PREFIX = "rod-update-";
const UPDATE_LABEL = "Atualizar";
const DOCK_REGISTRY_EVENT = "rod-dock:registry";
const SCRIPT_MANAGER_CHANGE_EVENT = "rod-script-manager:change";
const SOURCE_MANUAL = "manual";
const SOURCE_STATE_SUBSCRIBER = "state.subscriber";
const SOURCE_MODULE_INIT = "module.init";
const LOG_TAG_EVENTS = "[Userscripts CF events]";
const LOG_TAG_SUBSCRIBER = "[Userscripts CF subscriber]";
const LOG_TAG_CLEANUP = "[Userscripts CF cleanup]";
const LOG_TAG_SCRIPT_PREFIX = "[Userscripts CF: ";
const DOM_EVENT_PREFIX = "dom.event:";
const EVENT_PREFIX = "event:";
const SOLID_REACTIVE_SOURCE = "solid.reactive";
const SOLID_MOUNT_SOURCE = "solid.mount";
const HISTORY_PUSH_STATE = "pushState";
const HISTORY_REPLACE_STATE = "replaceState";
const DATASET_UI_ATTR = "userscriptsCfUi";
const DEFAULT_DATABASE_NAME = "default";
const CLIPBOARD_HISTORY_LIMIT = 30;
const CLIPBOARD_SNIPPET_LENGTH = 90;
const QUERY_RETRY_COUNT = 1;
const QUERY_GC_TIME = 300_000;
const Z_INDEX_MAX = "2147483647";

declare const __ROD_FEATURE_MENU__: boolean;
declare const __ROD_FEATURE_TOASTER__: boolean;
declare const __ROD_FEATURE_CLIPBOARD__: boolean;
declare const __ROD_FEATURE_GM__: boolean;
declare const __ROD_FEATURE_DOM__: boolean;
declare const __ROD_FEATURE_HTTP__: boolean;
declare const __ROD_FEATURE_UI__: boolean;

// ============================================================================
// Tipos Fortes e Interfaces
// ============================================================================
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
  diagnostics: {
    capture(error: unknown, source?: string): void;
    observeNetwork(): () => void;
  };
  events: Readonly<Record<string, unknown> & { dom: DomEventsEngine }>;
  http: ReturnType<typeof createHttpFeature>["http"] | undefined;
  interceptRequest: (handler: unknown) => void;
  interceptResponse: (handler: unknown) => void;
  gm: ReturnType<typeof createGMFeature>;
  clipboard: (ReturnType<typeof createClipboardManager> & { open: () => void }) | null;
  dom: ReturnType<typeof createDomFeature>;
  db: (name?: string, options?: Record<string, unknown>) => unknown;
  signal: AbortSignal;
  storage: {
    get(key: string, fallback?: unknown): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  menu: ReturnType<typeof createMenuFeature> | undefined;
  query: {
    readonly client: QueryClient;
    createAsyncOptions(
      source: Accessor<OptionsSource>,
      query: Accessor<string>,
      config?: Omit<AsyncOptionsConfig, "queryClient">,
    ): ReturnType<typeof createAsyncOptions>;
  };
  dock: {
    register(actions: DockAction[]): void;
  };
  updates: ReturnType<typeof createUpdateChecker> | null;
  toast: ReturnType<typeof createToasterFeature> | undefined;
  toaster: ReturnType<typeof createToasterFeature> | undefined;
  readonly url: URL;
  state: {
    get: () => unknown;
    set: (value: unknown) => void;
    subscribe: (callback: (value: unknown) => void) => () => void;
  };
  onDispose: (callback: () => void | Promise<void>) => void;
  observe(target: Node, callback: MutationCallback, options: MutationObserverInit): MutationObserver;
  interval(callback: () => void, milliseconds: number): ReturnType<typeof setInterval>;
  store<T extends object>(initial: T): ReturnType<typeof createStore<T>>;
  listen(
    target: EventTarget,
    event: string,
    callback: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void;
  ui: {
    readonly root: ShadowRoot;
    readonly host: HTMLDivElement;
    mount(node: Node): Node;
    style(css: string): HTMLStyleElement;
    registerStyles(...styles: unknown[]): () => void;
    mountSolid(component: unknown, options?: Record<string, unknown>): () => void;
  };
  style(css: string): HTMLStyleElement;
  pageStyle(css: string): HTMLStyleElement;
  dispose(): Promise<void>;
}

interface DomEventsEngine {
  add(
    target: EventTarget | null,
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  remove(
    target: EventTarget | null,
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
  dispose(): void;
}

export interface RuntimeAPI {
  ready: Promise<void>;
  navigate: () => Promise<void>;
  readonly active: string[];
  dispose: () => Promise<void>;
}

// ============================================================================
// Funções Auxiliares e Arquitetura Modular
// ============================================================================

function initializeRodFeatures(host: Window & typeof globalThis) {
  return {
    menu:
      typeof __ROD_FEATURE_MENU__ === "undefined" || __ROD_FEATURE_MENU__ ? createMenuFeature() : undefined,
    toaster:
      typeof __ROD_FEATURE_TOASTER__ === "undefined" || __ROD_FEATURE_TOASTER__
        ? createToasterFeature(host)
        : undefined,
    storage: createStorageFeature(host),
  };
}

function setupUpdateChecker(
  release: { id: string; version: string; manifestURL: string },
  host: Window & typeof globalThis,
  rod: ReturnType<typeof initializeRodFeatures>,
) {
  return createUpdateChecker({
    id: release.id,
    installedVersion: release.version,
    manifestURL: release.manifestURL,
    host,
    get storage() {
      try {
        return host.localStorage;
      } catch {
        return undefined;
      }
    },
    notify(update) {
      rod.toaster?.warning({
        id: `${UPDATE_PREFIX}${update.id}-${update.latestVersion}`,
        title: `Atualização disponível · ${update.name}`,
        description: `${update.installedVersion} → ${update.latestVersion}`,
        duration: 0,
        closeButton: true,
        actions: [
          {
            label: UPDATE_LABEL,
            handle: () => {
              host.open(update.downloadURL, "_blank", "noopener,noreferrer");
            },
          },
        ],
        onDismiss: () => updaterInstance?.dismiss(update.latestVersion),
      });
    },
  });
}

let updaterInstance: ReturnType<typeof createUpdateChecker> | null = null;

function createDomEventsEngine(definitionId: string, host: Window & typeof globalThis): DomEventsEngine {
  const domListeners = new Map<
    EventTarget,
    Map<
      string,
      Map<EventListenerOrEventListenerObject, Map<boolean, { listener: EventListener; options: unknown }>>
    >
  >();

  const captureOf = (options?: boolean | AddEventListenerOptions) =>
    typeof options === "boolean" ? options : !!options?.capture;

  const engine: DomEventsEngine = Object.freeze({
    add(target, type, callback, options) {
      if (!target || typeof target.addEventListener !== "function")
        throw new TypeError("Expected EventTarget");
      let types = domListeners.get(target);
      if (!types) domListeners.set(target, (types = new Map()));
      let handlers = types.get(type);
      if (!handlers) types.set(type, (handlers = new Map()));
      let captures = handlers.get(callback);
      if (!captures) handlers.set(callback, (captures = new Map()));

      const capture = captureOf(options);
      if (captures.has(capture)) return;

      const once =
        typeof options === "object" && options !== null && (options as AddEventListenerOptions)?.once;
      const listener: EventListener = function (this: EventTarget, event: Event) {
        if (once) engine.remove(target, type, callback, options);
        try {
          const result: unknown =
            typeof callback === "function" ? callback.call(this, event) : callback.handleEvent(event);
          if (result && typeof (result as Promise<unknown>).then === "function") {
            void Promise.resolve(result).catch((error) => {
              captureDiagnostic(error, `${DOM_EVENT_PREFIX}${type}`, definitionId, host);
              console.error(`${LOG_TAG_SCRIPT_PREFIX}${definitionId}]`, error);
            });
          }
        } catch (error) {
          captureDiagnostic(error, `${DOM_EVENT_PREFIX}${type}`, definitionId, host);
          throw error;
        }
      };

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
  return engine;
}

// ============================================================================
// Função Principal de Criação do Runtime
// ============================================================================

export function createRuntime(
  definitions: ScriptDefinition[],
  bridge: { call: (method: string, payload: unknown) => Promise<unknown>; dispose?: () => void },
  host: Window & typeof globalThis = window,
  release?: { id: string; version: string; manifestURL: string },
): RuntimeAPI {
  const rod = initializeRodFeatures(host);

  updaterInstance = release ? setupUpdateChecker(release, host, rod) : null;
  updaterInstance?.start();

  const uiFeature =
    typeof __ROD_FEATURE_UI__ === "undefined" || __ROD_FEATURE_UI__ ? createUIFeature() : null;

  const stores = new Map<string, ReturnType<typeof rod.storage.create>>();
  let queryClient: QueryClient | undefined;

  const getQueryClient = () =>
    (queryClient ??= new QueryClient({
      defaultOptions: { queries: { retry: QUERY_RETRY_COUNT, gcTime: QUERY_GC_TIME } },
    }));

  const queryService = Object.freeze({
    get client() {
      return getQueryClient();
    },
    createAsyncOptions(
      source: Accessor<OptionsSource>,
      query: Accessor<string>,
      config: Omit<AsyncOptionsConfig, "queryClient"> = {},
    ) {
      return createAsyncOptions(source, query, { ...config, queryClient: getQueryClient() });
    },
  });

  const clipboard =
    typeof __ROD_FEATURE_CLIPBOARD__ === "undefined" || __ROD_FEATURE_CLIPBOARD__
      ? createClipboardFeature(host)
      : null;

  if (clipboard) (host as unknown as Record<string, unknown>).__RodClipboard = clipboard;

  function openClipboardMenu(): void {
    if (!clipboard) return;
    const entries = clipboard.list().slice(0, CLIPBOARD_HISTORY_LIMIT);
    rod.menu?.open({
      id: "rod-clipboard-history",
      title: CLIPBOARD_TITLE,
      presentation: "bottom-sheet",
      size: "lg",
      description: CLIPBOARD_DESCRIPTION,
      fields: [
        {
          type: "search",
          name: CLIPBOARD_SEARCH_NAME,
          label: CLIPBOARD_SEARCH_LABEL,
          placeholder: CLIPBOARD_SEARCH_PLACEHOLDER,
        },
        {
          type: "select",
          name: CLIPBOARD_ITEM_NAME,
          label: CLIPBOARD_ITEM_LABEL,
          searchable: true,
          options: entries.map((item: { id: string; text: string }) => ({
            value: item.id,
            label: item.text.slice(0, CLIPBOARD_SNIPPET_LENGTH),
          })),
        },
      ],
      actions: [
        {
          id: CLIPBOARD_ACTION_COPY,
          label: CLIPBOARD_ACTION_COPY_LABEL,
          handler: async (ctx: { values: { item: string } }) => clipboard.copy(ctx.values.item),
        },
        { id: CLIPBOARD_ACTION_READ, label: CLIPBOARD_ACTION_READ_LABEL, handler: () => clipboard.read() },
        {
          id: CLIPBOARD_ACTION_CLEAR,
          label: CLIPBOARD_ACTION_CLEAR_LABEL,
          variant: "danger",
          handler: (ctx: { values: { item: string } }) => clipboard.remove(ctx.values.item),
        },
      ],
    });
  }

  const clipboardModule = {
    id: CLIPBOARD_ID,
    name: "Clipboard",
    actions: [
      { id: "open", label: "📋 Histórico", run: openClipboardMenu },
      { id: "read", label: CLIPBOARD_ACTION_READ_LABEL, run: () => clipboard?.read() },
    ],
  };

  if (clipboard) {
    host.document.dispatchEvent(
      new host.CustomEvent(DOCK_REGISTRY_EVENT, { detail: { type: "register", module: clipboardModule } }),
    );
  }

  const clipboardKeydown = (event: KeyboardEvent): void => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      openClipboardMenu();
    }
  };

  if (clipboard) host.document.addEventListener("keydown", clipboardKeydown as EventListener, true);

  const rules = () => readScriptRules(host.localStorage);
  const permitted = (definition: ScriptDefinition, url: string) =>
    matches(definition, url, rules()[definition.id]);

  const onRulesChange = () => {
    void navigate();
  };

  host.addEventListener("storage", onRulesChange);
  host.document.addEventListener("rod-script-manager:change", onRulesChange);

  const active = new Map<string, { definition: ScriptDefinition; context: ScriptContext }>();
  const stateValues = new Map<string, unknown>();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const failures = new Map<string, string>();
  const undoHistory: Array<() => void> = [];

  let desiredURL = host.location.href;
  let scheduled: Promise<void> | null = null;
  let closed = false;

  function publish(id: string, value: unknown): void {
    stateValues.set(id, value);
    const scriptListeners = listeners.get(id);
    if (!scriptListeners) return;

    for (const callback of scriptListeners) {
      try {
        callback(value);
      } catch (error) {
        captureDiagnostic(error, SOURCE_STATE_SUBSCRIBER, id, host);
        console.error(LOG_TAG_SUBSCRIBER, error);
      }
    }
  }

  function context(definition: ScriptDefinition): ScriptContext {
    const abort = new host.AbortController();
    const cleanups: Array<() => void | Promise<void>> = [];
    const onDispose = (callback: () => void | Promise<void>) => cleanups.push(callback);

    let eventBus: ReturnType<typeof createEventBus> | undefined;
    let sharedEvents: ReturnType<typeof createSharedEvents> | undefined;
    let eventsValue: ScriptContext["events"] | undefined;
    let domEventsEngine: DomEventsEngine | undefined;

    function getEvents(): ScriptContext["events"] {
      if (!eventsValue) {
        eventBus = createEventBus({
          namespace: definition.id,
          signal: abort.signal,
          onDiagnostic: (diagnostic: unknown) => console.warn(LOG_TAG_EVENTS, diagnostic),
        });
        sharedEvents = createSharedEvents({ host, signal: abort.signal });
        domEventsEngine = createDomEventsEngine(definition.id, host);
        eventsValue = Object.freeze({ ...eventBus, shared: sharedEvents, dom: domEventsEngine });
      }
      return eventsValue;
    }

    onDispose(() => domEventsEngine?.dispose());

    let uiHost: HTMLDivElement | undefined;
    let uiRoot: ShadowRoot | undefined;

    function ensureUIRoot(): ShadowRoot {
      if (uiRoot?.isConnected) return uiRoot;
      const parent = host.document.body || host.document.documentElement;
      if (!parent) throw new Error("Document root is not available");

      uiHost = host.document.createElement("div");
      uiHost.dataset[DATASET_UI_ATTR] = definition.id;
      uiHost.style.setProperty("all", "initial");
      uiHost.style.setProperty("position", "fixed", "important");
      uiHost.style.setProperty("inset", "0", "important");
      uiHost.style.setProperty("width", "0", "important");
      uiHost.style.setProperty("height", "0", "important");
      uiHost.style.setProperty("z-index", Z_INDEX_MAX, "important");
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

    function getStore() {
      let store = stores.get(definition.id);
      if (!store) {
        store = rod.storage.create({
          namespace: `${STORAGE_NAMESPACE_PREFIX}${definition.id}`,
          backend: "auto",
        });
        stores.set(definition.id, store);
      }
      return store;
    }

    const databases = new Map<string, unknown>();
    function db(name: string = DEFAULT_DATABASE_NAME, options: Record<string, unknown> = {}) {
      if (typeof name !== "string" || !name.trim() || name.includes("..")) {
        throw new TypeError("Database name must be a non-empty namespace segment");
      }
      if (databases.has(name)) return databases.get(name);

      const instance = rod.storage.create({
        ...options,
        namespace: `${STORAGE_NAMESPACE_PREFIX}${definition.id}${DB_NAMESPACE_SEGMENT}${name}`,
        backend: { preferred: "indexeddb", fallbacks: [] },
      });

      databases.set(name, instance);
      onDispose(() => (instance as { close?: () => void })?.close?.());
      return instance;
    }

    const storage = Object.freeze({
      async get(key: string, fallback?: unknown): Promise<unknown> {
        const value = await getStore().get(key);
        if (value !== undefined) return value;
        const legacy = await bridge.call("get", { id: definition.id, key, fallback: undefined });
        if (legacy !== undefined) {
          await getStore().set(key, legacy);
          return legacy;
        }
        return fallback;
      },
      async set(key: string, value: unknown): Promise<void> {
        await getStore().set(key, value);
        await bridge.call("set", { id: definition.id, key, value });
      },
      async delete(key: string): Promise<void> {
        await getStore().delete(key);
        await bridge.call("delete", { id: definition.id, key });
      },
    });

    const gm =
      typeof __ROD_FEATURE_GM__ === "undefined" || __ROD_FEATURE_GM__
        ? createGMFeature(host, definition.id)
        : (undefined as unknown as ReturnType<typeof createGMFeature>);

    const network =
      typeof __ROD_FEATURE_HTTP__ === "undefined" || __ROD_FEATURE_HTTP__
        ? createHttpFeature(host, abort.signal, storage, definition.id)
        : null;

    if (network) onDispose(() => network.dispose());

    const dom =
      typeof __ROD_FEATURE_DOM__ === "undefined" || __ROD_FEATURE_DOM__
        ? createDomFeature(host, abort.signal)
        : (undefined as unknown as ReturnType<typeof createDomFeature>);

    if (dom) onDispose(() => dom.dispose());

    return {
      id: definition.id,
      diagnostics: Object.freeze({
        capture: (error: unknown, source = SOURCE_MANUAL) =>
          captureDiagnostic(error, source, definition.id, host),
        observeNetwork: () => {
          const stop = observeNetworkDiagnostics(host, abort.signal);
          onDispose(stop);
          return stop;
        },
      }),
      get events() {
        return getEvents();
      },
      query: queryService,
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
          host.document.dispatchEvent(
            new host.CustomEvent(DOCK_REGISTRY_EVENT, {
              detail: { type: "register", module },
            }),
          );
          onDispose(() =>
            host.document.dispatchEvent(
              new host.CustomEvent(DOCK_REGISTRY_EVENT, {
                detail: { type: "unregister", id: definition.id },
              }),
            ),
          );
        },
      }),
      updates: updaterInstance,
      toast: rod.toaster,
      toaster: rod.toaster,
      get url() {
        return new URL(desiredURL);
      },
      state: Object.freeze({
        get: () => stateValues.get(definition.id),
        set: (value: unknown) => publish(definition.id, value),
        subscribe(callback: (value: unknown) => void) {
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
      store<T extends object>(initial: T) {
        if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
        return createRoot((dispose) => {
          onDispose(dispose);
          return createStore(initial);
        });
      },
      observe(target, callback, options) {
        if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
        const observer = new host.MutationObserver(callback);
        observer.observe(target, options);
        onDispose(() => observer.disconnect());
        return observer;
      },
      interval(callback, milliseconds) {
        if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
        const timer = host.setInterval(callback, milliseconds);
        onDispose(() => host.clearInterval(timer));
        return timer;
      },
      listen(target, event, callback, options = {}) {
        const wrapped: EventListener = function (this: EventTarget, value: Event) {
          try {
            const result: unknown =
              typeof callback === "function" ? callback.call(this, value) : callback.handleEvent(value);
            if (result && typeof (result as Promise<unknown>).then === "function") {
              void Promise.resolve(result).catch((error) => {
                captureDiagnostic(error, `${EVENT_PREFIX}${event}`, definition.id, host);
                console.error(`${LOG_TAG_SCRIPT_PREFIX}${definition.id}]`, error);
              });
            }
          } catch (error) {
            captureDiagnostic(error, `${EVENT_PREFIX}${event}`, definition.id, host);
            throw error;
          }
        };
        target.addEventListener(event, wrapped, { ...options, signal: abort.signal });
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
        registerStyles(...styles: unknown[]) {
          if (!uiFeature) throw new Error("ctx.ui is not enabled in this bundle");
          const release = uiFeature.registerShadowStyles(ensureUIRoot(), styles.flat());
          onDispose(release);
          return release;
        },
        mountSolid(component: unknown, options: Record<string, unknown> = {}) {
          if (!uiFeature) throw new Error("ctx.ui is not enabled in this bundle");
          let release: () => void;
          try {
            release = uiFeature.mountSolidShadow(component, {
              ...options,
              target: ensureUIRoot(),
              onError: (error: unknown) => {
                captureDiagnostic(error, SOLID_REACTIVE_SOURCE, definition.id, host);
                if (typeof options.onError === "function") (options.onError as (err: unknown) => void)(error);
              },
            });
          } catch (error) {
            captureDiagnostic(error, SOLID_MOUNT_SOURCE, definition.id, host);
            throw error;
          }
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
            console.error(LOG_TAG_CLEANUP, error);
          }
        }
        cleanups.length = 0;
        listeners.delete(definition.id);
        stateValues.delete(definition.id);
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
        if (active.has(definition.id) || failures.get(definition.id) === url || !permitted(definition, url))
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
          captureDiagnostic(error, SOURCE_MODULE_INIT, definition.id, host);
          await ctx.dispose();
          failures.set(definition.id, url);
          console.error(`${LOG_TAG_SCRIPT_PREFIX}${definition.id}]`, error);
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

  for (const method of [HISTORY_PUSH_STATE, HISTORY_REPLACE_STATE] as const) {
    const original = host.history[method];
    const wrapper = function (this: History, ...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      void navigate();
      return result;
    };
    host.history[method] = wrapper as unknown as typeof original;
    undoHistory.push(() => {
      if (host.history[method] === wrapper) host.history[method] = original;
    });
  }

  host.addEventListener("popstate", navigate);
  host.addEventListener("hashchange", navigate);

  return {
    ready: navigate(),
    navigate,
    get active() {
      return Array.from(active.keys());
    },
    async dispose() {
      closed = true;
      updaterInstance?.stop();
      host.document.removeEventListener("keydown", clipboardKeydown as EventListener, true);
      if ((host as unknown as Record<string, unknown>).__RodClipboard === clipboard)
        delete (host as unknown as Record<string, unknown>).__RodClipboard;

      clipboard?.dispose();
      if (clipboard) {
        host.document.dispatchEvent(
          new host.CustomEvent(DOCK_REGISTRY_EVENT, {
            detail: { type: "unregister", id: clipboardModule.id },
          }),
        );
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
      stateValues.clear();
      listeners.clear();

      for (const store of stores.values()) (store as { close?: () => void })?.close?.();
      stores.clear();

      queryClient?.clear();
      queryClient = undefined;
      bridge.dispose?.();
    },
  };
}
