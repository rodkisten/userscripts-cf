import type { MediaPayload, Page } from "./core.ts";
import { mountReelBookmark } from "./reel-bookmark.ts";
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
    mountReelBookmark(abort);
    let running = false;
    let lastRun = 0;
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
      const token = prompt("Token do XTelegram Relay (armazenado no userscript):");
      if (!token) return;
      const channels = prompt("IDs dos canais Telegram, separados por vírgula:");
      if (!channels) return;
      const ids = [
        ...new Set(
          channels
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ];
      if (!ids.length) return;
      await set("config", { token: token.trim(), channels: ids });
      void run(true);
    }
    function relay(config: Config, items: MediaPayload[]) {
      return new Promise<{ results: import("./core.ts").DeliveryResult[] }>((resolve, reject) => {
        const request =
          typeof GM_xmlhttpRequest === "function"
            ? GM_xmlhttpRequest
            : (globalThis as any).GM?.xmlHttpRequest;
        if (!request) return reject(Error("GM_xmlhttpRequest indisponível"));
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
              if (Array.isArray(data.results)) return resolve(data);
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
          if (attempt >= 3 || !(error.status === 429 || error.status >= 500)) throw error;
          await pause(retryDelay(attempt, size, error.retryAfter));
        }
      }
    }
    async function run(manual = false) {
      if (running || (!manual && (document.hidden || Date.now() - lastRun < 300000))) return;
      const config = await get("config", null);
      const settings = { ...DEFAULTS, ...(await get("settings", {})) };
      if (!settings.enabled || !settings.collectionIds?.length) return;
      const account = document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1];
      if (!config?.token || !account) return;
      running = true;
      lastRun = Date.now();
      try {
        if (!navigator.locks)
          throw Error("Web Locks indisponível; sincronização desativada para evitar concorrência");
        await navigator.locks.request(`instagram-saved:${account}`, { ifAvailable: true }, async (lock) => {
          if (!lock) return;
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
                  if (document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1] !== account)
                    throw Error("Conta alterada");
                  const url = new URL(COLLECTION_PATH(collectionId), location.origin);
                  url.searchParams.set("count", "50");
                  if (cursor) url.searchParams.set("max_id", cursor);
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
          if (count > 0) ctx.toaster.success?.({ title: `${count} mídias enviadas` });
        });
      } catch (caught) {
        const error = caught as Error;
        if (!abort.aborted) await set("lastError", { message: error.message, at: Date.now() });
      } finally {
        running = false;
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
        const external = ctx.menu;
        if (!external?.open) throw Error("RodMenu não carregado");
        external.configure?.({ defaultPresentation: "bottom-sheet" });
        const root = document.createElement("div");
        root.className = "instagram-saved-settings";
        const field = (label: string, value: string | number | boolean, type = "text") => {
          const wrapper = document.createElement("label");
          wrapper.textContent = label;
          const input = document.createElement("input");
          input.type = type;
          if (type === "checkbox") input.checked = Boolean(value);
          else input.value = String(value);
          wrapper.append(input);
          root.append(wrapper);
          return input;
        };
        const enabled = field("Sincronização automática", settings.enabled, "checkbox");
        const ids = field("IDs das coleções (separados por vírgula)", settings.collectionIds.join(", "));
        const delay = field("Delay (ms)", settings.delayMs, "number");
        const jitter = field("Jitter (ms)", settings.jitterMs, "number");
        const batch = field("Itens por lote", settings.batchSize, "number");
        const max = field("Limite por execução", settings.maxItemsPerSession, "number");
        const handle = external.open({
          id: "xrod-instagram-saved-settings",
          title: "Instagram · Coleções salvas",
          presentation: "bottom-sheet",
          fields: [{ type: "custom", name: "settings", chrome: "bare", render: () => root }],
          actions: [
            { id: "save", label: "Salvar", role: "submit" },
            { id: "cancel", label: "Cancelar", role: "cancel" },
          ],
        });
        const result = await handle.result;
        if (result?.action === "cancel" || result?.actionId === "cancel") return;
        await this.update({
          enabled: enabled.checked,
          collectionIds: ids.value.split(","),
          delayMs: Math.max(0, Number(delay.value) || 0),
          jitterMs: Math.max(0, Number(jitter.value) || 0),
          batchSize: Math.max(1, Number(batch.value) || 10),
          maxItemsPerSession: Math.max(1, Number(max.value) || 100),
        });
        void run(true);
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
          alert(
            error ? `${error.message}\n${new Date(error.at).toLocaleString()}` : "Nenhum erro registrado",
          );
        }),
      );
    }
    const timer = setInterval(() => void run(), 60000);
    ctx.listen(document, "visibilitychange", () => void run());
    ctx.onDispose(() => {
      clearInterval(timer);
      if (page.__XRodSettingsInstagram?.modules?.saved === settingsApi)
        delete page.__XRodSettingsInstagram.modules.saved;
      if (typeof GM_unregisterMenuCommand === "function") menus.forEach((id) => GM_unregisterMenuCommand(id));
    });
    void run();
  },
};
