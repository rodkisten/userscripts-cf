import { useSyncExternalStore } from "react";
import type { ScriptContext } from "../../core/runtime";
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
  init(ctx: ScriptContext) {
    const abort = ctx.signal;
    ctx.ui.registerStyles(css);

    if (!ctx.menu) throw new Error("Instagram Bookmarks requires the runtime menu feature");
    const hub = installRodActions(ctx.menu, (component, container) => ({
      dispose: ctx.ui.mountReact(component, container),
    }));
    const runtime = {
      running: false,
      lastRun: 0,
      lastError: "",
      open: false,
      form: { ...DEFAULTS, token: "", channels: [] } as Form,
    };
    const listeners = new Set<() => void>();
    let version = 0;
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    const getSnapshot = () => version;
    const setRuntime = (update: (draft: typeof runtime) => void) => {
      update(runtime);
      version++;
      listeners.forEach((listener) => listener());
    };
    function SettingsMount() {
      useSyncExternalStore(subscribe, getSnapshot);
      return runtime.open ? (
        <SettingsDialog
          key={JSON.stringify(runtime.form)}
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
      ) : null;
    }
    function SavedActionsPanel() {
      useSyncExternalStore(subscribe, getSnapshot);
      return (
        <SavedPanel
          onOpen={() => void settingsApi.open()}
          running={runtime.running}
          error={runtime.lastError}
        />
      );
    }
    const unregisterActions = hub.register({
      id: "instagram-saved",
      title: "Instagram",
      tabs: [{ id: "saved", title: "Salvos", render: () => <SavedActionsPanel /> }],
    });
    ctx.onDispose(unregisterActions);
    ctx.ui.mountReact(<SettingsMount />);
    const get = async <T,>(key: string, fallback: T): Promise<T> =>
      (await ctx.storage.get(key, fallback)) as T;
    const set = async <T,>(key: string, value: T): Promise<void> => ctx.storage.set(key, value);
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
    const currentAccount = () => document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1];
    async function relay(config: Config, items: MediaPayload[], account: string) {
      if (currentAccount() !== account) throw Error("Conta alterada antes do envio ao Relay");
      const response = await ctx.http.request(RELAY, {
        method: "POST",
        transport: "gm",
        cacheMode: "off",
        timeoutMs: 90000,
        signal: abort,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({ items, channels: config.channels, concurrency: 1, force: false }),
      });
      abort.throwIfAborted();
      if (currentAccount() !== account) throw Error("Conta alterada durante envio ao Relay");
      if (!response.ok) {
        const error = Error(`Relay HTTP ${response.status}`) as Error & {
          status?: number;
          retryAfter?: string | null;
        };
        error.status = response.status;
        error.retryAfter = response.headers.get("retry-after");
        throw error;
      }
      const data: unknown = await response.json();
      abort.throwIfAborted();
      if (currentAccount() !== account) throw Error("Conta alterada após resposta do Relay");
      if (!data || typeof data !== "object" || !("results" in data) ||
          !Array.isArray(data.results)) {
        throw Error("Relay sem confirmação por item");
      }
      return data as { results: import("./core.ts").DeliveryResult[] };
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
      const config = await get<Config | null>("config", null);
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
            abort.throwIfAborted();
            if (currentAccount() !== account) throw Error("Conta alterada entre coleções");
            const stateKey = `delivered:${account}:${collectionId}:${[...config.channels].sort().join(",")}`;
            const cursorKey = `cursor:${account}:${collectionId}:${[...config.channels].sort().join(",")}`;
            count += await syncSaved({
              channels: config.channels,
              signal: abort,
              pause,
              settings: { ...settings, cursor: await get(cursorKey, "") },
              onCursor: (cursor) => set(cursorKey, cursor),
              load: () => get(stateKey, {}),
              save: (done) => set(stateKey, done),
              sendBatch: (items) => retry(() => relay(config, items, account), items.length),
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
                  const response = await ctx.http.request(url, {
                    transport: "fetch",
                    cacheMode: "off",
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
                  const page = await response.json();
                  abort.throwIfAborted();
                  if (currentAccount() !== account) throw Error("Conta alterada após leitura do Instagram");
                  return page;
                }, 50),
            });
          }
          await set("lastError", null);
          setRuntime((draft) => {
            draft.lastError = "";
          });
          if (count > 0) {
            ctx.toaster?.success?.({ title: `${count} mídias enviadas` });
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

    // Five taps on the native Instagram logo or bottom profile avatar reveal settings.
    // Capture only the fifth tap; ordinary navigation remains untouched.
    let taps = 0;
    let lastTap = 0;
    let lastTarget = "";
    const shortcut = (event: MouseEvent) => {
      const element = event.target;
      if (!(element instanceof Element)) {
        return;
      }
      const link = element.closest<HTMLElement>('a[href], [role="link"]');
      const profile =
        link?.matches('a[href^="/"][href$="/"]') &&
        !!link.querySelector('img[alt], img[src*="profile"], svg');
      const logo = !!element.closest(
        'a[href="/"], a[href="/home/"], svg[aria-label="Instagram"], [aria-label="Instagram"]',
      );
      if (!logo && !profile) {
        return;
      }
      const target = logo ? "logo" : "profile";
      const now = Date.now();
      taps = target === lastTarget && now - lastTap < 650 ? taps + 1 : 1;
      lastTarget = target;
      lastTap = now;
      if (taps === 5) {
        taps = 0;
        event.preventDefault();
        event.stopPropagation();
        void settingsApi.open();
      }
    };
    ctx.listen(document, "click", shortcut, { capture: true });
    mountReelBookmark(
      ctx,
      async () => (await get("settings", DEFAULTS)).collectionIds || [],
      (message) => ctx.toaster?.({ title: message }),
    );

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
    // Use the runtime GM bridge: it mirrors native commands into the Dock.
    // Prefer the modern API and fall back to the legacy Tampermonkey bridge.
    const gmMenu = ctx.gm.modern.registerMenuCommand ? ctx.gm.modern : ctx.gm.legacy;
    const menus: Array<number | string> = [];
    const registerMenu = gmMenu.registerMenuCommand;
    if (registerMenu) {
      for (const [label, callback] of [
        ["Instagram salvos · Configurar Relay", configure],
        ["Instagram salvos · Configurações", () => void settingsApi.open()],
        ["Instagram salvos · Sincronizar agora", () => void run(true)],
        [
          "Instagram salvos · Diagnóstico",
          async () => {
            const error = await get("lastError", null);
            setRuntime((draft) => {
              draft.lastError = error?.message || "Nenhum erro registrado";
            });
            await settingsApi.open();
          },
        ],
      ] as const) {
        menus.push(registerMenu(label, callback));
      }
    }
    ctx.dock?.register([
      { id: "settings", label: "Configurações", run: () => void settingsApi.open() },
      { id: "sync", label: "Sincronizar", run: () => void run(true) },
      { id: "relay", label: "Configurar Relay", run: configure },
    ]);
    // The script context owns the interval and cancels it on route disposal.
    ctx.interval(() => void run(), 60000);
    ctx.listen(document, "visibilitychange", () => void run());
    ctx.onDispose(() => {
      if (page.__XRodSettingsInstagram?.modules?.saved === settingsApi) {
        delete page.__XRodSettingsInstagram.modules.saved;
      }
      menus.forEach((id) => gmMenu.unregisterMenuCommand?.(id));
    });
    void run();
  },
};
