import { mountView } from "../ui/solid-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { createDefaults } from "../../../config/defaults.js";
import { applyComponentStyle } from "../../../core/css.js";
import { DOM_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-tweets-publisher-1.css?inline";
import extractedCSS2 from "../../../styles/extracted/userscripts-rodx-studio-tweets-publisher-2.css?inline";
import { PREFIX } from "../config/search.js";
import { Studio } from "../core/studio.js";
import { html } from "../shared/text.js";
import { state } from "../state/deck.js";
import { gmAvailable, storage } from "../storage/gm.js";
import { Relay } from "../telegram/relay.tsx";
import { renderRoot } from "../ui/search-workbench.tsx";
import { showRodxToast } from "../ui/toast.tsx";

export let XRepost;

export function initializeDeckXRepost() {
  XRepost = (() => {
    const PREFS_KEY = PREFIX + "x-repost:";
    const MAX_ROWS = RUNTIME_LIMITS.tweetsPublisher.maxRows;
    const STATUSES = ["queued", "claimed", "posted", "cancelled"];
    const LABELS = {
      queued: "Na fila",
      claimed: "Reservados",
      posted: "Publicados",
      cancelled: "Cancelados",
    };
    const defaults = createDefaults("repost");
    let preferences = { ...defaults };
    let account = "";
    let view = "queued";
    let rows = new Map<any, any>(STATUSES.map((status) => [status, []]));
    let fetchedAt = 0;
    let loading = false;
    let error = "";
    let currentClaim = null;
    let pendingPromise = null;
    let backgroundTimer = null;
    let pageEpoch = 0;
    const prompted = new Set<any>();
    const inflight = new Map<any, any>();
    const preparedFiles = new Map<any, any>();
    const videoLoads = new Map<any, any>();

    function escapeText(input) {
      return html(String(input ?? ""));
    }
    function normalizeCaption(input, options: Record<string, any> = {}) {
      const raw = String(input || "").replace(/\r\n?/g, "\n");
      // Telegram HTML is not a caption format accepted by X or Instagram. The parser is inert.
      // Plain text containing angle brackets stays plain text unless recognizable markup exists.
      const looksLikeMarkup = /<\/?(?:b|strong|i|em|u|s|a|span|code|br|p)(?:\s|>)/i.test(raw);
      let result = raw;
      let origin = "";
      if (looksLikeMarkup) {
        const parsed = new DOMParser().parseFromString(raw, "text/html");
        for (const br of parsed.body.querySelectorAll<HTMLElement>(DOM_SELECTORS.lineBreaks))
          br.replaceWith("\n");
        for (const block of parsed.body.querySelectorAll<HTMLElement>(DOM_SELECTORS.paragraphs))
          block.append("\n");
        for (const anchor of parsed.body.querySelectorAll<HTMLElement>(DOM_SELECTORS.linksWithHref)) {
          const label = String(anchor.textContent || "").trim();
          const href = safeSource(anchor.getAttribute("href"));
          if (href && /^(?:abrir (?:no|o) x|open (?:in|on) x|ver (?:no )?x)$/i.test(label)) {
            origin ||= href;
            anchor.remove();
          }
        }
        result = parsed.body.textContent || "";
      }
      result = result
        .replace(/\u00a0/g, " ")
        .replace(/[\t ]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .replace(/(^|[^\w/@])@([A-Za-z0-9_]{1,15})(?![\w/])/g, "$1@/$2");
      const url = safeSource(options.sourceUrl) || origin;
      if (options.includeSourceUrl === true && url && !result.includes(url)) {
        result = [result, url].filter(Boolean).join("\n\n");
      }
      return result;
    }
    function shareCaption(item, input = item?.caption || "") {
      return normalizeCaption(input, {
        includeSourceUrl: preferences.includeSourceUrl,
        sourceUrl: item?.source_url,
      });
    }
    function shareDestination() {
      return preferences.destination === "x" ? "X" : "Instagram";
    }
    function safeSource(value) {
      try {
        const url = new URL(String(value || ""));
        if (
          url.protocol !== "https:" ||
          !["x.com", "twitter.com", "mobile.twitter.com"].includes(url.hostname)
        ) {
          return "";
        }
        const legacy = url.pathname.match(/^\/i\/web\/status\/(\d{8,25})(?:\/|$)/);
        if (legacy) return `${url.origin}/i/status/${legacy[1]}`;
        return /^\/(?:[A-Za-z0-9_]{1,15}|i)\/status\/\d{8,25}(?:\/|$)/.test(url.pathname) ? url.href : "";
      } catch {
        return "";
      }
    }
    function timeLabel(seconds) {
      const date = new Date(Number(seconds) * 1000);
      return Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR") : "Não informado";
    }
    function retryAfter(headerString) {
      const line = String(headerString || "")
        .split(/\r?\n/)
        .find((entry) => /^retry-after\s*:/i.test(entry));
      const value = line?.split(":").slice(1).join(":").trim();
      if (!value) return 0;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) return Math.min(120_000, Math.max(0, seconds * 1000));
      const time = Date.parse(value);
      return Number.isFinite(time) ? Math.min(120_000, Math.max(0, time - Date.now())) : 0;
    }
    function sleep(ms) {
      return new Promise<any>((resolve) => setTimeout(resolve, ms));
    }
    async function call(path, method = "GET", payload = null, options: Record<string, any> = {}) {
      if (!Relay.configured()) throw Error("Configure o token do Telegram Relay primeiro.");
      // Writes are never retried automatically: their result might be uncertain.
      const retries = method === "GET" ? 2 : 0;
      let last = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        let result;
        try {
          result = await Relay.transport({ path, method, payload, timeout: options.timeout || 30_000 });
        } catch (cause) {
          last = cause;
          if (attempt === retries) throw cause;
          await sleep(Math.min(12_000, 850 * 2 ** attempt) * (0.7 + Math.random() * 0.6));
          continue;
        }
        const status = Number(result.status);
        if (status >= 200 && status < 300 && result.data?.ok === true) return result.data;
        last = new Error(String(result.data?.error || `Relay HTTP ${status}`));
        if (attempt === retries || ![429, 502, 503, 504].includes(status)) throw last;
        const backoff = Math.min(20_000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6);
        await sleep(Math.max(backoff, retryAfter(result.headers)));
      }
      throw last || Error("Falha de comunicação com a fila D1.");
    }
    function cleanupPreparedFiles() {
      for (const record of preparedFiles.values()) URL.revokeObjectURL(record.url);
      preparedFiles.clear();
    }
    async function switchAccount(id) {
      account = String(id || "");
      const generation = ++pageEpoch;
      rows = new Map<any, any>(STATUSES.map((status) => [status, []]));
      currentClaim = null;
      fetchedAt = 0;
      loading = false;
      error = "";
      pendingPromise = null;
      prompted.clear();
      clearTimeout(backgroundTimer);
      cleanupPreparedFiles();
      videoLoads.clear();
      preferences = { ...defaults };
      try {
        const record = account && gmAvailable ? await storage.get(PREFS_KEY + account) : null;
        if (generation === pageEpoch && record && typeof record === "object") {
          const fromPreviousVersion = record.shareMode == null;
          preferences = {
            shareMode: ["direct", "review", "off"].includes(record.shareMode)
              ? record.shareMode
              : fromPreviousVersion && record.promptAfterTelegram === false
                ? "off"
                : "direct",
            destination: record.destination === "x" ? "x" : "instagram",
            enqueueAfterTelegram: record.enqueueAfterTelegram !== false,
            copyCaptionOnShare: record.copyCaptionOnShare !== false,
            includeSourceUrl: record.includeSourceUrl === true,
          };
        }
      } catch (cause) {
        console.warn("[RodX repost] Preferências locais:", cause.message);
      }
    }
    async function savePreferences() {
      if (!gmAvailable || !account) throw Error("Identifique sua conta e habilite GM Storage.");
      const shadow = state.rootShadow;
      const modeField = shadow?.querySelector(RODX_SELECTORS.repostShareMode);
      const destinationField = shadow?.querySelector(RODX_SELECTORS.repostDestination);
      const queueField = shadow?.querySelector(RODX_SELECTORS.repostEnqueueAfterTelegram);
      const copyField = shadow?.querySelector(RODX_SELECTORS.repostCopyCaption);
      const urlField = shadow?.querySelector(RODX_SELECTORS.repostIncludeSourceUrl);
      preferences = {
        shareMode: ["direct", "review", "off"].includes(modeField?.value)
          ? modeField.value
          : defaults.shareMode,
        destination: destinationField?.value === "x" ? "x" : "instagram",
        enqueueAfterTelegram: queueField?.checked === true,
        copyCaptionOnShare: copyField?.checked === true,
        includeSourceUrl: urlField?.checked === true,
      };
      await storage.set(PREFS_KEY + account, preferences);
      showRodxToast("Preferências de repost salvas.");
      renderRoot();
    }
    function rowItem(id) {
      const key = String(id || "");
      for (const group of rows.values()) {
        const match = group.find((item) => item.id === key);
        if (match) return match;
      }
      return null;
    }
    function requestRefresh() {
      if (state.open && state.view === "xrepost") renderRoot();
    }
    async function refresh(force = false) {
      if (!Relay.configured()) {
        error = "Configure primeiro o token pessoal do Telegram Relay na aba Telegram.";
        requestRefresh();
        return;
      }
      if (pendingPromise) return pendingPromise;
      if (!force && fetchedAt && Date.now() - fetchedAt < 20_000) return;
      const myEpoch = pageEpoch;
      loading = true;
      error = "";
      requestRefresh();
      pendingPromise = (async () => {
        const results = await Promise.allSettled(
          STATUSES.map(async (status) => {
            const response = await call(`/x/repost/queue?status=${status}&limit=${MAX_ROWS}`);
            return { status, entries: Array.isArray(response.items) ? response.items : [] };
          }),
        );
        if (myEpoch !== pageEpoch) return;
        const errors = [];
        for (const result of results) {
          if (result.status === "fulfilled") rows.set(result.value.status, result.value.entries);
          else errors.push(String(result.reason?.message || result.reason));
        }
        if (errors.length) error = errors.join(" · ");
        else fetchedAt = Date.now();
      })().finally(() => {
        if (myEpoch === pageEpoch) {
          loading = false;
          pendingPromise = null;
          requestRefresh();
        }
      });
      return pendingPromise;
    }
    function scheduleRefresh() {
      clearTimeout(backgroundTimer);
      if (document.hidden || !state.open || state.view !== "xrepost") return;
      backgroundTimer = setTimeout(
        () => {
          backgroundTimer = null;
          if (!document.hidden && state.view === "xrepost" && state.open) {
            void refresh(true).finally(scheduleRefresh);
          }
        },
        65_000 + Math.floor(Math.random() * 20_000),
      );
    }
    function onOpen() {
      void refresh().finally(scheduleRefresh);
    }
    function htmlView() {
      const list = rows.get(view) || [];
      return (
        <>
          <section class={"rodx-xrepost"} aria-label={"Fila de vídeos no X"}>
            {"\n            "}
            <style textContent={extractedCSS1} />
            {"\n            "}
            <div class={"banner"}>
              {
                "\n              🎬 Fila global do token Relay/D1: inclui vídeos enviados pelo Safari, Scriptable e Shortcuts.\n              Telegram entregue ≠ vídeo publicado no X. Publicar requer confirmação sua.\n            "
              }
            </div>
            {"\n            "}
            <div class={"row rx-publisher-row"}>
              {"\n              "}
              <button class={"btn"} data-act={"xrepost-refresh"}>
                {"↻ Atualizar D1"}
              </button>
              {"\n              "}
              <button class={"btn primary"} data-act={"xrepost-next"}>
                {"▶ Próximo vencido"}
              </button>
              {"\n            "}
            </div>
            {"\n            "}
            <div class={"xr-choices"} role={"tablist"} aria-label={"Estados da fila"}>
              {"\n              "}
              {STATUSES.map((status) => (
                <>
                  <button
                    type={"button"}
                    role={"tab"}
                    aria-selected={view === status ? "true" : "false"}
                    class={["btn ", view === status ? "primary" : ""].join("")}
                    data-act={"xrepost-tab"}
                    data-id={status}
                  >
                    {"\n                "}
                    {LABELS[status]}
                    {" ("}
                    {(rows.get(status) || []).length}
                    {")"}
                  </button>
                </>
              ))}
              {"\n            "}
            </div>
            {"\n            "}
            {loading ? (
              <>
                <p class={"muted"}>{"Sincronizando D1…"}</p>
              </>
            ) : (
              ""
            )}
            {"\n            "}
            {error ? (
              <>
                <p class={"storage-warning"} role={"alert"}>
                  {escapeText(error)}
                </p>
              </>
            ) : (
              ""
            )}
            {"\n            "}
            {!list.length ? (
              <>
                <p class={"muted"}>{"Nenhum registro nesta categoria. Toque em Atualizar D1."}</p>
              </>
            ) : (
              ""
            )}
            {"\n            "}
            {list.map((item) => (
              <>
                <article class={"xr-item"}>
                  {"\n              "}
                  <div class={"xr-caption"}>{escapeText(shareCaption(item) || "Sem legenda")}</div>
                  {"\n              "}
                  <p class={"xr-meta"}>
                    {escapeText(item.status)}
                    {" · "}
                    {escapeText(timeLabel(item.scheduled_at))}
                    {"\n                "}
                    {item.posted_at ? ` · publicado ${escapeText(timeLabel(item.posted_at))}` : ""}
                  </p>
                  {"\n              "}
                  <p class={"xr-meta"}>
                    {"Origem: "}
                    <a
                      href={escapeText(safeSource(item.source_url) || "#")}
                      target={"_blank"}
                      rel={"noopener noreferrer"}
                    >
                      {escapeText(item.source_url || "Sem URL")}
                    </a>
                  </p>
                  {"\n              "}
                  {item.post_url ? (
                    <>
                      <p class={"xr-meta"}>
                        {"Publicado: "}
                        <a
                          href={escapeText(safeSource(item.post_url) || "#")}
                          target={"_blank"}
                          rel={"noopener noreferrer"}
                        >
                          {"Ver post no X"}
                        </a>
                      </p>
                    </>
                  ) : (
                    ""
                  )}
                  {"\n              "}
                  <div class={"xr-actions"}>
                    {"\n                "}
                    {item.status !== "posted" && item.status !== "cancelled" ? (
                      <>
                        <button
                          class={"btn primary"}
                          data-act={"xrepost-prepare"}
                          data-id={escapeText(item.id)}
                        >
                          {"🎞 Compartilhar vídeo"}
                        </button>
                        {"\n                    "}
                        <button class={"btn"} data-act={"xrepost-edit"} data-id={escapeText(item.id)}>
                          {"\n                      ✎ Editar legenda\n                    "}
                        </button>
                      </>
                    ) : (
                      ""
                    )}
                    {"\n                "}
                    {item.status === "queued" ? (
                      <>
                        <button class={"btn"} data-act={"xrepost-delay"} data-id={escapeText(item.id)}>
                          {"Adiar 1 h"}
                        </button>
                      </>
                    ) : (
                      ""
                    )}
                    {"\n                "}
                    <button class={"btn"} data-act={"xrepost-copy"} data-id={escapeText(item.id)}>
                      {"Copiar legenda"}
                    </button>
                    {"\n              "}
                  </div>
                  {"\n            "}
                </article>
              </>
            ))}
            {"\n            "}
            <p class={"muted"}>
              {
                "Até 100 itens por status (limite do endpoint atual).\n              Consultas têm backoff e jitter, sem reenvio automático de mutations."
              }
            </p>
            {"\n            "}
            <fieldset class={"rx-publisher-fieldset"}>
              {"\n              "}
              <legend>{"Compartilhamento depois do Telegram"}</legend>
              {"\n              "}
              <label class={"rx-repost-share-mode-field"}>
                {"\n                Destino preferido\n                "}
                <select class={"btn rx-publisher-btn"} data-xrepost-setting={"destination"}>
                  {"\n                  "}
                  <option
                    value={"instagram"}
                    selected={(preferences.destination === "instagram" ? "selected" : "") === "selected"}
                  >
                    {"\n                    Instagram (selecionar na folha do iPhone)\n                  "}
                  </option>
                  {"\n                  "}
                  <option
                    value={"x"}
                    selected={(preferences.destination === "x" ? "selected" : "") === "selected"}
                  >
                    {"\n                    X / Twitter (selecionar na folha do iPhone)\n                  "}
                  </option>
                  {"\n                "}
                </select>
                {"\n              "}
              </label>
              {"\n              "}
              <label class={"rx-repost-destination-field"}>
                {"\n                Fluxo de publicação\n                "}
                <select class={"btn rx-publisher-btn-width"} data-xrepost-setting={"shareMode"}>
                  {"\n                  "}
                  <option
                    value={"direct"}
                    selected={(preferences.shareMode === "direct" ? "selected" : "") === "selected"}
                  >
                    {
                      "\n                    Direto: preparar MP4 e compartilhar com um toque\n                  "
                    }
                  </option>
                  {"\n                  "}
                  <option
                    value={"review"}
                    selected={(preferences.shareMode === "review" ? "selected" : "") === "selected"}
                  >
                    {"\n                    Revisar: abrir editor de legenda primeiro\n                  "}
                  </option>
                  {"\n                  "}
                  <option
                    value={"off"}
                    selected={(preferences.shareMode === "off" ? "selected" : "") === "selected"}
                  >
                    {"\n                    Não abrir nada após o Telegram\n                  "}
                  </option>
                  {"\n                "}
                </select>
                {"\n              "}
              </label>
              {"\n              "}
              <label class={"tog"}>
                {"\n                "}
                <input
                  type={"checkbox"}
                  data-xrepost-setting={"enqueueAfterTelegram"}
                  checked={(preferences.enqueueAfterTelegram ? "checked" : "") === "checked"}
                />
                {"\n                Garantir registro no D1 após confirmação\n              "}
              </label>
              {"\n              "}
              <label class={"tog"}>
                {"\n                "}
                <input
                  type={"checkbox"}
                  data-xrepost-setting={"copyCaptionOnShare"}
                  checked={(preferences.copyCaptionOnShare ? "checked" : "") === "checked"}
                />
                {"\n                Tentar copiar legenda ao compartilhar\n              "}
              </label>
              {"\n              "}
              <label class={"tog"}>
                {"\n                "}
                <input
                  type={"checkbox"}
                  data-xrepost-setting={"includeSourceUrl"}
                  checked={(preferences.includeSourceUrl ? "checked" : "") === "checked"}
                />
                {"\n                Acrescentar link do tweet original à legenda\n              "}
              </label>
              {"\n              "}
              <p class={"muted rx-publisher-muted"}>
                {
                  "\n                O Safari não pode escolher automaticamente um aplicativo nem anexar um arquivo ao\n                compositor por deep link. O MP4 é preparado antes; um toque abre o compartilhamento\n                nativo do iOS. Instagram pode ignorar o texto compartilhado. A fila só é marcada como\n                publicada depois da sua confirmação, nunca ao compartilhar.\n              "
                }
              </p>
              {"\n              "}
              <button class={"btn primary"} data-act={"xrepost-save"}>
                {"Salvar opções"}
              </button>
              {"\n            "}
            </fieldset>
            {"\n          "}
          </section>
        </>
      );
    }
    async function onTelegramConfirmed(post) {
      if (!post?.isVideo || !post.id) return;
      const sourceUrl = safeSource(post.url) || safeSource(`https://x.com/i/status/${post.id}`);
      if (!sourceUrl) return;
      if (preferences.shareMode === "off" && !preferences.enqueueAfterTelegram) return;
      const identifier = `${account}:${post.id}`;
      if (prompted.has(identifier) || inflight.has(identifier)) return;
      const promise = (async () => {
        const caption = normalizeCaption([post.author, post.text].filter(Boolean).join("\n\n"), {
          includeSourceUrl: preferences.includeSourceUrl,
          sourceUrl,
        });
        let item = null;
        if (preferences.enqueueAfterTelegram) {
          try {
            const result = await call("/x/repost/queue", "POST", {
              sourceUrl,
              caption,
            });
            item = result.item || null;
            if (item?.status) {
              if (item.status === "posted") return;
              const previous = rows.get(item.status) || [];
              rows.set(item.status, [item, ...previous.filter((r) => r.id !== item.id)].slice(0, MAX_ROWS));
            }
          } catch (cause) {
            // Could have reached D1 despite a timeout. Show an uncertain state, never repost blindly.
            error = `Registro remoto incerto: ${cause.message}. Confira a fila antes de reenviar.`;
          }
        }
        prompted.add(identifier);
        if (prompted.size > 150) prompted.delete(prompted.values().next().value);
        if (preferences.shareMode !== "off") {
          const target = item || {
            id: "",
            source_url: sourceUrl,
            caption,
            status: "unverified",
            media_url: null,
          };
          if (preferences.shareMode === "review") openCompose(target);
          else openDirectShare(target);
        }
      })().finally(() => inflight.delete(identifier));
      inflight.set(identifier, promise);
      return promise;
    }
    async function claimNextDue() {
      if (currentClaim?.id) {
        if (preferences.shareMode === "review") openCompose(currentClaim);
        else openDirectShare(currentClaim);
        return;
      }
      // D1 atomically selects the single earliest due item, not a guessed list entry.
      const result = await call("/x/repost/claim", "POST", {});
      if (!result.item) {
        showRodxToast("Nenhum vídeo venceu o agendamento do D1.");
        return;
      }
      currentClaim = result.item;
      await refresh(true);
      if (preferences.shareMode === "review") openCompose(currentClaim);
      else openDirectShare(currentClaim);
    }
    async function confirmPublished(item, postUrl = "") {
      if (!currentClaim?.claim_token || currentClaim.id !== item.id) {
        throw Error("Primeiro reserve o próximo item vencido. Não marco posts sem lease D1.");
      }
      if (String(postUrl).trim() && !safeSource(postUrl)) {
        throw Error("A URL do post não é uma URL válida de status do X.");
      }
      const result = await call(`/x/repost/queue/${encodeURIComponent(item.id)}`, "PATCH", {
        action: "posted",
        claimToken: currentClaim.claim_token,
        postUrl: safeSource(postUrl) || "",
      });
      currentClaim = null;
      await refresh(true);
      showRodxToast(
        result.item?.status === "posted" ? "Publicado confirmado no D1. ✓" : "Status retornado pelo D1.",
      );
    }
    async function delay(item) {
      if (!window.confirm("Adiar este item por pelo menos uma hora na fila D1?")) return;
      const schedule = Math.floor(Date.now() / 1000) + 3600 + Math.floor(Math.random() * 600);
      await call(`/x/repost/queue/${encodeURIComponent(item.id)}`, "PATCH", {
        action: "reschedule",
        scheduledAt: schedule,
      });
      if (currentClaim?.id === item.id) currentClaim = null;
      await refresh(true);
    }
    function openCompose(item) {
      const source = safeSource(item.source_url);
      const claimOwned = currentClaim?.id === item.id && Boolean(currentClaim?.claim_token);
      const original = shareCaption(item);
      Studio.menu.open({
        id: "rodx-xrepost-compose",
        title: `🎬 Revisar publicação para ${shareDestination()}`,
        description:
          `${item.status === "unverified" ? "Fila D1 não confirmada. " : "Vídeo registrado no D1. "}` +
          `${claimOwned ? "Reservado para você." : "Ainda não reservado para marcar como publicado."} ` +
          "Compartilhe o arquivo no aplicativo escolhido e confirme a publicação separadamente.",
        presentation: "bottom-sheet",
        size: "lg",
        store: { persist: false },
        fields: [
          {
            type: "textarea",
            name: "caption",
            label: "Legenda editável (@ → @/)",
            value: original,
            rows: 7,
            resize: "vertical",
          },
          {
            type: "text",
            name: "postUrl",
            label: "URL do post publicado (opcional)",
            value: "",
            placeholder: "https://x.com/voce/status/123...",
          },
          {
            type: "custom",
            name: "details",
            chrome: "bare",
            render() {
              const details = (<p />) as HTMLElement;
              applyComponentStyle(details, "rx-publisher-details", false);
              details.textContent =
                "O vídeo é preparado antes de abrir a folha de compartilhamento do iPhone. " +
                "Escolha o aplicativo na folha nativa. A fila só muda para Publicados após " +
                "confirmar que o post realmente apareceu no X. O Relay D1 continua como fonte.";
              return details;
            },
          },
        ],
        actions: [
          {
            id: "copy",
            label: "Copiar legenda",
            role: "custom",
            close: false,
            handler: async (ctx) => {
              await navigator.clipboard.writeText(normalizeCaption(ctx.values.caption));
              showRodxToast("Legenda copiada.");
            },
          },
          {
            id: "share",
            label: "🎞 Compartilhar vídeo",
            role: "custom",
            close: false,
            handler: (ctx) => {
              openDirectShare(item, { caption: ctx.values.caption });
            },
          },
          {
            id: "compose",
            label: "Abrir X (somente texto)",
            role: "custom",
            close: false,
            handler: async (ctx) => {
              const text = normalizeCaption(ctx.values.caption);
              // Native X intent; file upload and final submission are user-controlled.
              const url = "https://x.com/intent/post?text=" + encodeURIComponent(text);
              const popup = window.open(url, "_blank", "noopener,noreferrer");
              if (!popup) {
                await navigator.clipboard.writeText(text);
                showRodxToast("Popup bloqueada: legenda copiada. Abra o compositor do X.");
              }
            },
          },
          ...(claimOwned
            ? [
                {
                  id: "posted",
                  label: "✓ Confirmei que publiquei",
                  role: "custom",
                  close: true,
                  handler: async (ctx) => {
                    if (!window.confirm("O vídeo já aparece publicado no X?")) return;
                    await confirmPublished(item, String(ctx.values.postUrl || ""));
                  },
                },
              ]
            : []),
          { id: "close", label: "Fechar", role: "cancel" },
        ],
      });
    }
    function requestVideo(url, privateUrl = false) {
      const gm =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
            ? GM.xmlHttpRequest.bind(GM)
            : null;
      if (!gm) throw Error("Seu gerenciador não oferece download via GM.");
      return new Promise<any>((resolve, reject) => {
        let done = false;
        const settle = (fn, value) => {
          if (done) return;
          done = true;
          fn(value);
        };
        gm({
          method: "GET",
          url,
          responseType: "arraybuffer",
          timeout: RUNTIME_LIMITS.tweetsPublisher.requestVideoTimeout,
          headers: privateUrl ? { Authorization: "Bearer " + Relay.tokenForTransfer() } : {},
          onload(result) {
            const code = Number(result.status);
            const contentType =
              String(result.responseHeaders || "").match(/^content-type:\s*([^\r\n]+)/im)?.[1] || "video/mp4";
            const bytes = result.response;
            const buffer =
              bytes instanceof ArrayBuffer
                ? bytes
                : ArrayBuffer.isView(bytes)
                  ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
                  : null;
            if (
              code >= 200 &&
              code < 300 &&
              buffer &&
              buffer.byteLength > 0 &&
              buffer.byteLength <= 85_000_000 &&
              !/json|html/i.test(contentType)
            ) {
              settle(resolve, new Blob([new Uint8Array(buffer).slice().buffer], { type: "video/mp4" }));
            } else settle(reject, Error(`MP4 não disponível (HTTP ${code}).`));
          },
          onerror: () => settle(reject, Error("Não consegui baixar o MP4.")),
          onabort: () => settle(reject, Error("Download cancelado.")),
          ontimeout: () => settle(reject, Error("Tempo de download esgotado.")),
        });
      });
    }
    async function getVideo(item) {
      if (preparedFiles.has(item.id)) return preparedFiles.get(item.id).blob;
      const generation = pageEpoch;
      const sources = [
        { url: Relay.relayUrl() + `/x/repost/queue/${encodeURIComponent(item.id)}/media`, auth: true },
      ];
      try {
        const remote = new URL(String(item.media_url || ""));
        if (
          remote.protocol === "https:" &&
          !remote.username &&
          !remote.password &&
          /^(?:video\.twimg\.com|pbs\.twimg\.com)$/i.test(remote.hostname)
        ) {
          sources.push({ url: remote.href, auth: false });
        }
      } catch {
        /* No public media URL available. */
      }
      let failed;
      for (const source of sources) {
        try {
          const blob = await requestVideo(source.url, source.auth);
          if (generation !== pageEpoch) throw Error("Conta alterada durante o download.");
          const url = URL.createObjectURL(blob);
          const record = { blob, url, at: Date.now() };
          preparedFiles.set(item.id, record);
          while (preparedFiles.size > 1) {
            const oldest = preparedFiles.keys().next().value;
            URL.revokeObjectURL(preparedFiles.get(oldest).url);
            preparedFiles.delete(oldest);
          }
          return blob;
        } catch (cause) {
          failed = cause;
        }
      }
      throw failed || Error("Vídeo não encontrado no Relay.");
    }
    function loadVideoOnce(item) {
      if (!item?.id) return Promise.reject(Error("O vídeo ainda não foi registrado no D1."));
      if (preparedFiles.has(item.id)) return Promise.resolve(preparedFiles.get(item.id).blob);
      if (videoLoads.has(item.id)) return videoLoads.get(item.id);
      const task = getVideo(item);
      videoLoads.set(item.id, task);
      void task
        .finally(() => {
          if (videoLoads.get(item.id) === task) videoLoads.delete(item.id);
        })
        .catch(() => {});
      return task;
    }
    function downloadPreparedVideo(item) {
      const record = preparedFiles.get(item.id);
      if (!record?.url) throw Error("O vídeo precisa estar carregado antes de salvar.");
      const link = (<a />) as HTMLAnchorElement;
      link.href = record.url;
      link.download = `rodx-${item.id}.mp4`;
      document.body.append(link);
      link.click();
      link.remove();
    }
    function openDirectShare(item, options: Record<string, any> = {}) {
      const caption = shareCaption(item, options.caption ?? item.caption);
      const destination = shareDestination();
      const panel = (<section />) as HTMLElement;
      panel.className = "rodx-direct-share";
      applyComponentStyle(panel, "rx-publisher-panel", false);
      mountView(panel, () => (
        <>
          {"\n            "}
          <style textContent={extractedCSS2} />
          {"\n            "}
          <p class={"rdx-ds-status"} data-share-status={""} role={"status"} aria-live={"polite"}>
            {"\n              Preparando o vídeo do Relay para o iPhone…\n            "}
          </p>
          {"\n            "}
          <label class={"rx-repost-caption-field"}>
            {"\n              Legenda (sem tags HTML, com @/usuario)\n              "}
            <textarea class={"rdx-ds-caption"} data-share-caption={""} spellcheck={"false"}></textarea>
            {"\n            "}
          </label>
          {"\n            "}
          <div class={"rdx-ds-buttons"}>
            {"\n              "}
            <button type={"button"} class={"btn primary"} data-share-action={"native"} disabled={true}>
              {"\n                🎞 Compartilhar vídeo no iPhone\n              "}
            </button>
            {"\n              "}
            <button type={"button"} class={"btn"} data-share-action={"copy"}>
              {"Copiar legenda"}
            </button>
            {"\n              "}
            <button type={"button"} class={"btn"} data-share-action={"save"} disabled={true}>
              {"Salvar MP4"}
            </button>
            {"\n              "}
            <button type={"button"} class={"btn"} data-share-action={"review"}>
              {"Editar detalhes"}
            </button>
            {"\n              "}
            <button type={"button"} class={"btn"} data-share-action={"source"}>
              {"Ver tweet original"}
            </button>
            {"\n            "}
          </div>
          {"\n            "}
          <p class={"rdx-ds-note"}>
            {"\n              Escolha "}
            {destination}
            {
              " na folha de compartilhamento do iOS. O navegador não pode\n              selecionar o aplicativo por você nem garantir que o Instagram receba a legenda.\n              Compartilhar o arquivo não confirma que o vídeo foi publicado.\n              "
            }
            {destination === "Instagram"
              ? "A fila do Relay é de reposts no X: enviar ao Instagram não encerra a fila do X."
              : ""}
            {"\n            "}
          </p>
          {"\n          "}
        </>
      ));
      const textArea = panel.querySelector<HTMLElement>(RODX_SELECTORS.shareCaption);
      const statusElement = panel.querySelector<HTMLElement>(RODX_SELECTORS.shareStatus);
      const nativeButton = panel.querySelector<HTMLElement>(RODX_SELECTORS.shareNativeAction);
      const saveButton = panel.querySelector<HTMLElement>(RODX_SELECTORS.shareSaveAction);
      (textArea as HTMLInputElement).value = caption;
      const source = safeSource(item.source_url);
      if (!source)
        (panel.querySelector<HTMLElement>(RODX_SELECTORS.shareSourceAction) as HTMLButtonElement).disabled =
          true;

      function status(message, isError = false) {
        statusElement.textContent = message;
        statusElement.style.setProperty("color", isError ? "#f4212e" : "inherit", "important");
      }
      // No user-activation-consuming API is called before navigator.share() during the click.
      // Download is asynchronous and must finish BEFORE the user taps this button on Safari.
      panel.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest(RODX_SELECTORS.shareActions);
        if (!button || !panel.contains(button) || (button as HTMLButtonElement).disabled) return;
        const actionName = (button as HTMLElement).dataset.shareAction;
        const text = normalizeCaption((textArea as HTMLInputElement).value);
        if (actionName === "native") {
          const record = preparedFiles.get(item.id);
          if (!record?.blob) {
            status("O MP4 ainda não está disponível. Tente novamente pelo painel.", true);
            return;
          }
          const file = new File([record.blob], `rodx-${item.id}.mp4`, { type: "video/mp4" });
          if (
            typeof navigator.share !== "function" ||
            typeof navigator.canShare !== "function" ||
            !navigator.canShare({ files: [file] })
          ) {
            status("Compartilhar MP4 não está disponível neste Safari. Use Salvar MP4.", true);
            return;
          }
          if (preferences.copyCaptionOnShare && navigator.clipboard?.writeText) {
            // Best effort, never block the physical share gesture when the clipboard is denied.
            try {
              void navigator.clipboard.writeText(text).catch(() => {});
            } catch {
              /* clipboard is optional */
            }
          }
          // Must happen synchronously inside the physical tap, not after an await.
          try {
            const share = navigator.share({ files: [file], text });
            void share
              .then(() => {
                status("Arquivo entregue à folha do iPhone. Confirme a publicação separadamente no D1.");
              })
              .catch((cause) => {
                if (cause?.name !== "AbortError") {
                  status(`Compartilhamento indisponível: ${cause.message || cause}`, true);
                }
              });
          } catch (cause) {
            status(`Não foi possível abrir o compartilhamento: ${cause.message || cause}`, true);
          }
          return;
        }
        if (actionName === "copy") {
          void navigator.clipboard
            .writeText(text)
            .then(() => {
              status("Legenda copiada. Cole no editor do aplicativo escolhido.");
            })
            .catch((cause) => status(`Não foi possível copiar: ${cause.message}`, true));
        } else if (actionName === "save") {
          try {
            downloadPreparedVideo(item);
          } catch (cause) {
            status(cause.message, true);
          }
        } else if (actionName === "review") {
          openCompose({ ...item, caption: text });
        } else if (actionName === "source" && source) {
          window.open(source, "_blank", "noopener,noreferrer");
        }
      });
      Studio.menu.open({
        id: "rodx-xrepost-direct-share",
        title: `🎞 Compartilhar vídeo para ${destination}`,
        presentation: "bottom-sheet",
        size: "md",
        store: { persist: false },
        fields: [{ type: "custom", name: "shareReady", chrome: "bare", render: () => panel }],
        actions: [{ id: "close", label: "Fechar", role: "cancel" }],
      });
      if (!item.id) {
        status("O Relay não confirmou um registro D1. Revise a fila antes de compartilhar.", true);
        return;
      }
      const expectedAccount = account;
      void loadVideoOnce(item)
        .then((blob) => {
          if (account !== expectedAccount) return;
          (nativeButton as HTMLButtonElement).disabled = false;
          (saveButton as HTMLButtonElement).disabled = false;
          status(
            `MP4 pronto (${(blob.size / 1048576).toFixed(1)} MB). ` +
              `Toque em Compartilhar e escolha ${destination} no iPhone.`,
          );
        })
        .catch((cause) => {
          if (account !== expectedAccount) return;
          status(
            `Não consegui recuperar o MP4: ${cause.message}. ` +
              "Confira o R2, o arquivo do Shortcut ou use o editor manual.",
            true,
          );
        });
    }
    async function action(name, id = "") {
      if (name === "xrepost-refresh") return refresh(true);
      if (name === "xrepost-save") return savePreferences();
      if (name === "xrepost-next") return claimNextDue();
      if (name === "xrepost-tab") {
        if (STATUSES.includes(id)) view = id;
        return requestRefresh();
      }
      const item = rowItem(id);
      if (!item) throw Error("Item não encontrado. Atualize a fila do D1.");
      if (name === "xrepost-prepare") return openDirectShare(item);
      if (name === "xrepost-edit") return openCompose(item);
      if (name === "xrepost-delay") return delay(item);
      if (name === "xrepost-copy") {
        await navigator.clipboard.writeText(shareCaption(item));
        showRodxToast("Legenda copiada.");
      }
    }
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) clearTimeout(backgroundTimer);
        else if (state.open && state.view === "xrepost") {
          void refresh(true).finally(scheduleRefresh);
        }
      },
      { passive: true },
    );
    return Object.freeze({
      switchAccount,
      onTelegramConfirmed,
      htmlView,
      onOpen,
      action,
      normalizeCaption,
      refresh,
    });
  })();
}
