import { createStore, Show } from "solid-js";
import { SavedPanel, SettingsDialog, css, type Form } from "./Settings.tsx";
import type { MediaPayload, Page } from "./core.ts";
import { mountReelBookmark } from "./reel-bookmark.tsx";
import { installRodActions } from "../../runtime/actions/index.tsx";
type Config = { token: string; channels: string[] };
type Settings = {
  enabled: boolean;
  collectionIds: string[];
  delayMs: number;
  jitterMs: number;
  batchSize: number;
  maxItemsPerSession: number;
};

type RuntimeContext = {
  menu: { open: (options: any) => { result: Promise<any> }; configure?: (options: any) => void };
  toaster: ((options: any) => any) & { success?: (options: any) => any };
  signal: AbortSignal;
  storage: {
    get: (key: string, fallback: any) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
  };
  style: (css: string) => void;
  pageStyle: (css: string) => void;
  ui: {
    root: ShadowRoot;
    mount: (node: Node) => Node;
    registerStyles: (...css: string[]) => () => void;
    mountSolid: (component: () => any, options?: { styles?: string[]; id?: string }) => () => void;
  };
  listen: (target: EventTarget, event: string, callback: () => void) => void;
  onDispose: (callback: () => void) => void;
};

declare const GM_xmlhttpRequest: ((options: any) => { abort: () => void }) | undefined;
declare const GM_registerMenuCommand: ((label: string, callback: () => void) => any) | undefined;
declare const GM_unregisterMenuCommand: ((id: any) => void) | undefined;
declare const unsafeWindow: (Window & typeof globalThis & { __XRodSettingsInstagram?: any }) | undefined;
declare const RodMenu:
  { open: (options: any) => { result: Promise<any> }; configure?: (options: any) => void } | undefined;
import { COLLECTION_PATH, retryDelay, syncSaved } from "./core.ts";

const DEFAULTS = {
  enabled: false,
  collectionIds: [],
  delayMs: 1500,
  jitterMs: 500,
  batchSize: 10,
  maxItemsPerSession: 100,
};
const RELAY = "https://xtelegram-cf.migos.club/batch";

export default {
  init(ctx: RuntimeContext) {
    const abort = ctx.signal;
    ctx.ui.registerStyles(css);
    mountReelBookmark(abort, ctx.pageStyle);
    const hub = installRodActions(ctx.menu);
    const unregisterActions = hub.register({
      id: "instagram-saved",
      title: "Instagram",
      tabs: [
        {
          id: "saved",
          title: "Salvos",
          render() {
            return (
              <SavedPanel
                onOpen={() => void settingsApi.open()}
                running={runtime.running}
                error={runtime.lastError}
              />
            );
          },
        },
      ],
    });
    ctx.onDispose(unregisterActions);
    const [runtime, setRuntime] = createStore({
      running: false,
      lastRun: 0,
      lastError: "",
      open: false,
      form: { ...DEFAULTS, token: "", channels: [] } as Form,
    });
    ctx.ui.mountSolid(
      () => (
        <Show when={runtime.open}>
          <SettingsDialog
            settings={runtime.form}
            error={runtime.lastError}
            close={() =>
              setRuntime((draft) => {
                draft.open = false;
              })
            }
            save={async (form) => {
              const { token, channels, ...settings } = form;
              await settingsApi.update(settings);
              await set("config", { token: token.trim(), channels });
              setRuntime((draft) => {
                draft.open = false;
              });
              void run(true);
            }}
          />
        </Show>
      ),
      { styles: [css], id: "instagram-settings" },
    );
    const get = async (key: string, fallback: any) => ctx.storage.get(key, fallback);
    const set = async (key: string, value: any) => ctx.storage.set(key, value);
    const pause = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        abort.throwIfAborted();
        const cancelled = () => {
          clearTimeout(timer);
          reject(abort.reason);
        };
        const timer = setTimeout(() => {
          abort.removeEventListener("abort", cancelled);
          resolve();
        }, ms);
        abort.addEventListener("abort", cancelled, { once: true });
      });
    async function configure() {
      await settingsApi.open();
    }
    function relay(config: Config, items: MediaPayload[]) {
      return new Promise<{ results: import("./core.ts").DeliveryResult[] }>((resolve, reject) => {
        const request =
          typeof GM_xmlhttpRequest === "function"
            ? GM_xmlhttpRequest
            : (globalThis as any).GM?.xmlHttpRequest;
        if (!request) {
          return reject(Error("GM_xmlhttpRequest indisponível"));
        }
        const handle = request({
          method: "POST",
          url: RELAY,
          anonymous: true,
          timeout: 90000,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
          data: JSON.stringify({ items, channels: config.channels, concurrency: 1, force: false }),
          onload(response: any) {
            abort.removeEventListener("abort", cancel);
            try {
              const data = JSON.parse(response.responseText);
              if (Array.isArray(data.results)) {
                return resolve(data);
              }
              const error = Error(`Relay HTTP ${response.status}`) as Error & {
                status?: number;
                retryAfter?: string;
              };
              error.status = response.status;
              error.retryAfter = response.responseHeaders?.match(/^retry-after:\s*(.+)$/im)?.[1]?.trim();
              reject(error);
            } catch (error) {
              reject(error);
            }
          },
          onerror: () => {
            abort.removeEventListener("abort", cancel);
            reject(Error("Falha de rede Relay"));
          },
          ontimeout: () => {
            abort.removeEventListener("abort", cancel);
            reject(Error("Timeout Relay; entrega incerta"));
          },
          onabort: () => reject(Error("Envio interrompido")),
        });
        function cancel() {
          handle?.abort();
        }
        abort.addEventListener("abort", cancel, { once: true });
      });
    }
    async function retry<T>(operation: () => Promise<T>, size: number): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        abort.throwIfAborted();
        try {
          return await operation();
        } catch (caught) {
          const error = caught as Error & { status?: number; retryAfter?: string };
          if (attempt >= 3 || !(error.status === 429 || error.status >= 500)) {
            throw error;
          }
          await pause(retryDelay(attempt, size, error.retryAfter));
        }
      }
    }
    async function run(manual = false) {
      if (runtime.running || (!manual && (document.hidden || Date.now() - runtime.lastRun < 300000))) {
        return;
      }
      const config = await get("config", null);
      const settings = { ...DEFAULTS, ...(await get("settings", {})) };
      if (!settings.enabled || !settings.collectionIds?.length) {
        return;
      }
      const account = document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1];
      if (!config?.token || !account) {
        return;
      }
      setRuntime((draft) => {
        draft.running = true;
        draft.lastRun = Date.now();
      });
      try {
        if (!navigator.locks) {
          throw Error("Web Locks indisponível; sincronização desativada para evitar concorrência");
        }
        await navigator.locks.request(`instagram-saved:${account}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            return;
          }
          abort.throwIfAborted();
          let count = 0;
          for (const collectionId of settings.collectionIds) {
            const stateKey = `delivered:${account}:${collectionId}:${[...config.channels].sort().join(",")}`;
            const cursorKey = `cursor:${account}:${collectionId}`;
            count += await syncSaved({
              channels: config.channels,
              signal: abort,
              pause,
              settings: { ...settings, cursor: await get(cursorKey, "") },
              onCursor: (cursor) => set(cursorKey, cursor),
              load: () => get(stateKey, {}),
              save: (done) => set(stateKey, done),
              sendBatch: (items) => retry(() => relay(config, items), items.length),
              fetchPage: (cursor) =>
                retry(async () => {
                  if (document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1] !== account) {
                    throw Error("Conta alterada");
                  }
                  const url = new URL(COLLECTION_PATH(collectionId), location.origin);
                  url.searchParams.set("count", "50");
                  if (cursor) {
                    url.searchParams.set("max_id", cursor);
                  }
                  const response = await fetch(url, {
                    credentials: "same-origin",
                    signal: abort,
                    headers: {
                      "X-IG-App-ID": "936619743392459",
                      "X-Requested-With": "XMLHttpRequest",
                      "X-CSRFToken": decodeURIComponent(
                        document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] || "",
                      ),
                    },
                  });
                  if (!response.ok) {
                    const error = Error(`Instagram HTTP ${response.status}`) as Error & {
                      status?: number;
                      retryAfter?: string | null;
                    };
                    error.status = response.status;
                    error.retryAfter = response.headers.get("retry-after");
                    throw error;
                  }
                  return response.json();
                }, 50),
            });
          }
          await set("lastError", null);
          setRuntime((draft) => {
            draft.lastError = "";
          });
          if (count > 0) {
            ctx.toaster.success?.({ title: `${count} mídias enviadas` });
          }
        });
      } catch (caught) {
        const error = caught as Error;
        if (!abort.aborted) {
          await set("lastError", { message: error.message, at: Date.now() });
          setRuntime((draft) => {
            draft.lastError = error.message;
          });
        }
      } finally {
        setRuntime((draft) => {
          draft.running = false;
        });
      }
    }

    const settingsApi = {
      async get() {
        return { ...DEFAULTS, ...(await get("settings", {})) };
      },
      async update(patch: Partial<Settings>) {
        const next = { ...(await this.get()), ...patch };
        next.collectionIds = [
          ...new Set(
            (next.collectionIds || [])
              .map(String)
              .map((v) => v.trim())
              .filter(Boolean),
          ),
        ];
        await set("settings", next);
        return next;
      },
      run: () => run(true),
      async open() {
        const settings = await this.get();
        const config = await get("config", { token: "", channels: [] });
        const error = await get("lastError", null);
        if (abort.aborted) {
          return;
        }
        setRuntime((draft) => {
          draft.form = { ...settings, ...config };
          draft.lastError = error?.message || "";
          draft.open = true;
        });
      },
    };
    const page = (typeof unsafeWindow !== "undefined" ? unsafeWindow : window) as Window &
      typeof globalThis & { __XRodSettingsInstagram?: any };
    page.__XRodSettingsInstagram ||= { modules: {} };
    page.__XRodSettingsInstagram.modules.saved = settingsApi;
    const menus: any[] = [];
    if (typeof GM_registerMenuCommand === "function") {
      menus.push(GM_registerMenuCommand("Instagram salvos · Configurar Relay", configure));
      menus.push(GM_registerMenuCommand("Instagram salvos · Configurações", () => void settingsApi.open()));
      menus.push(GM_registerMenuCommand("Instagram salvos · Sincronizar agora", () => void run(true)));
      menus.push(
        GM_registerMenuCommand("Instagram salvos · Diagnóstico", async () => {
          const error = await get("lastError", null);
          setRuntime((draft) => {
            draft.lastError = error?.message || "Nenhum erro registrado";
          });
          await settingsApi.open();
        }),
      );
    }
    ctx.dock?.register([
      { id: "settings", label: "Configurações", run: () => void settingsApi.open() },
      { id: "sync", label: "Sincronizar", run: () => void run(true) },
      { id: "relay", label: "Configurar Relay", run: configure },
    ]);
    const timer = setInterval(() => void run(), 60000);
    ctx.listen(document, "visibilitychange", () => void run());
    ctx.onDispose(() => {
      clearInterval(timer);
      if (page.__XRodSettingsInstagram?.modules?.saved === settingsApi) {
        delete page.__XRodSettingsInstagram.modules.saved;
      }
      if (typeof GM_unregisterMenuCommand === "function") {
        menus.forEach((id) => GM_unregisterMenuCommand(id));
      }
    });
    void run();
  },
};
