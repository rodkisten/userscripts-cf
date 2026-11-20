// ==UserScript==
// @name         Instagram salvos → XTelegram
// @namespace    https://rod.migos.club/userscripts-cf
// @version      1.0.0
// @description  Reels salvos via fetch; lotes, captions, dedupe e toast único.
// @match        https://www.instagram.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      xtelegram-cf.migos.club
// ==/UserScript==

(() => {
"use strict";
const css = ".instagram-saved-toast {\n  position: fixed;\n  z-index: 2147483647;\n  bottom: calc(24px + env(safe-area-inset-bottom));\n  left: 50%;\n  transform: translateX(-50%);\n  max-width: 85vw;\n  padding: 12px 18px;\n  border-radius: 24px;\n  background: #202124;\n  color: white;\n  font: 14px system-ui, sans-serif;\n  pointer-events: none;\n}\n";
const SAVED_PATH = "/api/v1/feed/saved/posts/";

function reelPayload(raw) {
  const m = raw.media || raw;
  if (m.product_type !== "clips" || !m.code) return null;
  const variants = (m.video_versions || []).filter(v => /^https:\/\//.test(v.url || ""))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  if (!variants.length) return null;
  const sourceUrl = `https://www.instagram.com/reel/${m.code}/`;
  return {
    provider: "instagram", mediaId: m.code, sourceUrl, pageUrl: sourceUrl,
    mediaUrl: variants[0].url, mediaType: "video", force: false,
    caption: [m.caption?.text, m.user?.username && `@${m.user.username}`, sourceUrl].filter(Boolean).join("\n\n"),
    mediaVariants: variants.map(v => ({ mediaUrl: v.url, width: v.width, height: v.height })),
    metadata: { instagramId: String(m.pk || m.id || ""), username: m.user?.username,
      originalCaption: m.caption?.text || "", width: variants[0].width, height: variants[0].height },
  };
}

function classify(result, channels) {
  const c = result?.channels;
  const inserted = new Set(c?.inserted || []);
  const covered = new Set([...inserted, ...(c?.covered || []),
    ...(c?.notSent || []).filter(v => v.reason === "already_sent").map(v => v.channelId)]);
  return { complete: channels.every(c => covered.has(c)), inserted: inserted.size > 0 };
}

function retryDelay(attempt, count, retryAfter, random = Math.random) {
  const seconds = Number(retryAfter);
  const date = Date.parse(retryAfter);
  const server = retryAfter && Number.isFinite(seconds) ? seconds * 1000
    : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
  return Math.max(server, Math.min(60000, (900 + count * 120) * 2 ** attempt) + random() * 400);
}

async function syncSaved({ fetchPage, sendBatch, load, save, channels, pause, signal }) {
  const done = await load();
  const seen = new Set();
  let cursor = "", count = 0, pages = 0;
  const cursors = new Set();
  do {
    signal?.throwIfAborted();
    const page = await fetchPage(cursor);
    if (!Array.isArray(page.items) || page.status === "fail") throw Error("Resposta de salvos inválida");
    const items = page.items.map(reelPayload).filter(Boolean).filter(item => {
      if (seen.has(item.mediaId)) return false;
      seen.add(item.mediaId);
      return !done[item.mediaId];
    });
    for (let offset = 0; offset < items.length; offset += 5) {
      const batch = items.slice(offset, offset + 5);
      let pending = batch;
      for (let attempt = 0; pending.length && attempt < 4; attempt++) {
        signal?.throwIfAborted();
        const response = await sendBatch(pending);
        if (!Array.isArray(response.results)) throw Error("Relay sem confirmação por item");
        const retry = [];
        for (let i = 0; i < pending.length; i++) {
          const result = response.results.find(r => r.index === i);
          const status = classify(result, channels);
          if (status.complete) {
            done[pending[i].mediaId] = Date.now();
            if (status.inserted) count++;
            await save(done);
          } else if (result && (result.status === 429 || result.status >= 500)) retry.push(pending[i]);
          else throw Error("Entrega não confirmada; sincronização interrompida");
        }
        pending = retry;
        if (pending.length) await pause(retryDelay(attempt, pending.length));
      }
      if (pending.length) throw Error("Limite de tentativas do Relay");
      await pause(retryDelay(0, batch.length));
    }
    pages++;
    const next = page.next_max_id;
    if (!page.more_available) break;
    if (!next || cursors.has(next)) throw Error("Cursor de salvos repetido ou ausente");
    cursors.add(next);
    cursor = next;
    await pause(Math.min(8000, 1000 + pages * 100));
  } while (true);
  return count;
}

const RELAY = "https://xtelegram-cf.migos.club/batch";

const module = {
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

const controller = new AbortController();
const cleanups = [];
module.init({
  signal: controller.signal,
  storage: {
    async get(key, fallback) {
      const name = "instagram-saved:" + key;
      return typeof GM_getValue === "function" ? await GM_getValue(name, fallback) : await GM.getValue(name, fallback);
    },
    async set(key, value) {
      const name = "instagram-saved:" + key;
      return typeof GM_setValue === "function" ? await GM_setValue(name, value) : await GM.setValue(name, value);
    },
  },
  style(text) {
    const style = document.createElement("style");
    style.textContent = text;
    document.documentElement.append(style);
    cleanups.push(() => style.remove());
  },
  listen(target, event, callback) { target.addEventListener(event, callback, { signal: controller.signal }); },
  onDispose(callback) { cleanups.push(callback); },
});
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  controller.abort();
  cleanups.forEach(callback => callback());
}, { once: true });

})();
