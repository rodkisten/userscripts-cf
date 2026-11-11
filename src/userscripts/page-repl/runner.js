import { payloadSource, rawPayloadSource } from "./payload.js";

export function createRunner({ host = window, onEvent = () => {}, timeout = 3000, limit = 20000 } = {}) {
  const channel = "rodx-repl:" + host.crypto.randomUUID();
  const sessionKey = "__rodxREPLSession_" + host.crypto.randomUUID().replaceAll("-", "");
  let active = null;
  const attribute = "data-rodx-repl-" + host.crypto.randomUUID().replaceAll("-", "");
  async function run(method, code, { signal, probe = false, raw = false } = {}) {
    if (active) throw Error("Uma execução já está em andamento");
    const id = host.crypto.randomUUID(),
      started = host.performance.now();
    let cleanup,
      done = false,
      timer,
      observer;
    const csp = [],
      transports = new Set(),
      seen = new Set();
    let finish;
    const promise = new Promise((resolve) => {
      finish = (status, detail) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        observer?.disconnect();
        host.document.removeEventListener(channel, custom);
        host.removeEventListener("message", message);
        host.document.removeEventListener("securitypolicyviolation", violation);
        signal?.removeEventListener("abort", abort);
        host.document.documentElement?.removeAttribute(attribute);
        try {
          cleanup?.();
        } catch {}
        const result = {
          id,
          method: method.id,
          label: method.label,
          expectedWorld: method.world,
          status,
          detail,
          csp,
          transports: [...transports],
          elapsedMs: Math.round(host.performance.now() - started),
          probe,
        };
        active = null;
        onEvent({ type: "finished", result });
        resolve(result);
      };
    });
    const receive = (raw, transport) => {
      let data;
      try {
        data = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return;
      }
      if (data?.id !== id || done) return;
      transports.add(transport);
      if (seen.has(data.sequence)) return;
      seen.add(data.sequence);
      onEvent({ type: data.type, id, method: method.id, value: data.value });
      if (data.type === "result") finish("OK", data.value);
      if (data.type === "error") finish("ERRO", data.value);
    };
    const custom = (event) => receive(event.detail, "CustomEvent");
    const message = (event) => {
      if (event.source === host && event.data?.channel === channel) receive(event.data, "postMessage");
    };
    const violation = (event) => {
      if (csp.length < 10)
        csp.push({
          directive: event.violatedDirective,
          blockedURI: event.blockedURI,
          disposition: event.disposition,
        });
    };
    const abort = () =>
      finish("CANCELADO", "Espera cancelada. Código já iniciado pode continuar executando.");
    host.document.addEventListener(channel, custom);
    host.addEventListener("message", message);
    host.document.addEventListener("securitypolicyviolation", violation);
    observer = new host.MutationObserver(() => {
      const raw = host.document.documentElement?.getAttribute(attribute);
      if (raw) receive(raw, "atributo DOM");
    });
    observer.observe(host.document.documentElement, { attributes: true, attributeFilter: [attribute] });
    signal?.addEventListener("abort", abort, { once: true });
    active = { finish };
    timer = setTimeout(
      () =>
        finish(
          "TIMEOUT",
          "Nenhuma confirmação recebida. CSP, transporte bloqueado ou código ainda em execução; não é prova isolada de falha de execução.",
        ),
      timeout,
    );
    if (signal?.aborted) abort();
    else {
      try {
        const source =
          (raw ? rawPayloadSource : payloadSource)({ id, channel, sessionKey, attribute, limit }, code) +
          `\n//# sourceURL=rodx-repl-${id}.js`;
        Promise.resolve()
          .then(() => {
            if (!done) return method.run(source);
          })
          .then((teardown) => {
            if (typeof teardown === "function") {
              cleanup = teardown;
              if (done) cleanup();
            }
          })
          .catch((error) =>
            finish(error.code === "unavailable" ? "INDISPONÍVEL" : "ERRO", {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }),
          );
      } catch (error) {
        finish(error.code === "unavailable" ? "INDISPONÍVEL" : "ERRO", {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
    }
    return promise;
  }
  return {
    run,
    sessionKey,
    configure(value) {
      timeout = Math.max(250, Math.min(60000, Number(value) || 3000));
    },
    cancel: () => active?.finish("CANCELADO", "Espera cancelada; código iniciado não é encerrado."),
    dispose() {
      this.cancel();
      try {
        delete host[sessionKey];
        if (typeof unsafeWindow !== "undefined") delete unsafeWindow[sessionKey];
      } catch {}
    },
  };
}
