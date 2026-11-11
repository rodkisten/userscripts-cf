import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-telegram-relay-1.css?inline";
import inlineCSS2 from "../../../styles/inline/userscripts-rodx-studio-telegram-relay-2.css?inline";
import inlineCSS3 from "../../../styles/inline/userscripts-rodx-studio-telegram-relay-3.css?inline";
import inlineCSS4 from "../../../styles/inline/userscripts-rodx-studio-telegram-relay-4.css?inline";
import inlineCSS5 from "../../../styles/inline/userscripts-rodx-studio-telegram-relay-5.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-telegram-relay-1.css?inline";
import { PREFIX } from "../config/search.js";
import { identityLabel } from "../identity/account.js";
import { ImmersiveDownload } from "../media/download.js";
import { html } from "../shared/text.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/account.js";
import { gmAvailable, storage } from "../storage/gm.js";
import { XRepost } from "../tweets/publisher.js";
import { openPanel } from "../ui/preferences.js";
import { renderRoot } from "../ui/search-workbench.js";

export let Relay;

export function initializeDeckRelay() {
  Relay = (() => {
    const KEY = PREFIX + "telegram:";
    const DEFAULT_URL = "https://xtelegram-cf.migos.club";
    const STATUS_TTL = 60_000;
    const MAX_CHECK = 60;
    const TWITTER_STATUS = /^\/(?:i\/web\/status\/|[^/]+\/status\/)(\d{8,25})(?:\/|$)/;
    const ICON =
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/>' +
      '<path d="M22 2 11 13"/></svg>';
    const DEFAULTS = Object.freeze({
      enabled: true,
      url: DEFAULT_URL,
      token: "",
      channels: "",
      autoCheck: true,
      labelSent: true,
    });
    let settings = {
      ...DEFAULTS,
    };
    let identity = "";
    let epoch = 0;
    let lastScan = 0;
    let checkTimer = null;
    let checking = false;
    let checkQueue = new Map();
    let status = new Map();
    let checkSerial = 0;
    let latestCheck = new Map();
    let cards = new Map();
    const videoOverlays = new Map();
    let inFlight = new Map();
    let clicking = new Set();
    let confirmState = null;
    let toastTimer = null;
    let observer = null;
    let styleAdded = false;
    let viewerButton = null;
    let viewerCard = null;
    let viewerKey = "";
    function channels() {
      return [
        ...new Set(
          String(settings.channels || "")
            .split(/[\n,;]+/)
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ];
    }
    function validUrl(value) {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("O endereço do relay precisa ser HTTPS e não pode conter credenciais.");
      }
      if (!url.hostname || url.search || url.hash) {
        throw new Error("Informe apenas a URL HTTPS base do relay.");
      }
      const base = url.pathname.replace(/\/(?:send|media\/check|resolve-and-send|health)\/?$/i, "");
      return `${url.origin}${base.replace(/\/+$/, "")}`;
    }
    function endpoint(path) {
      return `${validUrl(settings.url)}${path}`;
    }
    function settingsHTML() {
      const clean = (v) => html(String(v ?? ""));
      const isOn = settings.enabled;
      return `<div class="stack" id="rodx-relay-settings">
        ${!gmAvailable ? '<div class="banner">Sem GM Storage, as configurações personalizadas não podem ser persistidas com segurança. Os padrões incorporados ao script continuam disponíveis.</div>' : ""}
        <div class="banner" style="${cssDeclarations(inlineCSS1)}">✈ <b>${isOn ? "Botão Telegram ativado" : "Botão Telegram desativado"}</b>
          · Destino padrão ${clean(settings.channels || DEFAULTS.channels)}.
          <details style="${cssDeclarations(inlineCSS2)}"><summary style="${cssDeclarations(inlineCSS3)}">Sobre segurança e confirmação</summary>
            O Worker/D1 confirma os envios; o script nunca marca um post como enviado
            só por ter sido clicado. O token não entra nos backups das buscas.
          </details></div>
        <label class="tog"><input type="checkbox" data-relay="enabled"
          ${isOn ? "checked" : ""}> Mostrar botão Telegram automaticamente nos posts do X</label>
        <div class="field"><label>URL base do seu Worker Relay</label>
          <input class="ctrl" data-relay="url" inputmode="url" autocomplete="off"
            value="${clean(settings.url)}" placeholder="${DEFAULT_URL}"></div>
        <div class="field"><label>Bearer token</label>
          <input class="ctrl" type="password" data-relay="token" autocomplete="off"
            placeholder="${settings.token ? "Token ativo (••••" + clean(settings.token.slice(-4)) + ") · substitua se necessário" : "Cole o RELAY_TOKEN"}">
          <span class="hint-small">${settings.token ? "✓ Token já configurado; não precisa digitar novamente." : "Nenhum token configurado."}</span>
          <label class="tog"><input type="checkbox" data-relay="clearToken"> Apagar token salvo</label></div>
        <div class="field"><label>Canais e tópicos (separados por vírgula ou linha)</label>
          <textarea class="ctrl" data-relay="channels" rows="3"
            placeholder="-1003991698263:65">${clean(settings.channels)}</textarea>
          <p class="muted">Use identificadores de destino aceitos pelo seu relay,
            inclusive <code>chat_id:thread_id</code>. Configure pelo menos um para conferir
            exatamente em quais tópicos um post já foi enviado.</p></div>
        <label class="tog"><input type="checkbox" data-relay="autoCheck"
          ${settings.autoCheck ? "checked" : ""}> Consultar /media/check automaticamente ao rolar</label>
        <label class="tog"><input type="checkbox" data-relay="labelSent"
          ${settings.labelSent ? "checked" : ""}> Exibir texto ✓ Enviado no botão</label>
        <div class="row">
          <button class="btn" data-act="relay-refresh">↻ Rever status dos posts visíveis</button>
        </div>
        <details class="section" style="${cssDeclarations(inlineCSS4)}">
          <summary>ℹ Como funciona e segurança</summary>
          <div class="section-body">
            <p class="muted">Em buscas, hashtags, Home, bookmarks e perfis, o botão Telegram
              aparece nas ações de cada post. Fotos, vídeos e carrosséis passam por
              <code>/resolve-and-send</code>; o status é conferido em lotes no D1.
              Reenvios forçados exigem confirmação.</p>
            <p class="muted">O token fica em GM Storage sem criptografia adicional.
              Não compartilhe o userscript com credenciais e proteja seu dispositivo.
              Se alterar <code>@connect</code>, recarregue a página.</p>
          </div>
        </details>
        <small class="muted">Conta ativa: ${html(identityLabel())}</small>
      </div>`;
    }
    function getForm() {
      const root = state.rootShadow;
      const field = (name) => root?.querySelector(CSS_SELECTORS.relayFieldByName(name));
      return {
        enabled: Boolean(field("enabled")?.checked),
        url: String(field("url")?.value || ""),
        channels: String(field("channels")?.value || ""),
        autoCheck: Boolean(field("autoCheck")?.checked),
        labelSent: Boolean(field("labelSent")?.checked),
        token: String(field("token")?.value || ""),
        clearToken: Boolean(field("clearToken")?.checked),
      };
    }
    async function save() {
      if (!gmAvailable)
        throw new Error("Sem GM Storage: por segurança, não salvo credenciais no localStorage do X.");
      if (!identity) throw new Error("Identifique primeiro sua conta do X.");
      const form = getForm();
      const normalized = {
        enabled: form.enabled,
        url: validUrl(form.url),
        token: form.clearToken ? "" : form.token.trim() || settings.token,
        channels: [
          ...new Set(
            form.channels
              .split(/[\n,;]+/)
              .map((part) => part.trim())
              .filter(Boolean),
          ),
        ].join(", "),
        autoCheck: form.autoCheck,
        labelSent: form.labelSent,
      };
      if (normalized.enabled && !normalized.token) throw new Error("Informe o Bearer token.");
      if (normalized.enabled && !normalized.channels) {
        throw new Error("Informe pelo menos um canal ou tópico para a confirmação D1.");
      }
      await storage.set(KEY + identity, normalized);
      settings = normalized;
      invalidate(true);
      state.message = "Telegram Relay configurado para esta conta.";
      void saveState().catch((error) =>
        console.warn("[RodX cloud] Configuração preservada localmente:", error),
      );
      renderRoot();
      scan(true);
    }
    function invalidate(removeButtons = false) {
      epoch++;
      status.clear();
      latestCheck.clear();
      clicking.clear();
      inFlight.clear();
      checkQueue.clear();
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = null;
      if (removeButtons) {
        viewerButton?.remove();
        viewerButton = null;
        viewerCard = null;
        viewerKey = "";
        for (const card of cards.values()) card.button?.remove();
        cards.clear();
      }
      lastScan = 0;
      confirmState = null;
      removeConfirm();
    }
    async function switchAccount(account) {
      const newId = String(account || "");
      if (identity === newId) return;
      identity = newId;
      void XRepost.switchAccount(newId);
      settings = {
        ...DEFAULTS,
      };
      invalidate(true);
      const currentEpoch = epoch;
      if (!newId || !gmAvailable) return;
      try {
        const loaded = await storage.get(KEY + newId);
        if (currentEpoch !== epoch || identity !== newId) return;
        if (loaded && typeof loaded === "object") {
          // Legacy 2.2 could store an unfinished disabled relay with no token/destination.
          // Treat this state as never configured, without overriding an intentional off.
          const neverConfigured = !String(loaded.token || "").trim() || !String(loaded.channels || "").trim();
          settings = {
            ...DEFAULTS,
            enabled: neverConfigured ? true : loaded.enabled !== false,
            url: validUrl(loaded.url || DEFAULT_URL),
            token: String(loaded.token || "").trim() || DEFAULTS.token,
            channels: String(loaded.channels || "").trim() || DEFAULTS.channels,
            autoCheck: loaded.autoCheck !== false,
            labelSent: loaded.labelSent !== false,
          };
        } else {
          // New X account: activate immediately; persist account-scoped defaults in GM.
          await storage.set(KEY + newId, {
            ...settings,
          });
          if (currentEpoch !== epoch || identity !== newId) return;
        }
        if (state.open && state.view === "relay") renderRoot();
        scan(true);
      } catch (err) {
        console.warn("[RodX Relay] Falha ao ler configuração:", err.message);
      }
    }
    function exportPreferences() {
      const { enabled, url, channels, autoCheck, labelSent } = settings;
      // NEVER sync Telegram bearer tokens or media credentials.
      return {
        enabled,
        url,
        channels,
        autoCheck,
        labelSent,
      };
    }
    async function applyPreferences(account, preferences) {
      if (!preferences || !gmAvailable || !account || typeof preferences !== "object") return;
      const original = (await storage.get(KEY + account)) || {
        ...DEFAULTS,
      };
      const updated = {
        ...original,
        enabled: preferences.enabled !== false,
        url: validUrl(preferences.url || original.url || DEFAULT_URL),
        channels: String(preferences.channels || original.channels || DEFAULTS.channels).slice(0, 1000),
        autoCheck: preferences.autoCheck !== false,
        labelSent: preferences.labelSent !== false,
      };
      await storage.set(KEY + account, updated);
      if (identity === account) {
        settings = updated;
        invalidate(true);
      }
    }
    function transport({ path, method = "POST", payload = null, timeout = 45_000 }) {
      if (!settings.token) return Promise.reject(new Error("Token não configurado."));
      const request =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
            ? GM.xmlHttpRequest.bind(GM)
            : null;
      if (!request) {
        return Promise.reject(
          new Error("Seu gerenciador não oferece GM_xmlhttpRequest. Verifique as permissões do script."),
        );
      }
      return new Promise((resolve, reject) => {
        let settled = false;
        const args = {
          method,
          url: endpoint(path),
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${settings.token}`,
            ...(payload
              ? {
                  "Content-Type": "application/json",
                }
              : {}),
          },
          timeout,
          ...(payload
            ? {
                data: JSON.stringify(payload),
              }
            : {}),
          onload(response) {
            if (settled) return;
            settled = true;
            let data = {};
            try {
              data = JSON.parse(String(response.responseText || "{}"));
            } catch {
              reject(new Error(`Relay retornou JSON inválido (HTTP ${response.status}).`));
              return;
            }
            resolve({
              status: Number(response.status || 0),
              headers: String(response.responseHeaders || ""),
              data,
            });
          },
          onerror() {
            if (!settled) {
              settled = true;
              reject(new Error("Falha de rede ou bloqueio CORS/GM do relay."));
            }
          },
          ontimeout() {
            if (!settled) {
              settled = true;
              reject(new Error("Timeout de comunicação com o relay."));
            }
          },
          onabort() {
            if (!settled) {
              settled = true;
              reject(new Error("Requisição ao relay cancelada."));
            }
          },
        };
        try {
          request(args);
        } catch (err) {
          if (!settled) {
            settled = true;
            reject(err);
          }
        }
      });
    }
    function containsVideo(article) {
      // Keep images, GIF previews represented only as images, and link cards
      // free of the Telegram button. Retest as lazy-loaded video mounts.
      return Boolean(article.querySelector(CSS_SELECTORS.videoAndPlayerContainers()));
    }
    function parsePost(article) {
      if (!(article instanceof Element)) return null;
      const timeLink = article.querySelector(CSS_SELECTORS.timestamps)?.closest(CSS_SELECTORS.statusLinks);
      const links = [timeLink, ...article.querySelectorAll(CSS_SELECTORS.statusLinks)].filter(Boolean);
      for (const a of links) {
        try {
          const parsed = new URL(a.href, location.origin);
          const match = parsed.pathname.match(TWITTER_STATUS);
          if (!match) continue;
          const id = match[1];
          const owner = parsed.pathname.match(/^\/([^/]+)\/status\//)?.[1] || "";
          const text = article.querySelector(CSS_SELECTORS.nativeTweetText)?.innerText || "";
          return {
            id,
            key: `twitter:${id}`,
            url: `https://x.com/${owner && owner !== "i" ? owner : "i/web"}/status/${id}`,
            author: owner && owner !== "i" ? `@${owner}` : "",
            text: String(text).slice(0, 1800),
            isVideo: containsVideo(article),
          };
        } catch {
          /* next status link */
        }
      }
      return null;
    }
    function formatCaption(post) {
      const esc = (str) =>
        String(str || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const label = post.author || "X / Twitter";
      const link = `<a href="${esc(post.url)}">Abrir no X</a>`;
      // Telegram media captions: 1024 visible chars including label and link.
      const allowance = Math.max(0, 1024 - [...label].length - 15);
      const words = [...post.text.replace(/\s+/g, " ").trim()];
      const body = words.length > allowance ? words.slice(0, allowance - 1).join("") + "…" : words.join("");
      return `<b>${esc(label)}</b>${body ? `\n\n${esc(body)}` : ""}\n\n${link}`;
    }
    function currentStatus(post) {
      const existing = status.get(post.key);
      return existing && existing.signature === channels().join("|") ? existing : null;
    }
    function confirmedChannels(post) {
      const entry = currentStatus(post);
      return entry?.known === true ? entry.sent : [];
    }
    function paint(card) {
      const button = card.button;
      if (!button?.isConnected) return;
      const entry = currentStatus(card.post);
      const destinations = channels();
      const sent = confirmedChannels(card.post);
      const delivering = inFlight.has(card.post.key);
      const sending = delivering || clicking.has(card.post.key);
      const allSent =
        entry?.known === true && destinations.length && destinations.every((ch) => sent.includes(ch));
      const partial = entry?.known === true && sent.length > 0 && !allSent;
      const checkingNow = entry?.checking === true;
      button.dataset.relayState = sending
        ? "sending"
        : allSent
          ? "sent"
          : partial
            ? "partial"
            : checkingNow
              ? "checking"
              : entry?.error
                ? "error"
                : "ready";
      button.disabled = sending;
      const label = sending
        ? delivering
          ? "Enviando"
          : "Conferindo"
        : allSent
          ? "Enviado"
          : partial
            ? `${sent.length}/${destinations.length} enviados`
            : checkingNow
              ? "Conferindo"
              : "Telegram";
      // Icon-only on both timeline posts and immersive players.
      button.innerHTML = ICON;
      button.setAttribute("aria-label", `${label} no Telegram`);
      button.title = allSent
        ? "Enviado aos tópicos configurados. Toque para reenviar."
        : partial
          ? "Envio parcial. Toque para enviar apenas aos destinos pendentes."
          : entry?.error || "Enviar post e mídias ao Telegram Relay";
    }
    function queue(post, force = false) {
      if (!settings.enabled || (!settings.autoCheck && !force) || !channels().length) return;
      const entry = currentStatus(post);
      if (!force && entry && (entry.checking || Date.now() - entry.at < STATUS_TTL)) return;
      checkQueue.set(post.key, post);
      status.set(post.key, {
        signature: channels().join("|"),
        checking: true,
        at: 0,
        known: false,
        sent: [],
      });
      paintAll(post.key);
      if (!checkTimer) checkTimer = setTimeout(runQueuedChecks, 230);
    }
    function paintAll(key) {
      const card = cards.get(key);
      if (card) paint(card);
      if (viewerCard?.post.key === key) paint(viewerCard);
      const overlay = videoOverlays.get(key);
      if (overlay) paint(overlay);
    }
    async function checkNow(posts) {
      if (!settings.enabled || !settings.token || !channels().length) return;
      const myEpoch = epoch;
      const requestChannels = channels();
      const entries = [...new Map(posts.map((p) => [p.key, p])).values()];
      for (let offset = 0; offset < entries.length; offset += MAX_CHECK) {
        const slice = entries.slice(offset, offset + MAX_CHECK);
        const stamps = new Map(
          slice.map((post) => {
            const seq = ++checkSerial;
            latestCheck.set(post.key, seq);
            return [post.key, seq];
          }),
        );
        const request = {
          items: slice.map((p) => ({
            provider: "twitter",
            mediaId: p.id,
          })),
          channels: requestChannels,
        };
        try {
          const response = await transport({
            path: "/media/check",
            payload: request,
          });
          if (epoch !== myEpoch) return;
          if (response.status < 200 || response.status >= 300 || response.data?.ok === false) {
            throw new Error(String(response.data?.error || `HTTP ${response.status}`));
          }
          const list = Array.isArray(response.data?.results)
            ? response.data.results
            : Array.isArray(response.data?.items)
              ? response.data.items
              : [];
          for (const [i, post] of slice.entries()) {
            if (latestCheck.get(post.key) !== stamps.get(post.key)) continue;
            const item =
              list.find(
                (record) =>
                  String(record?.provider || "twitter").toLowerCase() === "twitter" &&
                  String(record?.mediaId || "") === post.id &&
                  (record?.index == null || Number(record.index) === i),
              ) || list[i];
            const matches =
              item &&
              (!item.mediaId || String(item.mediaId) === post.id) &&
              (!item.provider || String(item.provider).toLowerCase() === "twitter") &&
              (!item.mediaKey || item.mediaKey === post.key);
            if (!matches) {
              status.set(post.key, {
                signature: requestChannels.join("|"),
                known: false,
                sent: [],
                at: Date.now(),
                error: "Resposta do relay não corresponde ao post.",
              });
              paintAll(post.key);
              continue;
            }
            const sent = requestChannels.filter((ch) => {
              const requested = item.requestedChannels?.[ch];
              if (requested) return requested.sent === true;
              const found = Array.isArray(item.channels)
                ? item.channels.find((c) => String(c.channelId) === ch)
                : null;
              return Boolean(found && Number(found.sendCount || 0) > 0);
            });
            status.set(post.key, {
              signature: requestChannels.join("|"),
              known: true,
              sent,
              at: Date.now(),
              exists: item.exists === true,
            });
            paintAll(post.key);
          }
        } catch (error) {
          if (epoch !== myEpoch) return;
          for (const post of slice) {
            if (latestCheck.get(post.key) !== stamps.get(post.key)) continue;
            status.set(post.key, {
              signature: requestChannels.join("|"),
              known: false,
              sent: [],
              at: Date.now(),
              error: String(error.message || error),
            });
            paintAll(post.key);
          }
          throw error;
        }
      }
    }
    function runQueuedChecks() {
      checkTimer = null;
      void flushCheck();
    }
    async function flushCheck() {
      if (checking || !settings.enabled || !checkQueue.size) return;
      checking = true;
      try {
        while (checkQueue.size) {
          const batch = [...checkQueue.values()].slice(0, MAX_CHECK);
          batch.forEach((post) => checkQueue.delete(post.key));
          await checkNow(batch);
        }
      } catch (error) {
        console.warn("[RodX Relay] Verificação falhou:", error.message);
      } finally {
        checking = false;
        if (checkQueue.size && !checkTimer) checkTimer = setTimeout(runQueuedChecks, 400);
      }
    }
    function notice(message, kind = "info") {
      if (!state.rootShadow) return;
      let node = state.rootShadow.querySelector(CSS_SELECTORS.relayNotice);
      if (!node) {
        node = document.createElement("div");
        node.id = "rodx-relay-notice";
        node.setAttribute("role", "status");
        node.className = "relay-toast";
        state.rootShadow.append(node);
      }
      node.textContent = message;
      node.dataset.kind = kind;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => node.remove(), 4400);
    }
    function removeConfirm() {
      state.rootShadow?.querySelector(CSS_SELECTORS.relayConfirm)?.remove();
    }
    function showConfirm({ post, destinations, title, onAccept }) {
      removeConfirm();
      confirmState = {
        post,
        destinations,
        onAccept,
      };
      const wrapper = document.createElement("div");
      wrapper.id = "rodx-relay-confirm";
      wrapper.innerHTML = `<div class="relay-scrim" data-act="relay-cancel"></div>
        <section class="relay-dialog" role="alertdialog" aria-modal="true" aria-label="Reenvio Telegram">
          <strong>${html(title)}</strong>
          <p>${destinations.length} destino(s) já confirmado(s) pelo D1.<br>
            Reenviar <b>${html(post.url)}</b> apenas para esses destinos?</p>
          <p class="muted">${html(destinations.join(", "))}</p>
          <div class="row" style="${cssDeclarations(inlineCSS5)}">
            <button class="btn" data-act="relay-cancel">Cancelar</button>
            <button class="btn primary" data-act="relay-force">Reenviar</button>
          </div>
        </section>`;
      state.rootShadow?.append(wrapper);
      wrapper.querySelector(CSS_SELECTORS.relayForceAction)?.focus();
    }
    function handleConfirm(action) {
      const pending = confirmState;
      confirmState = null;
      removeConfirm();
      if (action === "relay-force" && pending) {
        void pending.onAccept().catch((error) => notice(error.message, "error"));
      }
    }
    async function sendRequest(post, destinations, force = false) {
      const payload = {
        provider: "twitter",
        mediaId: post.id,
        url: post.url,
        sourceUrl: post.url,
        pageUrl: post.url,
        channels: destinations,
        caption: formatCaption(post),
        parseMode: "HTML",
        ...(force
          ? {
              force: true,
            }
          : {}),
      };
      const response = await transport({
        path: "/resolve-and-send",
        payload,
        timeout: 120_000,
      });
      const data = response.data || {};
      if (
        response.status >= 500 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        throw new Error(String(data.error || data.message || `Relay HTTP ${response.status}`));
      }
      // 207 partial and 409 already_sent are authoritative outcomes to reconcile.
      if (![200, 201, 202, 207, 409].includes(response.status)) {
        throw new Error(String(data.error || data.message || `Relay HTTP ${response.status}`));
      }
      return {
        data,
        httpStatus: response.status,
      };
    }
    async function deliver(post, destinations, force = false) {
      if (inFlight.has(post.key)) return inFlight.get(post.key);
      const activeEpoch = epoch;
      const promise = (async () => {
        paintAll(post.key);
        let result;
        try {
          result = await sendRequest(post, destinations, force);
          if (activeEpoch !== epoch) return;
          const siblings = Array.isArray(result.data?.deliveries) ? result.data.deliveries : [];
          const failures = result.data?.channels?.notSent || [];
          const conflicted = failures
            .filter((c) => String(c.reason || "") === "already_sent")
            .map((c) => String(c.channelId || ""));
          const duplicate = result.httpStatus === 409 || conflicted.length > 0;
          // Refresh from D1 before applying any positive badge, including 200/207.
          status.delete(post.key);
          try {
            await checkNow([post]);
          } catch {
            /* do not mark sent without D1 confirmation */
          }
          if (activeEpoch !== epoch) return;
          const confirmed = confirmedChannels(post);
          const left = channels().filter((c) => !confirmed.includes(c));
          if (!left.length) notice("✓ Enviado e confirmado pelo relay.", "success");
          else if (confirmed.length)
            notice(`Envio parcial: ${confirmed.length}/${channels().length} destinos confirmados.`, "info");
          else if (duplicate || siblings.length)
            notice("Relay respondeu, mas a entrega ainda não foi confirmada no D1.");
          else notice("Envio solicitado. Confira o status no relay.");
          if (!force && confirmed.length && post.isVideo) {
            // The D1 delivery check above is authoritative. An accepted HTTP response is not.
            void XRepost.onTelegramConfirmed(post).catch((error) => {
              console.warn("[RodX repost] Não foi possível preparar a publicação:", error.message);
            });
          }
          if (!force && conflicted.length) {
            // Verify exact destinations once more before offering a force operation.
            const reallySent = conflicted.filter((ch) => confirmed.includes(ch));
            if (reallySent.length)
              showConfirm({
                post,
                destinations: reallySent,
                title: "Já enviado ao Telegram",
                onAccept: () => deliver(post, reallySent, true),
              });
          }
          return result;
        } catch (error) {
          // An ambiguous timeout/502 may happen AFTER Telegram accepted delivery.
          // Reconcile from D1 before reporting failure; never retry automatically.
          if (activeEpoch === epoch) {
            try {
              await checkNow([post]);
            } catch {
              /* preserve original error */
            }
            const count = confirmedChannels(post).length;
            if (count)
              notice(`Relay com erro; ${count}/${channels().length} destinos constam no D1.`, "error");
          }
          throw error;
        } finally {
          inFlight.delete(post.key);
          paintAll(post.key);
        }
      })();
      inFlight.set(post.key, promise);
      paintAll(post.key);
      return promise;
    }
    async function onPostClick(post) {
      if (clicking.has(post.key) || inFlight.has(post.key)) return;
      clicking.add(post.key);
      const initiatingEpoch = epoch;
      const initiatingAccount = identity;
      paintAll(post.key);
      try {
        if (!settings.enabled || !settings.token || !channels().length) {
          openPanel("relay");
          notice("Configure o relay antes de enviar.");
          return;
        }
        if (inFlight.has(post.key)) return;
        // Fresh channel-aware D1 check; never trust an old local positive badge.
        try {
          await checkNow([post]);
        } catch (error) {
          notice(`Não consegui conferir o histórico: ${error.message}`, "error");
          return;
        }
        if (initiatingEpoch !== epoch || initiatingAccount !== identity) return;
        const sent = confirmedChannels(post);
        const missing = channels().filter((ch) => !sent.includes(ch));
        if (!missing.length) {
          showConfirm({
            post,
            destinations: sent,
            title: "Este post já foi enviado",
            onAccept: () => deliver(post, sent, true),
          });
          return;
        }
        await deliver(post, missing, false);
      } finally {
        clicking.delete(post.key);
        paintAll(post.key);
      }
    }
    function ensureStyle() {
      if (styleAdded) return;
      const css = document.createElement("style");
      css.id = "rodx-relay-native-css";
      css.textContent = extractedCSS1;
      document.head.append(css);
      styleAdded = true;
    }
    function observe(card) {
      if (!settings.autoCheck) return;
      if (!("IntersectionObserver" in window)) {
        queue(card.post);
        return;
      }
      if (!observer)
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const id = entry.target.dataset.rodxRelayId;
              const found = id ? cards.get(`twitter:${id}`) : null;
              if (found && found.article === entry.target) queue(found.post);
            }
          },
          {
            rootMargin: "350px 0px 350px 0px",
            threshold: 0,
          },
        );
      try {
        observer.observe(card.article);
      } catch {
        queue(card.post);
      }
    }
    function addButton(article, post) {
      const key = post.key;
      const previous = cards.get(key);
      if (previous?.article === article && previous.button?.isConnected) {
        paint(previous);
        return;
      }
      if (previous) previous.button?.remove();
      const action =
        article.querySelector(CSS_SELECTORS.replyButton)?.closest(CSS_SELECTORS.actionGroups) ||
        article.querySelector(CSS_SELECTORS.actionGroups);
      const container = action || article;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rodx-tg-action";
      button.dataset.rodxRelayFor = post.id;
      button.setAttribute("aria-label", "Enviar vídeo ao Telegram");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void onPostClick(post).catch((error) => notice(error.message || "Falha no envio.", "error"));
      });
      container.append(button);
      article.dataset.rodxRelayId = post.id;
      const card = {
        article,
        post,
        button,
      };
      cards.set(key, card);
      paint(card);
      observe(card);
    }
    function addVideoOverlay(article, post) {
      const video = article.querySelector(CSS_SELECTORS.videos);
      if (!video) return;
      const wrapper = video.closest(CSS_SELECTORS.tweetVideoContainers) || video.parentElement;
      if (!wrapper) return;
      let card = videoOverlays.get(post.key);
      if (card && (card.wrapper !== wrapper || !card.button.isConnected)) {
        card.button.remove();
        videoOverlays.delete(post.key);
        card = null;
      }
      if (!card) {
        if (getComputedStyle(wrapper).position === "static") wrapper.style.position = "relative";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rodx-tg-action rodx-tg-video-overlay";
        button.setAttribute("data-rodx-player-control", "1");
        button.setAttribute("aria-label", "Enviar vídeo ao Telegram");
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const current = videoOverlays.get(post.key);
          if (!current || current.button !== button) return;
          void onPostClick(current.post).catch((error) =>
            notice(error.message || "Falha no envio.", "error"),
          );
        });
        wrapper.append(button);
        card = {
          button,
          post,
          wrapper,
        };
        videoOverlays.set(post.key, card);
      }
      card.post = post;
      paint(card);
    }
    function scan(force = false) {
      if (!settings.enabled || !identity || !document.body) {
        for (const card of cards.values()) card.button?.remove();
        cards.clear();
        for (const overlay of videoOverlays.values()) overlay.button.remove();
        videoOverlays.clear();
        return;
      }
      const now = Date.now();
      if (!force && now - lastScan < 450) return;
      lastScan = now;
      ensureStyle();
      const articles = document.querySelectorAll(CSS_SELECTORS.tweetArticleContainers);
      let count = 0;
      for (const article of articles) {
        if (count++ >= 220) break;
        const post = parsePost(article);
        if (!post?.isVideo) {
          const oldKey = article.dataset.rodxRelayId;
          const old = oldKey && cards.get(`twitter:${oldKey}`);
          if (old?.article === article) {
            old.button.remove();
            cards.delete(old.post.key);
          }
          delete article.dataset.rodxRelayId;
          continue;
        }
        addButton(article, post);
        addVideoOverlay(article, post);
      }
      for (const [key, overlay] of videoOverlays) {
        if (
          !overlay.button.isConnected ||
          !overlay.wrapper.isConnected ||
          overlay.wrapper.closest(CSS_SELECTORS.nativeTweets)?.dataset.rodxRelayId !== overlay.post.id
        ) {
          overlay.button.remove();
          videoOverlays.delete(key);
        }
      }
      for (const [key, card] of cards) {
        if (
          !card.article.isConnected ||
          !card.button.isConnected ||
          card.article.dataset.rodxRelayId !== card.post.id
        ) {
          observer?.unobserve(card.article);
          cards.delete(key);
        }
      }
      if (status.size > 2000) {
        const active = new Set(cards.keys());
        for (const key of status.keys()) {
          if (status.size <= 1100) break;
          if (!active.has(key)) {
            status.delete(key);
            latestCheck.delete(key);
          }
        }
      }
      if (cards.size > 400) {
        for (const [key, card] of cards) {
          if (!card.article.isConnected) cards.delete(key);
        }
      }
    }
    function scanImmersive(viewer) {
      if (!settings.enabled || !identity || !viewer?.id || !viewer.video?.isConnected) {
        viewerButton?.remove();
        viewerButton = null;
        viewerCard = null;
        viewerKey = "";
        return;
      }
      ensureStyle();
      const post = {
        id: viewer.id,
        key: `twitter:${viewer.id}`,
        url: viewer.url,
        author: viewer.url.match(/x\.com\/([^/]+)\/status/)?.[1] || "",
        text: viewer.layer.querySelector(CSS_SELECTORS.nativeTweetText)?.innerText?.slice(0, 1800) || "",
        isVideo: true,
      };
      if (
        viewerKey !== viewer.key ||
        !viewerButton?.isConnected ||
        viewerButton.parentElement !== viewer.layer
      ) {
        viewerButton?.remove();
        viewerButton = document.createElement("button");
        viewerButton.type = "button";
        viewerButton.className = "rodx-tg-action rodx-tg-immersive";
        viewerButton.dataset.rodxRelayFor = viewer.id;
        viewerButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          // Query current viewer, never send the previous video after navigation.
          const actual = ImmersiveDownload.current();
          if (!actual || actual.key !== viewerKey) return;
          void onPostClick(viewerCard.post).catch((error) =>
            notice(error.message || "Falha no envio.", "error"),
          );
        });
        viewer.layer.append(viewerButton);
        viewerKey = viewer.key;
        viewerCard = {
          button: viewerButton,
          post,
        };
        if (settings.autoCheck) queue(post);
      }
      paint(viewerCard);
    }
    async function refresh() {
      const visible = [...cards.values()].filter((c) => c.article.isConnected).map((c) => c.post);
      if (!visible.length) {
        notice("Nenhum post identificado nesta tela.");
        return;
      }
      status.clear();
      await checkNow(visible.slice(0, 120));
      notice("Status consultado no Worker/D1.", "success");
    }
    async function health() {
      const response = await transport({
        path: "/health",
        method: "GET",
        timeout: 12_000,
      });
      if (response.status >= 200 && response.status < 300) {
        notice("Relay conectado ✓", "success");
      } else throw new Error(`Relay HTTP ${response.status}.`);
    }
    async function action(name) {
      if (name === "relay-cancel" || name === "relay-force") return handleConfirm(name);
      if (name === "relay-save") return save();
      if (name === "relay-health") {
        await save();
        return health();
      }
      if (name === "relay-refresh") return refresh();
    }
    return Object.freeze({
      settingsHTML,
      switchAccount,
      scan,
      scanImmersive,
      action,
      refresh,
      exportPreferences,
      applyPreferences,
      transport,
      configured: () => Boolean(settings.token && identity),
      relayUrl: () => validUrl(settings.url),
      tokenForTransfer: () => settings.token,
    });
  })();
}
