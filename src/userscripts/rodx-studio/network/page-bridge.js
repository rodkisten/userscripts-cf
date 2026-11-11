export function studioPageBridge(page, channel, defaultSettings, runtimeLimits) {
  "use strict";

  if (page.__rodxStudioNetworkV3) {
    page.__rodxStudioNetworkV3.announce(channel);
    return;
  }
  const document = page.document,
    doc = document,
    location = page.location;
  const PREFIX = channel;
  const nativeFetch = page.fetch.bind(page),
    headers = new page.Headers();
  let sessionReady = false;
  const emit = (type, detail) => {
    try {
      document.dispatchEvent(
        new page.CustomEvent(PREFIX + ":" + type, {
          detail: JSON.stringify(detail),
        }),
      );
    } catch {}
  };
  const allowed =
    /\/(?:HomeTimeline|HomeLatestTimeline|ListLatestTweetsTimeline|ListTweetsTimeline|UserTweets|UserTweetsAndReplies|UserMedia|SearchTimeline|Bookmarks|BookmarkFolderTimeline|CommunityTweetsTimeline|CommunityMediaTimeline|UserHighlightsTweets|Likes)(?:\?|$)/;
  const relevant = (url) => {
    try {
      const u = new URL(url, location.origin);
      return (
        u.origin === location.origin &&
        u.pathname.startsWith("/i/api/") &&
        (/\/graphql\/[^/]+\/(List\w+|Lists\w+|SearchTimeline|UserByScreenName|UserLists)$/i.test(
          u.pathname,
        ) ||
          /\/1\.1\/lists\//i.test(u.pathname))
      );
    } catch {
      return false;
    }
  };
  let cachedRaw = "",
    cachedRoute = "",
    cachedConfig = {};
  function config(url) {
    const path = location.pathname,
      raw = doc.documentElement?.getAttribute("data-rodx-feed-config") || "";
    if (raw === cachedRaw && path === cachedRoute) return cachedConfig;
    cachedRaw = raw;
    cachedRoute = path;
    let active = {};
    try {
      active = JSON.parse(raw || "{}");
      if (active.route !== path)
        active = JSON.parse(page.sessionStorage.getItem("rodx:feed:routes") || "{}")[path] || {};
    } catch {}
    let defaults = { ...defaultSettings.feed };
    try {
      defaults = {
        ...defaults,
        ...JSON.parse(page.localStorage.getItem("rodx:studio:runtime:v3") || "{}").feedDefaults,
      };
    } catch {}
    active = {
      ...defaults,
      ...active,
    };
    active._seen = new Set(active.seen || []);
    active._patterns = [];
    for (const p of active.patterns || [])
      try {
        active._patterns.push({
          ...p,
          re: new RegExp(p.source, p.flags === "i" ? "i" : ""),
        });
      } catch {}
    cachedConfig = active;
    return active;
  }
  const capture = (input, override) => {
    try {
      const h = new Headers(input || {});
      if (override) new Headers(override).forEach((v, k) => h.set(k, v));
      const allow = [
        "authorization",
        "x-csrf-token",
        "x-twitter-auth-type",
        "x-twitter-active-user",
        "x-twitter-client-language",
        "x-client-transaction-id",
        "x-guest-token",
      ];
      for (const key of allow) {
        const value = h.get(key);
        if (value) headers.set(key, value);
      }
      const ready = Boolean(headers.get("authorization"));
      if (ready !== sessionReady) {
        sessionReady = ready;
        emit("status", {
          ready: true,
          authReady: ready,
        });
      }
    } catch {}
  };
  function unwrap(result) {
    return result?.tweet || result;
  }
  function tweet(entry) {
    return unwrap(
      entry?.content?.itemContent?.tweet_results?.result ||
        entry?.item?.itemContent?.tweet_results?.result ||
        entry?.itemContent?.tweet_results?.result ||
        entry?.tweet_results?.result,
    );
  }
  const accepted = new Map();
  let acceptedScope = "";
  function keep(entry, settings) {
    const entryId = String(entry?.entryId || entry?.entry_id || "");
    const heading = entry?.content?.header?.text || "";
    if (
      /who.?to.?follow|suggest.?who|user.?recommendation|related.?users|suggested.?users|suggested.?lists|who.?to.?subscribe|connect.?module|recommendation.?module/i.test(
        entryId,
      ) ||
      /^(who to follow|quem seguir|a quién seguir|sugerid[oa]s?|suggested(?: for you)?|recomendad[oa]s?|recommended(?: for you)?|you might like|talvez você curta)$/i.test(
        String(heading).trim(),
      )
    )
      return false;
    const t = tweet(entry);
    if (!t?.legacy) return true;
    const legacy = t.legacy;
    const repost = !!(
      legacy.retweeted_status_result ||
      legacy.retweeted_status_id_str ||
      legacy.retweeted_status
    );
    if (settings.reposts === false && repost) return false;
    const actual = unwrap(legacy.retweeted_status_result?.result) || t;
    const media = actual.legacy?.extended_entities?.media || actual.legacy?.entities?.media || [];
    if (settings.media === "media" && !media.some((m) => ["photo", "video", "animated_gif"].includes(m.type)))
      return false;
    if (settings.media === "video" && !media.some((m) => m.type === "video" || m.type === "animated_gif"))
      return false;
    if (
      settings.media === "image" &&
      (!media.some((m) => m.type === "photo") ||
        media.some((m) => m.type === "video" || m.type === "animated_gif"))
    )
      return false;
    const id = String(t.rest_id || legacy.id_str || "");
    if (settings._seen?.has(id) || settings._seen?.has(String(actual.rest_id || ""))) return false;
    const words = actual.note_tweet?.note_tweet_results?.result?.text || actual.legacy?.full_text || "";
    const urls = (actual.legacy?.entities?.urls || []).flatMap((u) =>
      [u.expanded_url, u.unwound_url, u.url].filter(Boolean),
    );
    for (const rule of settings._patterns || []) {
      if (
        rule.kind === "textre"
          ? !rule.re.test(words.slice(0, runtimeLimits.maxPatternCharacters))
          : !urls.some((url) => rule.re.test(String(url).slice(0, runtimeLimits.maxPatternCharacters)))
      )
        return false;
    }
    if (settings.limit > 0 && id) {
      if (!accepted.has(id)) {
        if (accepted.size > runtimeLimits.maxAcceptedPostIds) return false;
        accepted.set(id, accepted.size);
      }
      if (accepted.get(id) >= settings.limit) return false;
    }
    return true;
  }
  function filter(data, settings) {
    let changed = false;
    function walk(node) {
      if (!node || typeof node !== "object") return;
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
          if (["entries", "items", "moduleItems"].includes(key)) {
            const next = value.filter((entry) => keep(entry, settings));
            if (next.length !== value.length) {
              node[key] = next;
              changed = true;
            }
          }
          node[key].forEach(walk);
        } else walk(value);
      }
    }
    walk(data);
    function listNode(entry) {
      return entry?.node?.__typename === "List"
        ? entry.node
        : entry?.__typename === "List"
          ? entry
          : entry?.item?.itemContent?.list_results?.result ||
            entry?.content?.itemContent?.list_results?.result;
    }
    function order(node) {
      if (!node || typeof node !== "object") return;
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          const slots = value.map((v, i) => (listNode(v) ? i : -1)).filter((i) => i >= 0);
          if (slots.length > 1) {
            const sorted = slots
              .map((i) => value[i])
              .sort((a, b) =>
                String(listNode(a).name || listNode(a).legacy?.name || "").localeCompare(
                  String(listNode(b).name || listNode(b).legacy?.name || ""),
                  "pt-BR",
                  { sensitivity: "base", numeric: true },
                ),
              );
            slots.forEach((slot, i) => {
              if (value[slot] !== sorted[i]) changed = true;
              value[slot] = sorted[i];
            });
          }
          value.forEach(order);
        } else order(value);
      }
    }
    order(data);
    return changed;
  }
  function transform(url, body, parsed) {
    if (!allowed.test(String(url))) return body;
    const settings = config(url);
    if (settings.route && settings.route !== page.location.pathname) return body;
    const scope =
      (settings.route || "") +
      (settings.query || "") +
      JSON.stringify([settings.reposts, settings.media, settings.limit]);
    if (scope !== acceptedScope) {
      acceptedScope = scope;
      accepted.clear();
    }
    const data = parsed || JSON.parse(body);
    const changed = filter(data, settings);
    doc.documentElement?.setAttribute("data-rodx-feed-network", "active");
    return changed ? JSON.stringify(data) : body;
  }

  // Parse at most once, inspect the unfiltered payload and transform before React reads it.
  function process(url, raw) {
    if (raw.length > runtimeLimits.maxFilterResponseCharacters) return raw;
    const payload = JSON.parse(raw);
    if (allowed.test(url)) {
      const items = [],
        stack = [payload];
      let visited = 0;
      while (stack.length && visited++ < runtimeLimits.maxTraversalNodes) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (node.rest_id && node.legacy) {
          const actual =
            node.legacy.retweeted_status_result?.result?.tweet ||
            node.legacy.retweeted_status_result?.result ||
            node;
          const media = (actual.legacy?.extended_entities?.media || [])
            .filter((m) => m.video_info)
            .map((m) => {
              const variants = (m.video_info.variants || [])
                .filter(
                  (v) => v.content_type === "video/mp4" && /^https:\/\/video\.twimg\.com\//.test(v.url || ""),
                )
                .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
              return {
                url: variants[0]?.url || "",
                poster: m.media_url_https || "",
              };
            });
          if (media.length)
            items.push({
              id: String(node.rest_id),
              media,
            });
        }
        for (const value of Object.values(node)) if (value && typeof value === "object") stack.push(value);
      }
      if (items.length)
        emit("media", {
          items: items.slice(0, runtimeLimits.maxCapturedMediaItems),
        });
    }
    if (
      relevant(url) &&
      (!/\/SearchTimeline(?:\?|$)/.test(url) || /list(?::|%3A)/i.test(decodeURIComponent(url)))
    )
      emit("response", {
        url,
        payload,
      });
    return allowed.test(url) ? transform(url, raw, payload) : raw;
  }
  // One MAIN-world interceptor owns the raw GraphQL inspector and feed transformation.
  // This observer never mutates requests, consumes original response streams or replays writes.
  let traceSequence = 0;
  const TRACE_LIMIT_BYTES = runtimeLimits.defaultTraceLimitBytes;
  function traceBodyLimit() {
    const configured = Number(doc.documentElement?.getAttribute("data-rodx-inspect-body-limit"));
    return Number.isFinite(configured) && configured >= runtimeLimits.minimumTraceLimitBytes
      ? Math.min(runtimeLimits.maximumTraceLimitBytes, configured)
      : TRACE_LIMIT_BYTES;
  }
  const graphqlRequest = (url) => {
    try {
      const target = new URL(String(url), location.href);
      return /^https?:$/.test(target.protocol) && /\/graphql(?:\/|$)/i.test(target.pathname);
    } catch {
      return false;
    }
  };
  const traceHeaders = (value) => {
    try {
      const result = {};
      new page.Headers(value || {}).forEach((v, k) => {
        result[k] = v;
      });
      return result;
    } catch {
      return {};
    }
  };
  const xhrResponseHeaders = (xhr) => {
    const result = {};
    try {
      for (const line of String(xhr.getAllResponseHeaders() || "").split(/\r?\n/)) {
        const i = line.indexOf(":");
        if (i > 0) result[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      }
    } catch {}
    return result;
  };
  function traceBegin(kind, url, method, requestHeaders, body, origin = "page") {
    if (!graphqlRequest(url) || doc.documentElement?.getAttribute("data-rodx-inspect-paused") === "true")
      return null;
    const id = ++traceSequence;
    const start = performance.now();
    const target = new URL(String(url), location.href);
    const segments = target.pathname.split("/").filter(Boolean);
    const graphqlAt = segments.findIndex((part) => part.toLowerCase() === "graphql");
    const queryId = graphqlAt >= 0 && segments.length > graphqlAt + 2 ? segments[graphqlAt + 1] : "";
    let operationName = target.searchParams.get("operationName") || (queryId ? segments[graphqlAt + 2] : "");
    let batchCount = 0;
    if (typeof body === "string" && body.length < runtimeLimits.maxRequestBodyCharacters) {
      try {
        const parsed = JSON.parse(body);
        const operations = Array.isArray(parsed) ? parsed : [parsed];
        batchCount = Array.isArray(parsed) ? parsed.length : 0;
        if (!operationName)
          operationName = operations
            .map((value) => String(value?.operationName || "").trim())
            .filter(Boolean)
            .join(", ");
      } catch {}
    }
    const content = traceClip(typeof body === "string" ? body : body == null ? "" : null);
    emit("inspect", {
      phase: "request",
      operationName,
      queryId,
      batchCount,
      id,
      kind,
      origin,
      url: String(new URL(String(url), location.href)),
      method: String(method || "GET").toUpperCase(),
      at: Date.now(),
      headers: traceHeaders(requestHeaders),
      requestBody: content.raw,
      requestRetained: content.retained,
      requestBytes: content.size,
      requestNote:
        body != null && typeof body !== "string"
          ? "Corpo não textual não foi lido"
          : !content.retained
            ? "Corpo excede limite da captura"
            : "",
    });
    return { id, start, url: String(url) };
  }
  function traceFinish(trace, details) {
    if (!trace) return;
    emit("inspect", {
      phase: "response",
      id: trace.id,
      durationMs: Math.round((performance.now() - trace.start) * 10) / 10,
      atEnd: Date.now(),
      ...details,
    });
  }
  function traceClip(raw, bytesLimit = traceBodyLimit()) {
    if (typeof raw !== "string") return { raw: "", retained: false, size: null };
    const bytes = new page.TextEncoder().encode(raw);
    if (bytes.byteLength <= bytesLimit) return { raw, retained: true, size: bytes.byteLength };
    const truncated = new page.TextDecoder().decode(bytes.subarray(0, bytesLimit));
    return { raw: truncated, retained: false, size: bytes.byteLength };
  }
  function traceFinishText(trace, response, raw, filtered = null, note = "") {
    const content = traceClip(raw);
    const modified = filtered !== null && filtered !== raw ? traceClip(filtered) : null;
    traceFinish(trace, {
      status: Number(response?.status) || 0,
      statusText: String(response?.statusText || ""),
      responseHeaders: traceHeaders(response?.headers),
      originalBody: content.raw,
      originalRetained: content.retained,
      originalBytes: content.size,
      filteredBody: modified?.raw ?? null,
      filteredRetained: modified?.retained ?? true,
      note: note || (!content.retained ? "Resposta excede limite da captura" : ""),
    });
  }
  async function traceReadStream(stream) {
    if (!stream) return { raw: "", retained: true, size: 0, note: "" };
    const reader = stream.getReader();
    const chunks = [];
    const limit = traceBodyLimit();
    let total = 0,
      truncated = false,
      timedOut = false,
      timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timeout: true }), runtimeLimits.bodyReadTimeoutMs);
    });
    try {
      for (;;) {
        const part = await Promise.race([reader.read(), deadline]);
        if (part.timeout) {
          timedOut = truncated = true;
          break;
        }
        if (part.done) break;
        const remaining = limit - total;
        if (part.value.byteLength > remaining) {
          if (remaining) chunks.push(part.value.subarray(0, remaining));
          total = limit;
          truncated = true;
          break;
        }
        chunks.push(part.value);
        total += part.value.byteLength;
      }
    } finally {
      clearTimeout(timer);
      if (truncated) void reader.cancel().catch(() => {});
      else reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      raw: new page.TextDecoder().decode(bytes),
      retained: !truncated,
      size: truncated ? null : total,
      note: timedOut
        ? "Captura parcial após 10 segundos; stream original preservado"
        : truncated
          ? "Corpo excede limite configurado; tamanho total desconhecido"
          : "",
    };
  }
  async function tracePassiveResponse(trace, response) {
    if (!trace) return;
    const type = response.headers.get("content-type") || "";
    if (/event-stream|octet-stream|video|audio/i.test(type) || !response.body) {
      traceFinishText(
        trace,
        response,
        null,
        null,
        "Stream contínuo ou corpo não textual preservado sem leitura",
      );
      return;
    }
    try {
      const clone = response.clone();
      const content = await traceReadStream(clone.body);
      traceFinish(trace, {
        status: response.status,
        statusText: response.statusText,
        responseHeaders: traceHeaders(response.headers),
        originalBody: content.raw,
        originalRetained: content.retained,
        originalBytes: content.size,
        note: content.note,
      });
    } catch (error) {
      traceFinishText(trace, response, null, null, "Captura passiva falhou: " + String(error?.message));
    }
  }
  function traceError(trace, error) {
    traceFinish(trace, {
      status: 0,
      error: String(error?.message || error || "Falha de rede"),
      aborted: error?.name === "AbortError",
      originalRetained: false,
      note: "Não houve resposta HTTP acessível",
    });
  }

  const originalFetch = page.fetch;
  page.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url || String(input);
    try {
      const u = new URL(url, location.href);
      if (u.origin === location.origin && u.pathname.startsWith("/i/api/")) {
        capture(input?.headers, init?.headers);
        if (relevant(url))
          emit("request", {
            url,
            method: init?.method || input?.method || "GET",
            body: typeof init?.body === "string" ? init.body : "",
          });
      }
    } catch {}
    const method = init?.method || input?.method || "GET";
    const inputHeaders = traceHeaders(input?.headers);
    const initHeaders = traceHeaders(init?.headers);
    const trace = traceBegin("fetch", url, method, { ...inputHeaders, ...initHeaders }, init?.body, "page");
    let requestCopy;
    if (trace && init?.body == null && input instanceof page.Request && !/^(GET|HEAD)$/i.test(method)) {
      try {
        requestCopy = input.clone();
      } catch {}
    }
    if (requestCopy)
      void (async () => {
        try {
          const content = await traceReadStream(requestCopy.body);
          emit("inspect", {
            phase: "request-body",
            id: trace.id,
            requestBody: content.raw,
            requestRetained: content.retained,
            requestBytes: content.size,
            requestNote: content.note,
          });
          if (relevant(url)) emit("request", { url, method, body: content.raw });
        } catch {}
      })();
    let result;
    try {
      result = Reflect.apply(originalFetch, this, arguments);
    } catch (error) {
      traceError(trace, error);
      throw error;
    }
    if (!allowed.test(url) && !relevant(url)) {
      if (trace)
        result
          .then(
            (response) => void tracePassiveResponse(trace, response),
            (error) => traceError(trace, error),
          )
          .catch(() => {});
      return result;
    }
    const requestRoute = location.pathname + location.search;
    return Promise.resolve(result).then(
      async (response) => {
        if (!response.ok) {
          if (trace) void tracePassiveResponse(trace, response);
          return response;
        }
        try {
          const contentType = response.headers.get("content-type") || "";
          if (/event-stream|multipart/i.test(contentType)) {
            if (trace) void tracePassiveResponse(trace, response);
            return response;
          }
          const raw = await response.clone().text();
          // An old in-flight request cannot inherit a new route's filter/limit.
          const body = requestRoute === location.pathname + location.search ? process(url, raw) : raw;
          traceFinishText(trace, response, raw, body);
          if (body === raw) return response;
          const h = new page.Headers(response.headers);
          h.delete("content-length");
          h.delete("content-encoding");
          const next = new page.Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: h,
          });
          for (const key of ["url", "redirected", "type"])
            try {
              Object.defineProperty(next, key, {
                value: response[key],
              });
            } catch {}
          return next;
        } catch (error) {
          if (trace)
            traceFinishText(
              trace,
              response,
              null,
              null,
              "Falha ao ler o clone: " + String(error?.message || error),
            );
          return response;
        }
      },
      (error) => {
        traceError(trace, error);
        throw error;
      },
    );
  };
  const proto = page.XMLHttpRequest?.prototype;
  if (proto) {
    const open = proto.open,
      set = proto.setRequestHeader,
      send = proto.send,
      meta = new WeakMap();
    proto.open = function (method, url, ...rest) {
      // Reused XHR instances must not retain a response override or old listeners.
      const old = meta.get(this);
      if (old?.listener) this.removeEventListener("readystatechange", old.listener);
      if (old?.traceListener) this.removeEventListener("loadend", old.traceListener);
      if (old?.abortListener) this.removeEventListener("abort", old.abortListener);
      if (old?.errorListener) this.removeEventListener("error", old.errorListener);
      try {
        delete this.response;
        delete this.responseText;
      } catch {}
      const m = {
        method,
        url: String(url),
        headers: {},
        route: location.pathname + location.search,
      };
      meta.set(this, m);
      const result = Reflect.apply(open, this, [method, url, ...rest]);
      m.listener = () => {
        if (
          this.readyState !== 4 ||
          this.status < runtimeLimits.successStatusMinimum ||
          this.status >= runtimeLimits.successStatusExclusiveMaximum ||
          m.route !== location.pathname + location.search ||
          (!allowed.test(m.url) && !relevant(m.url))
        )
          return;
        try {
          const json = this.responseType === "json";
          if (!json && this.responseType && this.responseType !== "text") return;
          const raw = json ? JSON.stringify(this.response) : this.responseText,
            body = process(m.url, raw);
          m.traceOriginal = raw;
          m.traceFiltered = body;
          if (body !== raw) {
            Object.defineProperty(this, "response", {
              configurable: true,
              value: json ? JSON.parse(body) : body,
            });
            if (!json)
              Object.defineProperty(this, "responseText", {
                configurable: true,
                value: body,
              });
          }
        } catch {}
      };
      this.addEventListener("readystatechange", m.listener);
      m.traceListener = () => {
        const trace = m.trace;
        if (!trace || m.traceFinished) return;
        m.traceFinished = true;
        let raw = m.traceOriginal;
        if (raw == null) {
          try {
            raw =
              this.responseType === "json"
                ? JSON.stringify(this.response)
                : !this.responseType || this.responseType === "text"
                  ? this.responseText
                  : null;
          } catch {}
        }
        const original = traceClip(raw);
        const filtered = m.traceFiltered !== raw ? traceClip(m.traceFiltered) : null;
        traceFinish(trace, {
          status: Number(this.status || 0),
          statusText: String(this.statusText || ""),
          responseHeaders: xhrResponseHeaders(this),
          originalBody: original.raw,
          originalRetained: original.retained,
          originalBytes: original.size,
          filteredBody: filtered?.raw ?? null,
          filteredRetained: filtered?.retained ?? true,
          aborted: m.aborted || false,
          error: m.error || "",
          note: !original.retained ? "Resposta não textual ou excede limite" : "",
        });
      };
      this.addEventListener("loadend", m.traceListener, { once: true });
      m.abortListener = () => {
        m.aborted = true;
      };
      m.errorListener = () => {
        m.error = "Falha XHR";
      };
      this.addEventListener("abort", m.abortListener, { once: true });
      this.addEventListener("error", m.errorListener, { once: true });
      return result;
    };
    proto.setRequestHeader = function (k, v) {
      const m = meta.get(this);
      if (m) {
        const key = Object.keys(m.headers).find((key) => key.toLowerCase() === String(k).toLowerCase()) || k;
        m.headers[key] = m.headers[key] ? m.headers[key] + ", " + String(v) : String(v);
      }
      return Reflect.apply(set, this, arguments);
    };
    proto.send = function (body) {
      const m = meta.get(this);
      if (m) {
        capture(m.headers);
        m.trace = traceBegin("xhr", m.url, m.method, m.headers, body, "page");
        if (relevant(m.url))
          emit("request", {
            url: m.url,
            method: m.method,
            body: typeof body === "string" ? body : "",
          });
      }
      return Reflect.apply(send, this, arguments);
    };
  }
  const controllers = new Map();
  document.addEventListener(PREFIX + ":cancel", (event) => {
    try {
      controllers.get(JSON.parse(event.detail).id)?.abort();
    } catch {}
  });
  document.addEventListener(PREFIX + ":call", async (event) => {
    let call;
    try {
      call = JSON.parse(event.detail || "");
    } catch {
      return;
    }
    if (!call || typeof call.id !== "number" || !call.path) return;
    let scriptTrace = null;
    try {
      const url = new URL(call.path, location.origin);
      if (url.origin !== location.origin || !url.pathname.startsWith("/i/api/")) throw Error("URL inválida");
      const method = String(call.method || "GET").toUpperCase();
      if (!["GET", "POST"].includes(method)) throw Error("Método não permitido");
      if (call.params)
        for (const [k, v] of Object.entries(call.params)) {
          if (v !== null && v !== undefined)
            url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        }
      if (!sessionReady || !headers.get("authorization"))
        throw Error("O X ainda não enviou uma requisição autenticada nesta sessão.");
      const reqHeaders = new Headers(headers);
      const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1] || "");
      if (csrf) reqHeaders.set("x-csrf-token", csrf);
      reqHeaders.set("accept", "*/*");
      if (call.form) reqHeaders.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
      else if (method === "POST") reqHeaders.set("content-type", "application/json");
      let body;
      if (call.form) body = new URLSearchParams(call.form).toString();
      else if (call.payload !== undefined && call.payload !== null) body = JSON.stringify(call.payload);
      const controller = new AbortController();
      if (method === "GET") controllers.set(call.id, controller);
      scriptTrace = traceBegin("fetch", url.toString(), method, reqHeaders, body, "script");
      const r = await nativeFetch(url.toString(), {
        method,
        signal: controller.signal,
        headers: reqHeaders,
        credentials: "same-origin",
        mode: "same-origin",
        body,
      });
      const raw = await r.text();
      if (scriptTrace) traceFinishText(scriptTrace, r, raw);
      let data = null;
      if (raw.length < runtimeLimits.maxResponsePreviewCharacters) {
        try {
          data = JSON.parse(raw);
        } catch {}
      }
      const result = {
        id: call.id,
        status: r.status,
        data,
        retryAfter: r.headers.get("retry-after") || "",
        remaining: r.headers.get("x-rate-limit-remaining"),
        reset: r.headers.get("x-rate-limit-reset"),
      };
      emit("result", result);
    } catch (error) {
      if (scriptTrace) traceError(scriptTrace, error);
      emit("result", {
        id: call.id,
        status: 0,
        error: String(error?.message || error),
      });
    } finally {
      controllers.delete(call.id);
    }
  });
  let navIndex = Number(page.history.state?.rodxNavIndex) || 0;
  const push = page.history.pushState,
    replace = page.history.replaceState;
  const announceRoute = () => {
    doc.documentElement?.setAttribute("data-rodx-nav-index", String(navIndex));
    doc.dispatchEvent(new page.CustomEvent("rodx:route"));
  };
  page.history.pushState = function (value, title, url) {
    doc.dispatchEvent(
      new page.CustomEvent("rodx:before-route", {
        detail: JSON.stringify({
          from: location.pathname + location.search,
        }),
      }),
    );
    const next = navIndex + 1;
    const result = Reflect.apply(push, this, [
      {
        ...value,
        rodxNavIndex: next,
      },
      title,
      url,
    ]);
    navIndex = next;
    announceRoute();
    return result;
  };
  page.history.replaceState = function (value, title, url) {
    const result = Reflect.apply(replace, this, [
      {
        ...value,
        rodxNavIndex: navIndex,
      },
      title,
      url,
    ]);
    announceRoute();
    return result;
  };
  page.addEventListener("popstate", () => {
    navIndex = Number(page.history.state?.rodxNavIndex) || 0;
    announceRoute();
  });
  function announce() {
    doc.documentElement?.setAttribute("data-rodx-feed-hook", "ready");
    announceRoute();
    emit("status", {
      ready: true,
      authReady: sessionReady,
    });
  }
  page.__rodxStudioNetworkV3 = {
    announce,
  };
  announce();
  doc.addEventListener("DOMContentLoaded", announce, {
    once: true,
  });
}
