import { PREFIX } from "../config/search.js";
import { Studio } from "../core/studio.js";
import { SearchHistory } from "../search/history.js";
import { state } from "../state/deck.js";
import { normalizeVisual } from "../state/visual.js";
import { gmAvailable, recoveryWrite, storage } from "../storage/gm.js";
import { normalizedPreset, normalizedSearch } from "../storage/normalize.js";
import { Relay } from "../telegram/relay.js";
import { Seen } from "../tweets/seen.js";
import { repaint } from "../ui/dock.js";
import { showRodxToast } from "../ui/toast.js";

export let CloudSync;

export function initializeDeckCloudSync() {
  CloudSync = (() => {
    const STORAGE_KEY = PREFIX + "personal-cloud-v1";
    const API = "https://xtelegram-cf.migos.club/rodx/v1";
    let configPromise = null;
    let revision = new Map();
    let timers = new Map();
    let running = new Map();
    const config = () => {
      if (!configPromise)
        configPromise = gmAvailable ? storage.get(STORAGE_KEY).catch(() => null) : Promise.resolve(null);
      return configPromise;
    };
    async function request(method, path, body) {
      const cfg = await config();
      if (!cfg?.token) return null;
      const gm =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
            ? GM.xmlHttpRequest.bind(GM)
            : null;
      if (!gm) throw new Error("GM_xmlhttpRequest indisponível para sincronização");
      return new Promise((resolve, reject) => {
        gm({
          method,
          url: API + path,
          headers: {
            Authorization: "Bearer " + cfg.token,
            "Content-Type": "application/json",
          },
          data: body == null ? undefined : JSON.stringify(body),
          timeout: 20000,
          onload: (response) => {
            let data;
            try {
              data = JSON.parse(response.responseText || "{}");
            } catch (_) {
              return reject(new Error("Resposta não JSON do relay"));
            }
            if (response.status >= 200 && response.status < 300) resolve(data);
            else {
              const error = new Error(data.error || `Relay HTTP ${response.status}`);
              error.status = response.status;
              error.remote = data;
              reject(error);
            }
          },
          onerror: () => reject(new Error("Sem conexão com o relay")),
          ontimeout: () => reject(new Error("Tempo limite de sincronização excedido")),
        });
      });
    }
    async function configure() {
      if (!gmAvailable) {
        showRodxToast("Ative o GM Storage para usar a nuvem", "error");
        return;
      }
      const cfg = await config();
      const token = prompt("Chave pessoal RodX (rodx_…); deixe vazio para desativar", cfg?.token || "");
      if (token == null) return;
      if (token.trim() && !/^rodx_[A-Za-z0-9_-]{30,}$/.test(token.trim())) {
        showRodxToast("A chave pessoal deve começar com rodx_", "error");
        return;
      }
      const old = configPromise;
      configPromise = Promise.resolve(
        token.trim()
          ? {
              token: token.trim(),
            }
          : null,
      );
      try {
        if (token.trim()) await request("GET", "/me");
        await storage.set(
          STORAGE_KEY,
          token.trim()
            ? {
                token: token.trim(),
              }
            : null,
        );
        revision.clear();
        showRodxToast(token.trim() ? "Nuvem pessoal conectada" : "Nuvem desativada");
        if (token.trim() && state.account) void onAccountLoaded(state.account, state.accountGeneration);
      } catch (error) {
        configPromise = old;
        showRodxToast(`Falha de autenticação: ${error.message}`, "error");
      }
    }
    function queueSnapshot(payload) {
      if (!payload?.account) return;
      const account = payload.account;
      clearTimeout(timers.get(account));
      timers.set(
        account,
        setTimeout(() => {
          timers.delete(account);
          void sendSnapshot(account, payload).catch((error) => {
            console.warn("[RodX cloud] Backup local preservado:", error);
            state.storageWarning = `Sincronização não concluída: ${error.message}. Dados locais preservados.`;
          });
        }, 1300),
      );
    }
    async function sendSnapshot(account, payload) {
      const cfg = await config();
      if (!cfg?.token) return;
      const prev = running.get(account) || Promise.resolve();
      const next = prev
        .catch(() => {})
        .then(async () => {
          if (!revision.has(account)) {
            // Never overwrite a remote snapshot before observing its revision.
            await onAccountLoaded(account, state.accountGeneration);
          }
          if (!revision.has(account)) return;
          try {
            const database = await Studio.services.lists?.exportDatabase();
            const result = await request("PUT", "/snapshot", {
              account,
              baseRevision: revision.get(account),
              data: { ...payload, studioDatabase: database, runtimePreferences: { ...Studio.config } },
            });
            revision.set(account, result.revision);
            const verified = await request("GET", `/snapshot?account=${encodeURIComponent(account)}`);
            if (
              database &&
              (!verified?.data?.studioDatabase ||
                verified.data.studioDatabase.members?.length !== database.members.length)
            )
              throw new Error("O relay não confirmou o banco completo. Cópia local preservada.");
          } catch (error) {
            if (error.status === 409) {
              // The remote copy changed. Keep both copies for manual reconciliation;
              // never blindly apply a stale full-snapshot overwrite.
              try {
                localStorage.setItem(
                  PREFIX + "cloud-conflict:" + account,
                  JSON.stringify({
                    local: payload,
                    remote: error.remote,
                    time: Date.now(),
                  }),
                );
              } catch (_) {}
              if (state.account === account)
                showRodxToast("Conflito na nuvem: cópia local preservada", "error");
            }
            throw error;
          }
        });
      running.set(account, next);
      try {
        await next;
      } finally {
        if (running.get(account) === next) running.delete(account);
      }
    }
    async function reconcileHistory(account) {
      if (!SearchHistory?.importRemote) return;
      let offset = 0;
      for (let i = 0; i < 1000; i++) {
        const remote = await request(
          "GET",
          `/history?account=${encodeURIComponent(account)}&limit=500&offset=${offset}`,
        );
        if (!remote) return;
        await SearchHistory.importRemote(account, remote.entries || []);
        if (!remote.hasMore) break;
        offset = remote.nextOffset;
      }
      // Upload current local history after remote merge. Batched, idempotent.
      offset = 0;
      for (let i = 0; i < 1000; i++) {
        const local = await SearchHistory.exportPage(account, offset, 100);
        if (!local.rows.length) break;
        await request("POST", "/history", {
          account,
          entries: local.rows,
        });
        offset += local.rows.length;
        if (!local.more) break;
      }
    }
    async function reconcileSeen(account) {
      let offset = 0;
      for (let i = 0; i < 100; i++) {
        const result = await request(
          "GET",
          `/seen?account=${encodeURIComponent(account)}&limit=1000&offset=${offset}`,
        );
        const entries = result?.entries || [];
        if (state.account !== account) return;
        for (const row of entries) if (!state.seen.has(row.id)) state.seen.set(row.id, row.at);
        if (entries.length < 1000) break;
        offset += entries.length;
      }
      Seen.flushSoon();
      const local = [...state.seen.entries()];
      for (let i = 0; i < local.length; i += 100) {
        await request("POST", "/seen", {
          account,
          entries: local.slice(i, i + 100).map(([id, at]) => ({
            id,
            at,
          })),
        });
      }
    }
    async function onAccountLoaded(account, generation) {
      if (!account || !(await config())?.token) return;
      try {
        const remote = await request("GET", `/snapshot?account=${encodeURIComponent(account)}`);
        if (!remote || state.account !== account || state.accountGeneration !== generation) return;
        revision.set(account, remote.revision);
        const local = await storage.get(PREFIX + account).catch(() => null);
        if (remote.data) {
          const remoteTime = Date.parse(remote.data.updatedAt || "") || 0;
          const localTime = Date.parse(local?.updatedAt || "") || 0;
          if (remoteTime > localTime) {
            if (local && localTime && JSON.stringify(local) !== JSON.stringify(remote.data)) {
              try {
                localStorage.setItem(PREFIX + "cloud-before-import:" + account, JSON.stringify(local));
              } catch (_) {
                /* Recoverable through GM Storage if space is full. */
              }
            }
            // Only accepted after the account/generation checks above.
            state.searches = (remote.data.searches || []).map(normalizedSearch).filter(Boolean);
            state.presets = (remote.data.presets || []).map(normalizedPreset).filter(Boolean);
            state.visual = normalizeVisual(remote.data.visual);
            if (remote.data.studioDatabase)
              await Studio.services.lists?.importDatabase(remote.data.studioDatabase);
            if (remote.data.runtimePreferences) Studio.configure(remote.data.runtimePreferences);
            state.selectionList = (remote.data.selectionList || []).slice(0, 150);
            if (remote.data.relayPreferences)
              await Relay.applyPreferences(account, remote.data.relayPreferences);
            await storage.set(PREFIX + account, remote.data);
            recoveryWrite(PREFIX + account, remote.data);
            repaint();
          } else if (local && localTime > remoteTime) queueSnapshot(local);
        } else if (local?.searches && !running.has(account)) queueSnapshot(local);
        // History and seen are independent from the snapshot and never truncated.
        void reconcileHistory(account).catch((err) => console.warn("[RodX cloud history]", err));
        void reconcileSeen(account).catch((err) => console.warn("[RodX cloud seen]", err));
      } catch (error) {
        console.warn("[RodX cloud] Sem conexão; usando dados locais:", error);
        if (state.account === account) state.storageWarning = `Nuvem indisponível: ${error.message}`;
      }
    }
    function recordHistory(account, entry) {
      void request("POST", "/history", {
        account,
        entries: [entry],
      }).catch(() => {});
    }
    function markSeen(account, id, at) {
      void request("POST", "/seen", {
        account,
        entries: [
          {
            id,
            at,
          },
        ],
      }).catch(() => {});
    }
    return Object.freeze({
      configure,
      queueSnapshot,
      onAccountLoaded,
      recordHistory,
      markSeen,
    });
  })();
}
