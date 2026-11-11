// ==UserScript==
// @name         RodX · Laboratório de releases remotas
// @namespace    https://rod.migos.club/rodx-loader-lab
// @version      1.0.0
// @description  Release real no Cloudflare: hash, cache GM, candidato quebrado e rollback após reload.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      rodx-loader-lab.kisten.workers.dev
// ==/UserScript==
(() => {
  "use strict";
  if (window.__rodxRemoteLab) return;
  window.__rodxRemoteLab = true;
  const BASE = "https://rodx-loader-lab.kisten.workers.dev";
  const KEY = "rodx:remote-loader-lab:v1";
  const channel = "rodx-lab-" + crypto.randomUUID();
  const temporaryKey = KEY + ":rpc:" + channel;
  const started = performance.now();
  const report = {
    schema: 1,
    script: "1.0.0",
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    boot: null,
    tests: [],
  };
  let db,
    active,
    busy = false,
    root,
    message = "Inicializando…";
  const log = (test, status, detail) => {
    report.tests.push({ test, status, detail, at: new Date().toISOString() });
    report.tests = report.tests.slice(-30);
    render();
  };
  const save = async (next) => {
    await GM_setValue(KEY, JSON.stringify(next));
    const readback = await GM_getValue(KEY, "");
    if (readback !== JSON.stringify(next)) throw Error("Persistência GM não confirmou o snapshot.");
    db = next;
  };
  const digest = async (code) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)))]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  async function verify(release) {
    if (
      !release ||
      typeof release.code !== "string" ||
      release.code.length > 200000 ||
      !/^[a-f0-9]{64}$/.test(release.sha256 || "") ||
      (await digest(release.code)) !== release.sha256
    )
      throw Error("Hash/conteúdo inválido; release não será executada.");
  }
  function request(path, fresh = false) {
    const url = new URL(path, BASE);
    if (url.origin !== BASE) throw Error("Origem de módulo fora do laboratório.");
    if (fresh) url.searchParams.set("check", crypto.randomUUID());
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url.href,
        timeout: 15000,
        nocache: fresh,
        ...(fresh ? { headers: { "Cache-Control": "no-cache" } } : {}),
        onload: (response) =>
          response.status >= 200 && response.status < 300
            ? resolve(response)
            : reject(Error("HTTP " + response.status)),
        ontimeout: () => reject(Error("Timeout remoto")),
        onerror: () => reject(Error("Falha de conexão GM")),
      });
    });
  }
  async function download(path = "/manifest.json") {
    const response = await request(path, true);
    const manifest = JSON.parse(response.responseText);
    const item = manifest.module;
    if (
      manifest.schema !== 1 ||
      !item ||
      typeof item.version !== "string" ||
      !/^\/modules\/[\w.-]+\.js$/.test(item.path)
    )
      throw Error("Manifesto inválido.");
    const module = await request(item.path);
    const candidate = {
      version: item.version,
      release: manifest.release,
      sha256: item.sha256,
      code: module.responseText,
      path: item.path,
      downloadedAt: new Date().toISOString(),
    };
    await verify(candidate);
    return candidate;
  }
  async function execute(release) {
    await verify(release);
    const module = await loadIIFE(release.code);
    if (module.version !== release.version) {
      await module.dispose();
      throw Error("Versão registrada difere do manifesto.");
    }
    try {
      if ((await module.init()) !== "core-ok") throw Error("Módulo não confirmou o core.");
      return module;
    } catch (error) {
      await module.dispose().catch(() => {});
      throw error;
    } finally {
      await GM_deleteValue(temporaryKey);
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
      } else if (call.op === "get") result.value = await GM_getValue(temporaryKey);
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
        reject(Error("Sem registro IIFE: possível bloqueio de script/contexto ou código inválido."));
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
  async function stage() {
    const candidate = await download();
    if (candidate.sha256 === db.stable?.sha256) {
      message = "Versão publicada já é " + candidate.version + ". Aguarde a publicação de B.";
      log("Manifesto remoto", "OK", message);
      return;
    }
    const probe = await execute(candidate);
    await probe.dispose();
    await save({ ...db, pending: { ...candidate, reason: "remote-update" } });
    message = "Release " + candidate.version + " validada e salva. Toque em Recarregar para ativar.";
    log("Download real + SHA-256 + init/dispose", "OK", message);
  }
  async function broken() {
    if (!db.stable) throw Error("Ative A antes de testar o candidato quebrado.");
    const before = db.stable.sha256;
    const candidate = await download("/manifest-bad.json");
    let rejected = false;
    try {
      const handle = await execute(candidate);
      await handle.dispose();
    } catch (error) {
      rejected = true;
      message = "Candidato BAD rejeitado: " + error.message;
    }
    if (!rejected) throw Error("Candidato BAD foi aceito.");
    const saved = JSON.parse(await GM_getValue(KEY, "{}"));
    if (saved.stable?.sha256 !== before) throw Error("Versão estável mudou indevidamente.");
    log("Candidato quebrado remoto", "OK", message + "; estável preservada: " + db.stable.version);
  }
  async function rollback() {
    if (!db.previous) throw Error("Ainda não há versão anterior. Ative B após A primeiro.");
    await verify(db.previous);
    await save({ ...db, pending: { ...db.previous, reason: "rollback" } });
    message = "Rollback para " + db.previous.version + " preparado. Recarregue.";
    log("Rollback preparado", "OK", message);
  }
  async function failureOnReload() {
    if (!db.stable) throw Error("Primeiro ative A.");
    await save({ ...db, failOnce: true, pending: null });
    message = "No próximo reload, fará uma consulta HTTP 503 real e tentará iniciar pelo cache GM.";
    log("Falha controlada preparada", "PENDENTE", message);
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (error) {
      message = error.message;
      log("Operação", "FALHOU", error.message);
    } finally {
      busy = false;
      render();
    }
  }
  function render() {
    if (!root) return;
    root.querySelector("[data-message]").textContent = message;
    root.querySelector("[data-status]").textContent =
      "Ativa: " +
      (active?.version || "nenhuma") +
      " · Estável GM: " +
      (db?.stable?.version || "nenhuma") +
      " · Pendente: " +
      (db?.pending?.version || "nenhuma") +
      " · Anterior: " +
      (db?.previous?.version || "nenhuma");
    root.querySelector("pre").textContent = JSON.stringify(report, null, 2);
    for (const button of root.querySelectorAll("button[data-action]")) button.disabled = busy;
  }
  function mount() {
    if (root) {
      root.host.hidden = false;
      return;
    }
    const host = document.createElement("div");
    host.id = "rodx-release-lab";
    host.style.cssText = "position:fixed;inset:12px;z-index:2147483647;max-width:650px;margin:auto;";
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
        }
        section {
          max-height: 85dvh;
          overflow: auto;
          background: #141b24;
          color: #f5f7fb;
          border: 1px solid #64748b;
          padding: 16px;
          border-radius: 14px;
          font: 14px/1.5 system-ui;
        }
        button {
          margin: 4px 0;
          padding: 10px;
          border: 1px solid #64748b;
          border-radius: 9px;
          color: inherit;
          background: #253245;
          font: inherit;
        }
        pre {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font: 11px/1.5 monospace;
        }
      </style>
      <section>
        <h3>RodX · release remota real</h3>
        <p data-status></p><p data-message></p>
        <button data-action="stage">1. Baixar versão publicada</button>
        <button data-reload>2. Recarregar para ativar</button>
        <button data-action="broken">Testar candidato quebrado remoto</button>
        <button data-action="failure">Testar fallback após HTTP 503 no próximo reload</button>
        <button data-action="rollback">Preparar rollback para anterior</button>
        <button data-copy>Copiar relatório</button>
        <button data-close>Ocultar</button>
        <p>A e B exigem publicações diferentes na mesma URL do manifesto. HTTP 503 é falha remota controlada:
          testa o cache do carregador; não simula o Safari inteiro offline. Não modifica o RodX gigante.</p>
        <details><summary>Relatório</summary><pre></pre></details>
      </section>`;
    const handlers = { stage, broken, failure: failureOnReload, rollback };
    for (const button of root.querySelectorAll("[data-action]"))
      button.onclick = () => action(handlers[button.dataset.action]);
    root.querySelector("[data-reload]").onclick = () => location.reload();
    root.querySelector("[data-close]").onclick = () => {
      host.hidden = true;
    };
    root.querySelector("[data-copy]").onclick = async (event) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        event.target.textContent = "Copiado";
      } catch {
        event.target.textContent = "Selecione o texto no relatório abaixo";
      }
    };
    document.body.append(host);
    render();
  }
  async function boot() {
    try {
      db = JSON.parse(await GM_getValue(KEY, "{}"));
    } catch {
      db = {};
    }
    if (!db || typeof db !== "object") db = {};
    let failedRemote = null;
    try {
      if (db.failOnce) {
        await save({ ...db, failOnce: false });
        try {
          await request("/manifest-unavailable.json", true);
          failedRemote = "Endpoint inesperadamente respondeu sucesso";
        } catch (error) {
          failedRemote = error.message;
        }
      }
      const candidate = db.pending || db.stable;
      if (!candidate) {
        message = "Nenhuma release no cache. Toque em Baixar versão publicada.";
        return;
      }
      try {
        active = await execute(candidate);
        const source = db.pending ? "pending-from-GM" : "stable-from-GM";
        if (db.pending)
          await save({
            ...db,
            previous: db.stable || null,
            stable: candidate,
            pending: null,
          });
        report.boot = {
          version: candidate.version,
          source,
          sha256: candidate.sha256,
          failedRemote,
          moduleDownloadAtBoot: false,
          elapsedMs: Math.round(performance.now() - started),
        };
        message = "Release " + candidate.version + " ativa a partir do código salvo no GM.";
        log("Ativação após reload", "OK", message);
      } catch (error) {
        const fallback = db.pending ? db.stable : db.previous;
        if (!fallback) throw error;
        active = await execute(fallback);
        await save({ ...db, stable: fallback, pending: null });
        report.boot = {
          version: fallback.version,
          source: "fallback-from-GM",
          failedRemote,
          error: error.message,
          moduleDownloadAtBoot: false,
        };
        message = "Candidato falhou; versão anterior " + fallback.version + " restaurada.";
        log("Fallback após reload", "OK", message);
      }
      if (failedRemote)
        log(
          "HTTP 503 + cache GM no reload",
          failedRemote === "HTTP 503" ? "OK" : "REVISAR",
          failedRemote + "; ativa: " + active.version,
        );
      if (db.pending) message += " Há uma candidata pendente.";
    } catch (error) {
      message = error.message;
      log("Boot", "FALHOU", error.message);
    } finally {
      render();
    }
  }
  if (typeof GM_registerMenuCommand === "function")
    GM_registerMenuCommand("RodX · laboratório remoto", mount);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
  void boot();
})();
