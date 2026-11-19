import { createUpdateChecker } from "./update-checker.js";
import { QueryClient } from "@tanstack/query-core";
import { captureDiagnostic, observeNetworkDiagnostics } from "../runtime/diagnostics.js";
import type { createGMBridge } from "../runtime/gm-bridge.js";
import { createGMFeature } from "../runtime/modular/features/gm.js";
import type { GMBridge } from "../runtime/gm-bridge.js";
import { createEventBus } from "../runtime/events/event-bus.js";
import { createSharedEvents } from "../runtime/events/shared-events.js";
import { matches, readScriptRules } from "./script-manager.js";
import { createHttpFeature } from "../runtime/modular/features/http.js";
import type { createClipboardManager } from "../runtime/clipboard-manager.js";
import { createClipboardFeature } from "../runtime/modular/features/clipboard.js";
import type { DomEngine } from "../runtime/dom-engine.js";
import { createDomFeature } from "../runtime/modular/features/dom.js";
import { createMenuFeature } from "../runtime/modular/features/menu.js";
import { createToasterFeature } from "../runtime/modular/features/toaster.js";
import { createStorageFeature } from "../runtime/modular/features/storage.js";
import { createUIFeature } from "../runtime/modular/features/ui.js";

declare const __ROD_FEATURE_MENU__: boolean;
declare const __ROD_FEATURE_TOASTER__: boolean;
declare const __ROD_FEATURE_CLIPBOARD__: boolean;
declare const __ROD_FEATURE_HTTP__: boolean;
declare const __ROD_FEATURE_DOM__: boolean;
declare const __ROD_FEATURE_GM__: boolean;

import {
  installCoreStyles,
  applyComponentStyle,
  clearComponentStyle,
  setCssProperty,
  setCssProperties,
} from "./css.js";

export const STORAGE_NAMESPACE_PREFIX = "userscripts-cf/";
export const DB_NAMESPACE_SEGMENT = "/db/";
export const CLIPBOARD_ID = "rod-clipboard";
export const CLIPBOARD_TITLE = "📋 Clipboard";
export const CLIPBOARD_DESCRIPTION = "Histórico local. Selecione um item para copiar novamente.";
export const CLIPBOARD_SEARCH_NAME = "query";
export const CLIPBOARD_SEARCH_LABEL = "Buscar";
export const CLIPBOARD_SEARCH_PLACEHOLDER = "Buscar no histórico";
export const CLIPBOARD_ITEM_NAME = "item";
export const CLIPBOARD_ITEM_LABEL = "Itens recentes";
export const CLIPBOARD_ACTION_COPY = "copy";
export const CLIPBOARD_ACTION_COPY_LABEL = "Copiar";
export const CLIPBOARD_ACTION_READ = "read";
export const CLIPBOARD_ACTION_READ_LABEL = "Ler clipboard";
export const CLIPBOARD_ACTION_CLEAR = "clear";
export const CLIPBOARD_ACTION_CLEAR_LABEL = "Excluir item";
export const UPDATE_PREFIX = "rod-update-";
export const UPDATE_LABEL = "Atualizar";
export const DOCK_REGISTRY_EVENT = "rod-dock:registry";
export const SCRIPT_MANAGER_CHANGE_EVENT = "rod-script-manager:change";
export const SOURCE_MANUAL = "manual";
export const SOURCE_STATE_SUBSCRIBER = "state.subscriber";
export const SOURCE_MODULE_INIT = "module.init";
export const LOG_TAG_EVENTS = "[Userscripts CF events]";
export const LOG_TAG_SUBSCRIBER = "[Userscripts CF subscriber]";
export const LOG_TAG_CLEANUP = "[Userscripts CF cleanup]";
export const LOG_TAG_SCRIPT_PREFIX = "[Userscripts CF: ";
export const DOM_EVENT_PREFIX = "dom.event:";
export const EVENT_PREFIX = "event:";
export const HISTORY_PUSH_STATE = "pushState";
export const HISTORY_REPLACE_STATE = "replaceState";
export const DATASET_UI_ATTR = "userscriptsCfUi";
export const DEFAULT_DATABASE_NAME = "default";
export const CLIPBOARD_HISTORY_LIMIT = 30;
export const CLIPBOARD_SNIPPET_LENGTH = 90;
export const QUERY_RETRY_COUNT = 1;
export const QUERY_GC_TIME = 300_000;
export const Z_INDEX_MAX = "2147483647";

export interface ScriptDefinition {
  readonly id: string;
  readonly name?: string;
  readonly match?: string | ReadonlyArray<string>;
  readonly matches?: ReadonlyArray<string>;
  readonly includes?: ReadonlyArray<string>;
  readonly exclude?: ReadonlyArray<string>;
  readonly excludeMatches?: ReadonlyArray<string>;
  readonly excludes?: ReadonlyArray<string>;
  readonly module: {
    readonly init: (ctx: ScriptContext) => void | (() => void) | Promise<void | (() => void)>;
  };
}

export type ScriptContext = Record<string, unknown> & {
  readonly id: string;
  readonly signal: AbortSignal;
  readonly events?: ReturnType<typeof createEventBus>;
  readonly http: ReturnType<typeof createHttpFeature>["http"];
  readonly gm: ReturnType<typeof createGMFeature> | undefined;
  readonly dispose: () => Promise<void>;
  readonly storage: {
    readonly local: {
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: unknown): Promise<void>;
      removeItem(key: string): Promise<void>;
    };
    get(key: string, fallback?: unknown): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  readonly dom: ReturnType<typeof createDomFeature>;
  readonly ui?: ReturnType<typeof createUIFeature> & {
    readonly root: ShadowRoot;
    readonly host: HTMLDivElement;
    mount(node: Node): Node;
    style(css: string): HTMLStyleElement;
    pageStyle(css: string, options?: { id?: string }): HTMLStyleElement;
    registerStyles(...styles: import("../runtime/react-ui/shadow-styles.js").ShadowStyle[]): () => void;
    mountReact(component: import("react").ReactElement, container?: Element | ShadowRoot): () => void;
  };
  readonly dock: { register(actions: ReadonlyArray<DockAction>): void };
  readonly observe: (
    target: Node,
    callback: MutationCallback,
    options: MutationObserverInit,
  ) => MutationObserver;
  readonly pageStyle: (cssContent: string) => HTMLStyleElement;
  readonly interval: (callback: () => void, milliseconds: number) => number;
  readonly listen: (
    target: EventTarget,
    event: string,
    callback: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => void;
  readonly menu: ReturnType<typeof createMenuFeature> | undefined;
  readonly toaster: ReturnType<typeof createToasterFeature> | undefined;
  readonly onDispose: (cleanup: () => void | Promise<void>) => void;
};

export interface DockAction {
  readonly id: string;
  readonly label: string;
  readonly run: () => void | Promise<void>;
}

export interface DomEventsEngine {
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
  readonly ready: Promise<void>;
  navigate: () => Promise<void>;
  readonly active: ReadonlyArray<string>;
  dispose: () => Promise<void>;
}

export function initializeRodFeatures(
  host: Window & typeof globalThis,
  mountSharedReact?: Parameters<typeof createToasterFeature>[0],
) {
  return {
    menu:
      (typeof __ROD_FEATURE_MENU__ === "undefined" || __ROD_FEATURE_MENU__) && mountSharedReact
        ? createMenuFeature({ mountSharedReact })
        : undefined,
    toaster:
      (typeof __ROD_FEATURE_TOASTER__ === "undefined" || __ROD_FEATURE_TOASTER__) && mountSharedReact
        ? createToasterFeature(mountSharedReact)
        : undefined,
    storage: createStorageFeature(host),
  };
}

export function setupUpdateChecker(
  release: { readonly id: string; readonly version: string; readonly manifestURL: string },
  host: Window & typeof globalThis,
  rod: ReturnType<typeof initializeRodFeatures>,
  updaterInstanceRef: { current: ReturnType<typeof createUpdateChecker> | null },
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
        onDismiss: () => updaterInstanceRef.current?.dismiss(update.latestVersion),
      });
    },
  });
}

export function createDomEventsEngine(
  definitionId: string,
  host: Window & typeof globalThis,
): DomEventsEngine {
  const domListeners = new Map<
    EventTarget,
    Map<
      string,
      Map<
        EventListenerOrEventListenerObject,
        Map<boolean, { readonly listener: EventListener; readonly options: unknown }>
      >
    >
  >();

  const captureOf = (options?: boolean | AddEventListenerOptions) =>
    typeof options === "boolean" ? options : !!(options as AddEventListenerOptions)?.capture;

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
            void Promise.resolve(result).catch((error: unknown) => {
              captureDiagnostic(error, `${DOM_EVENT_PREFIX}${type}`, definitionId, host);
              console.error(`${LOG_TAG_SCRIPT_PREFIX}${definitionId}]`, error);
            });
          }
        } catch (error: unknown) {
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

export function createCoreRuntime(
  definitions: ReadonlyArray<ScriptDefinition>,
  bridge: {
    readonly call: (method: string, payload: unknown) => Promise<unknown>;
    readonly dispose?: () => void;
  },
  host: Window & typeof globalThis = window,
  release?: { readonly id: string; readonly version: string; readonly manifestURL: string },
  options?: {
    mountSharedReact?: Parameters<typeof createToasterFeature>[0];
    installHelpers?: () => Array<string>;
    removeHelpers?: (installedHelpers: Array<string>) => void;
    createSpecificContext: (params: {
      readonly definition: ScriptDefinition;
      readonly abort: AbortController;
      readonly getContext: () => ScriptContext;
      readonly onDispose: (cb: () => void | Promise<void>) => void;
      readonly ensureUIRoot: () => ShadowRoot;
      readonly addStyle: (css: string, target: ParentNode) => HTMLStyleElement;
      readonly storage: unknown;
      readonly db: (name?: string, options?: Record<string, unknown>) => unknown;
      readonly clipboard: unknown;
      readonly openClipboardMenu: () => void;
      readonly dom: unknown;
      readonly network: unknown;
      readonly rod: ReturnType<typeof initializeRodFeatures>;
      readonly queryService: unknown;
      readonly updaterInstance: ReturnType<typeof createUpdateChecker> | null;
      readonly host: Window & typeof globalThis;
      readonly desiredURL: string;
      readonly stateValues: Map<string, unknown>;
      readonly listeners: Map<string, Set<(value: unknown) => void>>;
      readonly publish: (id: string, value: unknown) => void;
    }) => Record<string, unknown>;
  },
) {
  const rod = initializeRodFeatures(host, options?.mountSharedReact);
  const updaterInstanceRef = { current: null as ReturnType<typeof createUpdateChecker> | null };

  updaterInstanceRef.current = release ? setupUpdateChecker(release, host, rod, updaterInstanceRef) : null;
  updaterInstanceRef.current?.start();

  const installedHelpers = options?.installHelpers ? options.installHelpers() : [];

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
          options: entries.map((item: { readonly id: string; readonly text: string }) => ({
            value: item.id,
            label: item.text.slice(0, CLIPBOARD_SNIPPET_LENGTH),
          })),
        },
      ],
      actions: [
        {
          id: CLIPBOARD_ACTION_COPY,
          label: CLIPBOARD_ACTION_COPY_LABEL,
          handler: async (ctx: { readonly values: { readonly item?: unknown } }) => {
            const item = ctx.values.item;
            if (typeof item !== "string") return false;
            return clipboard.copy(item);
          },
        },
        { id: CLIPBOARD_ACTION_READ, label: CLIPBOARD_ACTION_READ_LABEL, handler: () => clipboard.read() },
        {
          id: CLIPBOARD_ACTION_CLEAR,
          label: CLIPBOARD_ACTION_CLEAR_LABEL,
          variant: "danger",
          handler: (ctx: { readonly values: { readonly item?: unknown } }) => {
            const item = ctx.values.item;
            if (typeof item !== "string") return;
            return clipboard.remove(item);
          },
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
    matches(
      {
        ...definition,
        name: definition.name ?? definition.id,
        matches: definition.matches ? [...definition.matches] : undefined,
        includes: definition.includes ? [...definition.includes] : undefined,
        exclude: definition.exclude ? [...definition.exclude] : undefined,
        excludeMatches: definition.excludeMatches ? [...definition.excludeMatches] : undefined,
        excludes: definition.excludes ? [...definition.excludes] : undefined,
      },
      url,
      rules()[definition.id],
    );

  const onRulesChange = () => {
    void navigate();
  };

  host.addEventListener("storage", onRulesChange);
  host.document.addEventListener("rod-script-manager:change", onRulesChange);

  const active = new Map<
    string,
    {
      readonly definition: ScriptDefinition;
      readonly context: Record<string, unknown> & { readonly dispose: () => Promise<void> };
    }
  >();
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
      } catch (error: unknown) {
        captureDiagnostic(error, SOURCE_STATE_SUBSCRIBER, id, host);
        console.error(LOG_TAG_SUBSCRIBER, error);
      }
    }
  }

  function createContext(definition: ScriptDefinition) {
    const abort = new host.AbortController();
    const cleanups: Array<() => void | Promise<void>> = [];
    const onDispose = (callback: () => void | Promise<void>) => cleanups.push(callback);

    let uiHost: HTMLDivElement | undefined;
    let uiRoot: ShadowRoot | undefined;

    function ensureUIRoot(): ShadowRoot {
      if (uiRoot?.isConnected) return uiRoot;
      const parent = host.document.body || host.document.documentElement;
      if (!parent) throw new Error("Document root is not available");

      uiHost = host.document.createElement("div");
      uiHost.dataset[DATASET_UI_ATTR] = definition.id;

      setCssProperties(
        uiHost,
        {
          all: "initial",
          position: "fixed",
          inset: "0",
          width: "0",
          height: "0",
          zIndex: Z_INDEX_MAX,
          pointerEvents: "none",
          visibility: "visible",
        },
        { important: true },
      );

      uiRoot = uiHost.attachShadow({ mode: "open" });
      parent.append(uiHost);

      onDispose(() => {
        uiHost?.remove();
        uiHost = undefined;
        uiRoot = undefined;
      });
      return uiRoot;
    }

    function addStyle(cssContent: string, target: ParentNode): HTMLStyleElement {
      const node = host.document.createElement("style");
      node.textContent = String(cssContent);
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
      onDispose(() => (instance as { readonly close?: () => void })?.close?.());
      return instance;
    }

    // Compatibility layer for explicit async migration of legacy localStorage.
    // Native localStorage remains the source of truth when available; the
    // namespaced store is a fallback and receives imported values on reads.
    const localStorageCompat = Object.freeze({
      async getItem(key: string): Promise<string | null> {
        let nativeValue: string | null = null;
        try {
          nativeValue = host.localStorage.getItem(key);
        } catch {
          // Private browsing and denied storage access use the async backend.
        }
        if (nativeValue !== null) {
          await getStore().set("local:" + key, nativeValue);
          return nativeValue;
        }
        const stored = await getStore().get("local:" + key);
        return typeof stored === "string" ? stored : null;
      },
      async setItem(key: string, value: unknown): Promise<void> {
        const stringValue = String(value);
        await getStore().set("local:" + key, stringValue);
        try {
          host.localStorage.setItem(key, stringValue);
        } catch {
          // The namespaced backend already contains the new value.
        }
      },
      async removeItem(key: string): Promise<void> {
        await getStore().delete("local:" + key);
        try {
          host.localStorage.removeItem(key);
        } catch {
          // Removal from the async backend is already complete.
        }
      },
    });

    const storage = Object.freeze({
      local: localStorageCompat,
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

    let resolvedContext: ScriptContext;
    const getContext = () => resolvedContext;
    const specificContext = options?.createSpecificContext
      ? options.createSpecificContext({
          definition,
          abort,
          onDispose,
          getContext,
          ensureUIRoot,
          addStyle,
          storage,
          db,
          clipboard,
          openClipboardMenu,
          dom,
          network,
          rod,
          queryService,
          updaterInstance: updaterInstanceRef.current,
          host,
          desiredURL,
          stateValues,
          listeners,
          publish,
        })
      : {};

    const instanceMenu = options?.mountSharedReact
      ? createMenuFeature({
          container: ensureUIRoot,
          onDispose,
          mountSharedReact: options.mountSharedReact,
        })
      : undefined;

    const baseContext = {
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
      query: {
        ...queryService,
      },
      http: network?.http,
      interceptRequest: network?.interceptRequest ?? (() => {}),
      interceptResponse: network?.interceptResponse ?? (() => {}),
      gm:
        typeof __ROD_FEATURE_GM__ === "undefined" || __ROD_FEATURE_GM__
          ? createGMFeature(host, definition.id)
          : undefined,
      clipboard: clipboard && Object.freeze({ ...clipboard, open: openClipboardMenu }),
      dom,
      db,
      signal: abort.signal,
      storage,
      menu: typeof __ROD_FEATURE_MENU__ === "undefined" || __ROD_FEATURE_MENU__ ? instanceMenu : undefined,
      dock: Object.freeze({
        register(actions: ReadonlyArray<DockAction>) {
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
          onDispose(() => {
            host.document.dispatchEvent(
              new host.CustomEvent(DOCK_REGISTRY_EVENT, {
                detail: { type: "unregister", id: definition.id },
              }),
            );
          });
        },
      }),
      updates: updaterInstanceRef.current,
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
          const off = () => {
            set!.delete(callback);
          };
          onDispose(off);
          return off;
        },
      }),
      onDispose,
      observe(target: Node, callback: MutationCallback, options: MutationObserverInit) {
        if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
        const observer = new host.MutationObserver(callback);
        observer.observe(target, options);
        onDispose(() => observer.disconnect());
        return observer;
      },
      interval(callback: () => void, milliseconds: number) {
        if (abort.signal.aborted) throw new Error("ScriptContext already disposed");
        const timer = host.setInterval(callback, milliseconds);
        onDispose(() => host.clearInterval(timer));
        return timer;
      },
      listen(
        target: EventTarget,
        event: string,
        callback: EventListenerOrEventListenerObject,
        options: AddEventListenerOptions | boolean = {},
      ) {
        const wrapped: EventListener = function (this: EventTarget, value: Event) {
          try {
            const result: unknown =
              typeof callback === "function" ? callback.call(this, value) : callback.handleEvent(value);
            if (result && typeof (result as Promise<unknown>).then === "function") {
              void Promise.resolve(result).catch((error: unknown) => {
                captureDiagnostic(error, `${EVENT_PREFIX}${event}`, definition.id, host);
                console.error(`${LOG_TAG_SCRIPT_PREFIX}${definition.id}]`, error);
              });
            }
          } catch (error: unknown) {
            captureDiagnostic(error, `${EVENT_PREFIX}${event}`, definition.id, host);
            throw error;
          }
        };
        target.addEventListener(event, wrapped, {
          ...(typeof options === "object" ? options : {}),
          signal: abort.signal,
        });
      },
      style(cssContent: string) {
        return addStyle(cssContent, ensureUIRoot());
      },
      pageStyle(cssContent: string, options?: { id?: string }) {
        const id = options?.id;
        const existing = id ? host.document.getElementById(id) : null;
        if (existing instanceof HTMLStyleElement) {
          existing.textContent = String(cssContent);
          return existing;
        }
        const node = addStyle(cssContent, host.document.head || host.document.documentElement);
        if (id) node.id = id;
        return node;
      },
      css: Object.freeze({
        installCoreStyles,
        applyComponentStyle,
        clearComponentStyle,
        setCssProperty,
        setCssProperties,
      }),
      async dispose() {
        abort.abort();
        for (const cleanup of [...cleanups].reverse()) {
          try {
            await cleanup();
          } catch (error: unknown) {
            console.error(LOG_TAG_CLEANUP, error);
          }
        }
        cleanups.length = 0;
        listeners.delete(definition.id);
        stateValues.delete(definition.id);
      },
    };

    resolvedContext = Object.assign(baseContext, specificContext) as ScriptContext;
    return resolvedContext;
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
        const ctx = createContext(definition);
        try {
          const cleanup = await definition.module.init(ctx as unknown as ScriptContext);
          if (typeof cleanup === "function") ctx.onDispose(cleanup);
          if (closed || desiredURL !== url) await ctx.dispose();
          else {
            active.set(definition.id, { definition, context: ctx });
            failures.delete(definition.id);
          }
        } catch (error: unknown) {
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
      if (options?.removeHelpers) {
        options.removeHelpers(installedHelpers);
      }
      updaterInstanceRef.current?.stop();
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
      // The toaster is runtime-owned (shared across script contexts), so release it
      // only after every context has completed its own cleanup.
      rod.toaster?.destroy();
      active.clear();
      failures.clear();
      stateValues.clear();
      listeners.clear();

      for (const store of stores.values()) (store as { readonly close?: () => void })?.close?.();
      stores.clear();

      queryClient?.clear();
      queryClient = undefined;
      bridge.dispose?.();
    },
  };
}
