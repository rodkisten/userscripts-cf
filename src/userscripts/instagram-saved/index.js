import { SAVED_PATH, retryDelay, syncSaved } from "./core.js";
import css from "./style.css?inline";

const RELAY = "https://xtelegram-cf.migos.club/batch";

export default {
  init(ctx) {
    const abort = ctx.signal;
    let running = false;
    let lastRun = 0;
    const get = async (key, fallback) => ctx.storage.get(key, fallback);
    const set = async (key, value) => ctx.storage.set(key, value);
    const pause = ms => new Promise((resolve, reject) => {
      abort.throwIfAborted();
      const cancelled = () => { clearTimeout(timer); reject(abort.reason); };
      const timer = setTimeout(() => { abort.removeEventListener("abort", cancelled); resolve(); }, ms);
      abort.addEventListener("abort", cancelled, { once: true });
    });
    ctx.style(css);
    function toast(text) {
      const node = document.createElement("div");
      node.className = "instagram-saved-toast";
      node.setAttribute("role", "status");
      node.textContent = text;
      document.documentElement.append(node);
      setTimeout(() => node.remove(), 4000);
    }
    async function configure() {
      const token = prompt("Token do XTelegram Relay (armazenado no userscript):");
      if (!token) return;
      const channels = prompt("IDs dos canais Telegram, separados por vírgula:");
      if (!channels) return;
      const ids = [...new Set(channels.split(",").map(v => v.trim()).filter(Boolean))];
      if (!ids.length) return;
      await set("config", { token: token.trim(), channels: ids });
      void run(true);
    }
    function relay(config, items) {
      return new Promise((resolve, reject) => {
        const request = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : globalThis.GM?.xmlHttpRequest;
        if (!request) return reject(Error("GM_xmlhttpRequest indisponível"));
        const handle = request({
          method: "POST", url: RELAY, anonymous: true, timeout: 90000,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
          data: JSON.stringify({ items, channels: config.channels, concurrency: 1, force: false }),
          onload(response) {
            abort.removeEventListener("abort", cancel);
            try {
              const data = JSON.parse(response.responseText);
              if (Array.isArray(data.results)) return resolve(data);
              const error = Error(`Relay HTTP ${response.status}`);
              error.status = response.status;
              error.retryAfter = response.responseHeaders?.match(/^retry-after:\s*(.+)$/im)?.[1]?.trim();
              reject(error);
            } catch (error) { reject(error); }
          },
          onerror: () => { abort.removeEventListener("abort", cancel); reject(Error("Falha de rede Relay")); },
          ontimeout: () => { abort.removeEventListener("abort", cancel); reject(Error("Timeout Relay; entrega incerta")); },
          onabort: () => reject(Error("Envio interrompido")),
        });
        function cancel() { handle?.abort(); }
        abort.addEventListener("abort", cancel, { once: true });
      });
    }
    async function retry(operation, size) {
      for (let attempt = 0; ; attempt++) {
        abort.throwIfAborted();
        try { return await operation(); }
        catch (error) {
          if (attempt >= 3 || !(error.status === 429 || error.status >= 500)) throw error;
          await pause(retryDelay(attempt, size, error.retryAfter));
        }
      }
    }
    async function run(manual = false) {
      if (running || (!manual && (document.hidden || Date.now() - lastRun < 300000))) return;
      const config = await get("config", null);
      const account = document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1];
      if (!config?.token || !account) return;
      running = true;
      lastRun = Date.now();
      try {
        if (!navigator.locks) throw Error("Web Locks indisponível; sincronização desativada para evitar concorrência");
        await navigator.locks.request(`instagram-saved:${account}`, { ifAvailable: true }, async lock => {
          if (!lock) return;
          abort.throwIfAborted();
          const stateKey = `delivered:${account}:${[...config.channels].sort().join(",")}`;
          const count = await syncSaved({
            channels: config.channels, signal: abort, pause,
            load: () => get(stateKey, {}), save: done => set(stateKey, done),
            sendBatch: items => retry(() => relay(config, items), items.length),
            fetchPage: cursor => retry(async () => {
              if (document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1] !== account) throw Error("Conta alterada");
              const url = new URL(SAVED_PATH, location.origin);
              url.searchParams.set("count", "50");
              if (cursor) url.searchParams.set("max_id", cursor);
              const response = await fetch(url, { credentials: "same-origin", signal: abort,
                headers: { "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest",
                  "X-CSRFToken": decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1] || "") } });
              if (!response.ok) {
                const error = Error(`Instagram HTTP ${response.status}`);
                error.status = response.status;
                error.retryAfter = response.headers.get("retry-after");
                throw error;
              }
              return response.json();
            }, 50),
          });
          await set("lastError", null);
          if (count > 0) toast(`${count} mídias enviadas`);
        });
      } catch (error) {
        if (!abort.aborted) await set("lastError", { message: error.message, at: Date.now() });
      } finally { running = false; }
    }
    const menus = [];
    if (typeof GM_registerMenuCommand === "function") {
      menus.push(GM_registerMenuCommand("Instagram salvos · Configurar Relay", configure));
      menus.push(GM_registerMenuCommand("Instagram salvos · Sincronizar agora", () => void run(true)));
      menus.push(GM_registerMenuCommand("Instagram salvos · Diagnóstico", async () => {
        const error = await get("lastError", null);
        alert(error ? `${error.message}\n${new Date(error.at).toLocaleString()}` : "Nenhum erro registrado");
      }));
    }
    const timer = setInterval(() => void run(), 60000);
    ctx.listen(document, "visibilitychange", () => void run());
    ctx.onDispose(() => {
      clearInterval(timer);
      if (typeof GM_unregisterMenuCommand === "function") menus.forEach(id => GM_unregisterMenuCommand(id));
    });
    void run();
  },
};
