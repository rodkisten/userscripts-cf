// ==UserScript==
// @name         RodX · Diagnóstico do carregador
// @namespace    https://rod.migos.club/rodx-diagnostic
// @version      1.2.0
// @description  Testes isolados de GM, módulos, contexto de página e captura inicial.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      rod.migos.club
// @connect      code.migos.club
// ==/UserScript==

(() => {
  "use strict";
  if (window.__rodxLoaderDiagnostic) return;
  window.__rodxLoaderDiagnostic = true;
  const started = performance.now();
  const channel = "rodx-probe-" + crypto.randomUUID();
  const rows = new Map();
  const environment = {
    handler:
      typeof GM_info !== "undefined" ? GM_info.scriptHandler : "indisponível",
    handlerVersion: typeof GM_info !== "undefined" ? GM_info.version : "",
    readyState: document.readyState,
    bootstrapMs: Math.round(started),
    userAgent: navigator.userAgent,
    note: "Captura somente desde a execução deste diagnóstico; não prova início anterior ao X.",
  };
  let shadow,
    activeModule,
    running = false;
  const temporaryKey = "rodx-loader-probe:" + channel;
  const mark = (name, status, detail) => {
    rows.set(name, {
      status,
      detail,
      atMs: Math.round(performance.now() - started),
    });
    render();
  };
  function render() {
    if (!shadow) return;
    const list = shadow.querySelector("ul");
    list.replaceChildren();
    for (const [name, result] of rows) {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = result.status + " · " + name;
      const p = document.createElement("p");
      p.textContent = result.detail;
      li.append(strong, p);
      list.append(li);
    }
  }
  const captures = new Map();
  let captureTimer;
  const secretKey =
    /authorization|cookie|csrf|token|password|secret|api[-_]?key|session|ct0|twid/i;
  function scrub(value, depth = 0) {
    if (depth > 50) return "[Limite de profundidade da visualização]";
    if (Array.isArray(value))
      return value.map((item) => scrub(item, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          secretKey.test(key) ? "[OCULTO]" : scrub(item, depth + 1),
        ]),
      );
    if (typeof value === "string")
      return value.replace(/Bearer\s+[\w.\-~+/=]+/gi, "Bearer [OCULTO]");
    return value;
  }
  function safeText(value) {
    if (!value) return "";
    try {
      return JSON.stringify(scrub(JSON.parse(value)), null, 2);
    } catch {
      return String(value)
        .replace(/Bearer\s+[\w.\-~+/=]+/gi, "Bearer [OCULTO]")
        .replace(
          /((?:token|secret|password|authorization|cookie|csrf|api[-_]?key)["'\s:=]+)[^\s,"'};&]+/gi,
          "$1[OCULTO]",
        );
    }
  }
  document.addEventListener(channel + ":capture", (event) => {
    try {
      const data = JSON.parse(event.detail);
      if (!captures.has(data.id) && data.phase !== "request") return;
      const before = captures.get(data.id) || {};
      captures.set(data.id, {
        ...before,
        ...data,
        revision: (before.revision || 0) + 1,
      });
      let size = 0;
      const clock = Date.now();
      for (const [id, record] of [...captures].reverse()) {
        size += JSON.stringify(record).length * 2;
        if (clock - record.startedAt > 600000 || size > 6000000)
          captures.delete(id);
      }
      while (captures.size > 12) captures.delete(captures.keys().next().value);
      const entries = [...captures.values()];
      const complete = entries.filter((record) =>
        ["complete", "empty"].includes(record.responseBody?.state),
      );
      const requestCount = entries.filter(
        (record) => record.requestBody?.state === "complete",
      ).length;
      const variablesCount = entries.filter((record) => {
        try {
          return new URL(record.url, location.href).searchParams.has(
            "variables",
          );
        } catch {
          return false;
        }
      }).length;
      mark(
        "Bodies GraphQL reais",
        complete.length ? "OK" : "AGUARDANDO",
        `${entries.length} chamadas retidas; ${requestCount} requests com corpo; ${variablesCount} com variables na URL; ` +
          `${complete.length} responses completos/vazios; ${entries.filter((record) => record.responseBody?.state === "partial").length} parciais; ` +
          `${entries.filter((record) => ["error", "unavailable"].includes(record.responseBody?.state)).length} erros/indisponíveis. Dados completos somente no painel local.`,
      );
      if (!captureTimer)
        captureTimer = setTimeout(() => {
          captureTimer = 0;
          renderCaptures();
        }, 120);
    } catch {
      /* evento inválido */
    }
  });
  function jsonTree(parent, value, label = "root") {
    if (!value || typeof value !== "object") {
      const line = document.createElement("div");
      line.textContent = label + ": " + JSON.stringify(value);
      parent.append(line);
      return;
    }
    const details = document.createElement("details"),
      summary = document.createElement("summary");
    summary.textContent = `${label} ${Array.isArray(value) ? "[" + value.length + "]" : "{" + Object.keys(value).length + "}"}`;
    details.append(summary);
    let loaded = false;
    details.ontoggle = () => {
      if (!details.open || loaded) return;
      loaded = true;
      const entries = Object.entries(value);
      let offset = 0;
      const more = document.createElement("button");
      more.textContent = "Mostrar mais";
      const page = () => {
        more.remove();
        for (const [key, item] of entries.slice(offset, offset + 70))
          jsonTree(details, item, key);
        offset += 70;
        if (offset < entries.length) details.append(more);
      };
      more.onclick = page;
      page();
    };
    parent.append(details);
  }
  function viewJSON(parent, raw) {
    const text =
      typeof raw === "string"
        ? safeText(raw)
        : JSON.stringify(scrub(raw), null, 2);
    try {
      jsonTree(parent, JSON.parse(text));
    } catch {
      const pre = document.createElement("pre");
      pre.textContent = text || "(vazio)";
      parent.append(pre);
    }
  }
  function renderCaptures() {
    const list = shadow?.querySelector("[data-network]");
    if (!list) return;
    const open = new Set(
      [...list.children].filter((el) => el.open).map((el) => el.dataset.id),
    );
    list.replaceChildren();
    if (!captures.size) {
      list.textContent =
        "Aguardando chamadas GraphQL após a instalação. Navegue no X.";
      return;
    }
    for (const record of [...captures.values()].reverse()) {
      const item = document.createElement("details"),
        title = document.createElement("summary");
      item.dataset.id = String(record.id);
      item.open = open.has(String(record.id));
      let url;
      try {
        url = new URL(record.url, location.href);
      } catch {
        continue;
      }
      title.textContent = `${record.method} · ${record.kind} · ${record.status ?? "…"} · ${url.pathname.split("/").pop() || "GraphQL"}`;
      item.append(title);
      let rendered = false;
      const fill = () => {
        if (!item.open || rendered) return;
        rendered = true;
        const meta = document.createElement("p");
        meta.textContent = `${url.origin}${url.pathname} · ${record.durationMs ?? "?"} ms · ${record.pending ? "em andamento" : "concluída"}`;
        item.append(meta);
        const sections = [
          [
            "URL e variáveis",
            Object.fromEntries(
              [...url.searchParams].map(([key, value]) => {
                try {
                  return [key, JSON.parse(value)];
                } catch {
                  return [key, value];
                }
              }),
            ),
          ],
          [
            "Headers enviados — disponíveis à página",
            record.requestHeaders || {},
          ],
          [
            "Request body · " + (record.requestBody?.state || "pending"),
            record.requestBody?.text || "",
          ],
          [
            "Headers recebidos — disponíveis à página",
            record.responseHeaders || {},
          ],
          [
            "Response body · " + (record.responseBody?.state || "pending"),
            record.responseBody?.text || "",
          ],
        ];
        for (const [label, value] of sections) {
          const section = document.createElement("details"),
            summary = document.createElement("summary");
          summary.textContent = label;
          section.append(summary);
          let made = false;
          section.ontoggle = () => {
            if (section.open && !made) {
              made = true;
              viewJSON(section, value);
            }
          };
          item.append(section);
        }
        const note = document.createElement("p");
        note.textContent = [
          record.requestBody?.note,
          record.responseBody?.note,
          record.error,
          record.method === "GET" && record.requestBody?.state === "empty"
            ? "GET sem body é esperado; confira variables na URL."
            : "",
          "Headers restritos pelo navegador não são recuperáveis. Campos sensíveis são mascarados na visualização.",
        ]
          .filter(Boolean)
          .join(" ");
        item.append(note);
      };
      item.ontoggle = fill;
      list.append(item);
      fill();
    }
  }

  function pageProbe(name) {
    const doc = document,
      original = window.fetch;
    const proto = window.XMLHttpRequest?.prototype;
    const open = proto?.open,
      send = proto?.send,
      setHeader = proto?.setRequestHeader;
    const meta = new WeakMap();
    let serial = 0,
      fetchCount = 0,
      xhrCount = 0,
      stopped = false;
    const LIMIT = 1048576;
    const emit = (type, data) => {
      if (!stopped)
        doc.dispatchEvent(
          new CustomEvent(name + ":" + type, { detail: JSON.stringify(data) }),
        );
    };
    const report = () =>
      doc.dispatchEvent(
        new CustomEvent(name + ":result", {
          detail: JSON.stringify({
            page: true,
            fetchCount,
            xhrCount,
            restored: stopped,
          }),
        }),
      );
    const isGraphQL = (url) => /\/graphql(?:\/|\?|$)/i.test(String(url));
    const headersOf = (value) => {
      try {
        return Object.fromEntries(new Headers(value || {}).entries());
      } catch {
        return {};
      }
    };
    const textBody = (raw) => {
      if (raw == null || raw === "")
        return { state: "empty", text: "", bytes: 0 };
      if (raw instanceof URLSearchParams) raw = raw.toString();
      if (typeof raw !== "string")
        return {
          state: "unavailable",
          text: "",
          note: "Corpo não textual não lido.",
        };
      const bytes = new TextEncoder().encode(raw);
      return {
        state: bytes.length > LIMIT ? "partial" : "complete",
        bytes: bytes.length,
        text: new TextDecoder().decode(bytes.subarray(0, LIMIT)),
        note:
          bytes.length > LIMIT
            ? "Captura limitada a 1 MiB; original preservado."
            : "",
      };
    };
    async function read(stream) {
      if (!stream) return textBody("");
      const reader = stream.getReader();
      const chunks = [];
      let total = 0,
        incomplete = false,
        timedOut = false,
        timer;
      const deadline = new Promise((resolve) => {
        timer = setTimeout(() => resolve({ timeout: true }), 8000);
      });
      try {
        for (;;) {
          const part = await Promise.race([reader.read(), deadline]);
          if (part.timeout) {
            incomplete = timedOut = true;
            break;
          }
          if (part.done) break;
          if (total + part.value.byteLength > LIMIT) {
            chunks.push(part.value.subarray(0, LIMIT - total));
            total = LIMIT;
            incomplete = true;
            break;
          }
          chunks.push(part.value);
          total += part.value.byteLength;
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const part of chunks) {
          bytes.set(part, offset);
          offset += part.byteLength;
        }
        return {
          state: incomplete ? "partial" : total ? "complete" : "empty",
          text: new TextDecoder().decode(bytes),
          bytes: incomplete ? null : total,
          note: timedOut
            ? "Captura parcial: timeout de 8s."
            : incomplete
              ? "Captura limitada a 1 MiB."
              : "",
        };
      } catch (error) {
        return {
          state: "error",
          text: "",
          note: String(error.message || error),
        };
      } finally {
        clearTimeout(timer);
        if (incomplete) void reader.cancel().catch(() => {});
        else reader.releaseLock();
      }
    }
    const start = (kind, url, method, requestHeaders, requestBody) => {
      const id = ++serial;
      emit("capture", {
        id,
        phase: "request",
        kind,
        url: String(url),
        method: String(method).toUpperCase(),
        startedAt: Date.now(),
        requestHeaders,
        requestBody,
        pending: true,
      });
      return id;
    };
    const wrapper = function (...args) {
      const [input, init] = args;
      const url =
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input?.url || "";
      if (!isGraphQL(url) || stopped)
        return Reflect.apply(original, this, args);
      fetchCount++;
      report();
      const method = init?.method || input?.method || "GET";
      let requestClone;
      const requestObjectBody =
        input instanceof Request &&
        init?.body == null &&
        !/^(GET|HEAD)$/i.test(method);
      if (
        input instanceof Request &&
        init?.body == null &&
        !/^(GET|HEAD)$/i.test(method)
      ) {
        try {
          requestClone = input.clone();
        } catch {
          /* used/locked */
        }
      }
      const requestBody = requestClone
        ? { state: "pending", text: "" }
        : requestObjectBody
          ? {
              state: "unavailable",
              text: "",
              note: "Request.body usado ou bloqueado: clone indisponível.",
            }
          : textBody(init?.body);
      const id = start(
        "fetch",
        url,
        method,
        headersOf(init?.headers ?? input?.headers),
        requestBody,
      );
      if (requestClone)
        void read(requestClone.body).then((body) =>
          emit("capture", { id, phase: "request-body", requestBody: body }),
        );
      const begin = performance.now();
      let promise;
      try {
        promise = Reflect.apply(original, this, args);
      } catch (error) {
        emit("capture", {
          id,
          pending: false,
          status: 0,
          error: String(error),
          responseBody: { state: "error", text: "" },
        });
        throw error;
      }
      void promise
        .then(
          (response) => {
            // Clone synchronously before any await/caller consumes the original stream.
            let clone, cloneError;
            const type = response.headers.get("content-type") || "";
            if (!/text\/event-stream|video\/|audio\//i.test(type)) {
              try {
                clone = response.clone();
              } catch (error) {
                cloneError = error;
              }
            }
            emit("capture", {
              id,
              phase: "headers",
              status: response.status,
              responseHeaders: headersOf(response.headers),
              durationMs: Math.round(performance.now() - begin),
              type,
            });
            if (!clone) {
              emit("capture", {
                id,
                phase: "response",
                pending: false,
                responseBody: {
                  state: "unavailable",
                  text: "",
                  note: cloneError
                    ? String(cloneError)
                    : "Stream contínuo/não textual não capturado.",
                },
              });
              return;
            }
            void read(clone.body).then((body) =>
              emit("capture", {
                id,
                phase: "response",
                pending: false,
                responseBody: body,
              }),
            );
          },
          (error) =>
            emit("capture", {
              id,
              phase: "response",
              pending: false,
              status: 0,
              error: String(error.message || error),
              aborted: error.name === "AbortError",
              responseBody: { state: "error", text: "" },
            }),
        )
        .catch(() => {});
      return promise;
    };
    const openWrapper = function (method, url, ...rest) {
      const old = meta.get(this);
      if (old?.cleanup) old.cleanup();
      const result = Reflect.apply(open, this, [method, url, ...rest]);
      meta.set(this, { method, url: String(url), headers: {} });
      return result;
    };
    const setWrapper = function (key, value) {
      const result = Reflect.apply(setHeader, this, arguments),
        info = meta.get(this);
      if (info) {
        key = String(key).toLowerCase();
        info.headers[key] = info.headers[key]
          ? info.headers[key] + ", " + value
          : String(value);
      }
      return result;
    };
    const sendWrapper = function (...args) {
      const info = meta.get(this);
      if (!info || !isGraphQL(info.url) || stopped)
        return Reflect.apply(send, this, args);
      xhrCount++;
      report();
      const id = start(
          "xhr",
          info.url,
          info.method,
          info.headers,
          textBody(args[0]),
        ),
        begin = performance.now();
      const fail = (event) => {
        info.error = event.type;
      };
      const finish = () => {
        info.cleanup();
        let body;
        try {
          if (this.responseType === "" || this.responseType === "text")
            body = textBody(this.responseText);
          else if (this.responseType === "json")
            body = textBody(JSON.stringify(this.response));
          else
            body = {
              state: "unavailable",
              text: "",
              note: "responseType: " + this.responseType,
            };
        } catch (error) {
          body = { state: "error", text: "", note: String(error) };
        }
        if (info.error) body = { ...body, state: "error", note: info.error };
        const headers = {};
        try {
          for (const line of this.getAllResponseHeaders()
            .trim()
            .split(/\r?\n/)) {
            const colon = line.indexOf(":");
            if (colon > 0)
              headers[line.slice(0, colon).toLowerCase()] = line
                .slice(colon + 1)
                .trim();
          }
        } catch {
          /* UA headers not exposed */
        }
        emit("capture", {
          id,
          phase: "response",
          pending: false,
          responseBody: body,
          responseHeaders: headers,
          status: this.status,
          durationMs: Math.round(performance.now() - begin),
          error: info.error || "",
        });
      };
      info.cleanup = () => {
        this.removeEventListener("loadend", finish);
        for (const type of ["abort", "error", "timeout"])
          this.removeEventListener(type, fail);
      };
      this.addEventListener("loadend", finish, { once: true });
      for (const type of ["abort", "error", "timeout"])
        this.addEventListener(type, fail, { once: true });
      try {
        return Reflect.apply(send, this, args);
      } catch (error) {
        info.cleanup();
        emit("capture", {
          id,
          pending: false,
          error: String(error),
          responseBody: { state: "error", text: "" },
        });
        throw error;
      }
    };
    window.fetch = wrapper;
    if (proto) {
      proto.open = openWrapper;
      proto.send = sendWrapper;
      proto.setRequestHeader = setWrapper;
    }
    const command = (event) => {
      if (event.detail !== "stop") {
        report();
        return;
      }
      if (window.fetch === wrapper) window.fetch = original;
      if (proto?.open === openWrapper) proto.open = open;
      if (proto?.send === sendWrapper) proto.send = send;
      if (proto?.setRequestHeader === setWrapper)
        proto.setRequestHeader = setHeader;
      stopped = true;
      doc.removeEventListener(name + ":command", command);
      report();
    };
    doc.addEventListener(name + ":command", command);
    report();
  }

  document.addEventListener(channel + ":result", (event) => {
    try {
      const data = JSON.parse(event.detail);
      environment.firstBridgeMs ??= Math.round(performance.now() - started);
      if (!rows.has("Ponte com a página") || data.restored)
        mark(
          "Ponte com a página",
          "OK",
          data.restored
            ? "Observação encerrada."
            : "Código executado no contexto da página.",
        );
      mark(
        "GraphQL real observado",
        data.fetchCount + data.xhrCount ? "OK" : "AGUARDANDO",
        `fetch: ${data.fetchCount}; XHR: ${data.xhrCount}. Bodies e headers disponíveis no painel local; o relatório contém somente contagens.`,
      );
    } catch {
      /* evento inválido */
    }
  });
  function installPageProbe() {
    const root = document.documentElement;
    if (!root) return false;
    const script = document.createElement("script");
    const nonce = document.querySelector("script[nonce]")?.nonce;
    if (nonce) script.nonce = nonce;
    script.textContent =
      "(" + pageProbe.toString() + ")(" + JSON.stringify(channel) + ");";
    root.append(script);
    script.remove();
    return true;
  }
  if (!installPageProbe()) {
    const observer = new MutationObserver(() => {
      if (installPageProbe()) observer.disconnect();
    });
    observer.observe(document, { subtree: true, childList: true });
  }
  setTimeout(() => {
    if (!rows.has("Ponte com a página"))
      mark(
        "Ponte com a página",
        "FALHOU",
        "Sem handshake. Pode haver bloqueio de CSP/contexto; não houve tentativa de contorná-lo.",
      );
  }, 1800);
  async function test(name, fn) {
    try {
      mark(name, "OK", await fn());
    } catch (error) {
      mark(name, "FALHOU", String(error.message || error));
    }
  }
  function request(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: 15000,
        nocache: true,
        headers: { "Cache-Control": "no-cache" },
        onload: (r) =>
          r.status >= 200 && r.status < 300
            ? resolve(r)
            : reject(Error("HTTP " + r.status)),
        onerror: () =>
          reject(Error("Request GM falhou: confira domínio/permissões.")),
        ontimeout: () => reject(Error("Timeout de 15 segundos.")),
      });
    });
  }
  async function load(code) {
    const url = URL.createObjectURL(
      new Blob([code], { type: "text/javascript" }),
    );
    let timeout;
    try {
      return await Promise.race([
        import(url),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(Error("Import expirou após 8 segundos.")),
            8000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
    }
  }
  // Classic script injection: no import(), Blob, eval or Function constructor.
  function moduleRuntime(name, id, registerBody) {
    let module,
      initialized = false;
    const pending = new Map();
    let serial = 0;
    const emit = (type, data) =>
      document.dispatchEvent(
        new CustomEvent(name + ":" + type, {
          detail: JSON.stringify({ ...data, moduleId: id }),
        }),
      );
    const rpc = (op, value) =>
      new Promise((resolve, reject) => {
        const callId = id + ":" + ++serial;
        const timer = setTimeout(() => {
          pending.delete(callId);
          reject(Error("Timeout GM RPC"));
        }, 5000);
        pending.set(callId, { resolve, reject, timer });
        emit("gm-call", { callId, op, value });
      });
    const reply = (event) => {
      let result;
      try {
        result = JSON.parse(event.detail);
      } catch {
        return;
      }
      if (result.moduleId !== id) return;
      const task = pending.get(result.callId);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(result.callId);
      if (result.error) task.reject(Error(result.error));
      else task.resolve(result.value);
    };
    const dispose = () => {
      document.removeEventListener(name + ":module-call", command);
      document.removeEventListener(name + ":gm-result", reply);
      for (const task of pending.values()) {
        clearTimeout(task.timer);
        task.reject(Error("Módulo encerrado"));
      }
      pending.clear();
    };
    const command = async (event) => {
      let call;
      try {
        call = JSON.parse(event.detail);
      } catch {
        return;
      }
      if (call.moduleId !== id) return;
      try {
        let value;
        if (call.op === "init") {
          if (initialized) throw Error("Inicialização duplicada");
          initialized = true;
          value = await module.init(
            Object.freeze({
              ping: () => "core-ok",
              set: (value) => rpc("set", value),
              get: () => rpc("get"),
            }),
          );
        } else if (call.op === "dispose") {
          try {
            value = await module.dispose();
          } finally {
            dispose();
          }
        } else throw Error("Operação inválida");
        emit("module-result", { callId: call.callId, value });
      } catch (error) {
        emit("module-result", {
          callId: call.callId,
          error: String(error.message || error),
        });
      }
    };
    try {
      registerBody((candidate) => {
        if (module) throw Error("Registro duplicado");
        module = candidate;
      });
      if (
        !module ||
        typeof module.version !== "string" ||
        typeof module.init !== "function" ||
        typeof module.dispose !== "function"
      )
        throw Error("Esperado register({version, init, dispose})");
      document.addEventListener(name + ":gm-result", reply);
      document.addEventListener(name + ":module-call", command);
      emit("module-ready", { version: module.version });
    } catch (error) {
      dispose();
      emit("module-ready", { error: String(error.message || error) });
    }
  }
  const iifeCalls = new Map();
  document.addEventListener(channel + ":gm-call", async (event) => {
    let call;
    try {
      call = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (!String(call.moduleId || "").startsWith(channel)) return;
    const result = { moduleId: call.moduleId, callId: call.callId };
    try {
      if (call.op === "set") {
        await GM_setValue(temporaryKey, String(call.value).slice(0, 100));
        result.value = true;
      } else if (call.op === "get")
        result.value = await GM_getValue(temporaryKey);
      else throw Error("Operação GM não permitida");
    } catch (error) {
      result.error = String(error.message || error);
    }
    document.dispatchEvent(
      new CustomEvent(channel + ":gm-result", {
        detail: JSON.stringify(result),
      }),
    );
  });
  document.addEventListener(channel + ":module-result", (event) => {
    let result;
    try {
      result = JSON.parse(event.detail);
    } catch {
      return;
    }
    const task = iifeCalls.get(result.callId);
    if (!task) return;
    clearTimeout(task.timer);
    iifeCalls.delete(result.callId);
    if (result.error) task.reject(Error(result.error));
    else task.resolve(result.value);
  });
  function loadIIFE(code) {
    const id = channel + ":" + crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener(channel + ":module-ready", ready);
      };
      const call = (op) =>
        new Promise((resolve, reject) => {
          const callId = crypto.randomUUID();
          const timer = setTimeout(() => {
            iifeCalls.delete(callId);
            reject(Error("Timeout do módulo: " + op));
          }, 7000);
          iifeCalls.set(callId, { resolve, reject, timer });
          document.dispatchEvent(
            new CustomEvent(channel + ":module-call", {
              detail: JSON.stringify({ moduleId: id, callId, op }),
            }),
          );
        });
      const ready = (event) => {
        let result;
        try {
          result = JSON.parse(event.detail);
        } catch {
          return;
        }
        if (result.moduleId !== id) return;
        cleanup();
        if (result.error) reject(Error(result.error));
        else
          resolve({
            version: result.version,
            init: () => call("init"),
            dispose: () => call("dispose"),
          });
      };
      document.addEventListener(channel + ":module-ready", ready);
      timer = setTimeout(() => {
        cleanup();
        reject(
          Error(
            "Sem registro IIFE: possível bloqueio de script/contexto ou código inválido.",
          ),
        );
      }, 2500);
      const script = document.createElement("script");
      const nonce = document.querySelector("script[nonce]")?.nonce;
      if (nonce) script.nonce = nonce;
      script.textContent =
        "(" +
        moduleRuntime.toString() +
        ")(" +
        JSON.stringify(channel) +
        "," +
        JSON.stringify(id) +
        ",function(register){\n" +
        code +
        "\n});";
      try {
        document.documentElement.append(script);
      } catch (error) {
        cleanup();
        reject(error);
      } finally {
        script.remove();
      }
    });
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      await test("Storage GM", async () => {
        try {
          await GM_setValue(temporaryKey, "round-trip");
          if ((await GM_getValue(temporaryKey)) !== "round-trip")
            throw Error("Leitura diferente da gravação.");
          return "Gravação e leitura confirmadas; chave temporária removida.";
        } finally {
          await GM_deleteValue(temporaryKey);
        }
      });
      await test("Download remoto GM", async () => {
        const response = await request(
          "https://rod.migos.club/menu/dist/menu.iife.min.js",
        );
        if (
          !response.responseText?.length ||
          /^\s*</.test(response.responseText)
        )
          throw Error("Conteúdo vazio ou HTML.");
        return `${response.responseText.length} caracteres baixados. Não executado. Headers de cache solicitados; ainda não prova atualização entre versões.`;
      });
      await test("Execução modular local", async () => {
        const probe = await load(
          'export const version="A";export async function init(core){await core.set("module");return await core.get();}export function dispose(){}',
        );
        const core = {
          set: (value) => GM_setValue(temporaryKey, value),
          get: () => GM_getValue(temporaryKey),
        };
        try {
          if ((await probe.init(core)) !== "module")
            throw Error("Módulo não conseguiu usar o contrato do core.");
          probe.dispose();
          return "ESM via Blob executado; módulo usou APIs GM através do core. Isto não testa import direto de URL remota.";
        } finally {
          await GM_deleteValue(temporaryKey);
        }
      });
      await test("Atualização/rollback LOCAL SIMULADO", async () => {
        const a = await load('export const version="A";');
        const b = await load('export const version="B";');
        let current = a;
        current = b;
        try {
          await load('throw new Error("Falha intencional do módulo");');
        } catch {
          /* candidato falhou: versão anterior permanece */
        }
        if (current.version !== "B") throw Error("Versão estável foi perdida.");
        return "A → B e candidato quebrado preservando B. Não prova cache HTTP, persistência após reload nem manifesto publicado.";
      });
      await test("IIFE local + GM via ponte", async () => {
        const module = await loadIIFE(
          'register({version:"A",async init(core){await core.set("iife-ok");return await core.get();},dispose(){}});',
        );
        try {
          if ((await module.init()) !== "iife-ok")
            throw Error("Round-trip GM não confirmado");
          return "Script clássico executou na página e usou storage GM por RPC. Sem import/Blob/eval.";
        } finally {
          await module.dispose();
          await GM_deleteValue(temporaryKey);
        }
      });
      await test("IIFE ciclo de vida LOCAL SIMULADO", async () => {
        const a = await loadIIFE(
          'register({version:"A",init:core=>core.ping(),dispose(){}});',
        );
        const b = await loadIIFE(
          'register({version:"B",init:core=>core.ping(),dispose(){}});',
        );
        try {
          if ((await a.init()) !== "core-ok" || (await b.init()) !== "core-ok")
            throw Error("Core não confirmado");
          let duplicateBlocked = false;
          try {
            await b.init();
          } catch {
            duplicateBlocked = true;
          }
          if (!duplicateBlocked) throw Error("Init duplicado não bloqueado");
          let brokenRejected = false;
          try {
            await loadIIFE('throw Error("Candidato quebrado intencional");');
          } catch {
            brokenRejected = true;
          }
          if (!brokenRejected) throw Error("Candidato inválido aceito");
          return "A/B inicializaram, init duplicado foi recusado e candidato quebrado rejeitado. Não valida release remota nem rollback após reload.";
        } finally {
          await a.dispose();
          await b.dispose();
        }
      });
      mark(
        "A/B remoto e offline após reload",
        "PENDENTE",
        "Exige manifesto e módulos de teste publicados no domínio. Ainda não é aprovação para migrar o RodX.",
      );
    } finally {
      running = false;
    }
  }
  async function remote() {
    const raw = shadow.querySelector("input").value.trim();
    await test("Módulo remoto de teste", async () => {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        !["rod.migos.club", "code.migos.club"].includes(url.hostname)
      )
        throw Error(
          "Use um módulo próprio HTTPS em rod.migos.club ou code.migos.club.",
        );
      const response = await request(url.href);
      const candidate = await loadIIFE(response.responseText);
      if (
        typeof candidate.version !== "string" ||
        typeof candidate.init !== "function" ||
        typeof candidate.dispose !== "function"
      )
        throw Error(
          "Contrato esperado: register({version, init(core), dispose()}).",
        );
      let result;
      try {
        result = await candidate.init(Object.freeze({ ping: () => "core-ok" }));
      } catch (error) {
        await candidate.dispose();
        throw error;
      }
      if (result !== "core-ok") {
        await candidate.dispose();
        throw Error("Contrato com core não confirmado.");
      }
      await activeModule?.dispose();
      activeModule = candidate;
      return (
        "Código baixado por GM e executado como IIFE clássico; versão " +
        candidate.version +
        ". Validar A/B em publicação posterior."
      );
    });
  }
  function mount() {
    if (shadow) {
      shadow.host.hidden = false;
      return;
    }
    const host = document.createElement("section");
    host.style.cssText =
      "position:fixed;inset:12px;z-index:2147483647;max-width:650px;margin:auto;";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
        }
        section {
          box-sizing: border-box;
          max-height: 85dvh;
          overflow: auto;
          background: #15191f;
          color: #f2f4f8;
          padding: 16px;
          border: 1px solid #64748b;
          border-radius: 14px;
          font: 14px/1.5 system-ui;
        }
        button,
        input {
          font: inherit;
          padding: 10px;
          margin: 4px 0;
          border: 1px solid #64748b;
          border-radius: 8px;
          background: #242d38;
          color: inherit;
        }
        input {
          box-sizing: border-box;
          width: 100%;
          font-size: 16px;
        }
        p {
          margin: 4px 0 12px;
          overflow-wrap: anywhere;
        }
        pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 monospace; }
        details { margin: 8px 0 8px 8px; overflow-wrap: anywhere; }
        summary { cursor: pointer; }
        ul {
          padding-left: 18px;
        }
      </style>
      <section>
        <h3>RodX · diagnóstico do carregador</h3>
        <p>Execute separado do RodX. O relatório copiado contém só resumo. Bodies e headers ficam em memória no painel local (até 12 chamadas / 6 MB / 10 minutos).</p>
        <button data-run>Executar testes</button>
        <button data-copy>Copiar relatório</button>
        <button data-stop>Encerrar observação</button>
        <button data-close>Ocultar painel</button>
        <ul></ul>
        <h3>GraphQL — captura local</h3>
        <p>Limite de 1 MiB por corpo. Estados: pending, empty, complete, partial, unavailable e error.</p>
        <button data-clear-network>Limpar bodies locais</button>
        <div data-network></div>
        <details>
          <summary>Teste remoto opcional — código próprio</summary>
          <p>Publique rodx-loader-probe-iife.js (o novo módulo, sem exports) no seu domínio e informe a URL. O botão executa esse código.</p>
          <input type="url" placeholder="https://rod.migos.club/.../probe.js" aria-label="URL do módulo de teste">
          <button data-remote>Executar módulo remoto</button>
        </details>
      </section>`;
    shadow.querySelector("[data-run]").onclick = run;
    shadow.querySelector("[data-clear-network]").onclick = () => {
      captures.clear();
      renderCaptures();
    };
    shadow.querySelector("[data-remote]").onclick = remote;
    shadow.querySelector("[data-close]").onclick = () => {
      host.hidden = true;
    };
    shadow.querySelector("[data-stop]").onclick = async () => {
      document.dispatchEvent(
        new CustomEvent(channel + ":command", { detail: "stop" }),
      );
      await activeModule?.dispose();
      activeModule = null;
    };
    shadow.querySelector("[data-copy]").onclick = async (event) => {
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(
            { environment, tests: Object.fromEntries(rows) },
            null,
            2,
          ),
        );
        event.target.textContent = "Copiado";
      } catch {
        event.target.textContent = "Clipboard indisponível";
      }
    };
    document.body.append(host);
    render();
    renderCaptures();
  }
  if (typeof GM_registerMenuCommand === "function")
    GM_registerMenuCommand("RodX · diagnóstico", mount);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
