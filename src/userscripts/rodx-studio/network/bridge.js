import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { DEFAULT_SETTINGS } from "../../../config/defaults.js";
import { DOM_SELECTORS } from "../../../selectors.js";
import { studioPageBridge } from "./page-bridge.js";

export function connectStudioNetwork(Studio) {
  const channel =
    "rodx-studio-" + Array.from(crypto.getRandomValues(new Uint32Array(3)), (n) => n.toString(36)).join("");
  const pending = new Map(),
    buffer = [];
  let id = 0,
    hasConsumer = false,
    bufferBytes = 0;
  const call = (type, data) =>
    document.dispatchEvent(
      new CustomEvent(channel + ":" + type, {
        detail: JSON.stringify(data),
      }),
    );
  for (const type of ["status", "request", "response", "media", "result", "inspect"])
    document.addEventListener(channel + ":" + type, (event) => {
      let data;
      try {
        data = JSON.parse(event.detail);
      } catch {
        return;
      }
      if (type === "status") {
        Object.assign(Studio.state.network, data);
        Studio.invalidate("state");
      } else if (type === "result") {
        const task = pending.get(data.id);
        if (task) {
          clearTimeout(task.timer);
          task.cleanup?.();
          pending.delete(data.id);
          task.resolve(data);
        }
      } else if (type === "inspect") {
        Studio.emit("network:inspect", data);
      } else if (type === "media") {
        const cache = Studio.state.mediaSources || (Studio.state.mediaSources = new Map());
        for (const item of data.items || []) {
          cache.set(item.id, item.media);
          if (cache.size > 160) cache.delete(cache.keys().next().value);
        }
        Studio.emit("network:media", data);
      } else {
        if (!hasConsumer) {
          const bytes = String(event.detail).length;
          if (bytes <= 2_000_000) {
            buffer.push([type, data, bytes]);
            bufferBytes += bytes;
            while (buffer.length > 6 || bufferBytes > 2_000_000) bufferBytes -= buffer.shift()[2];
          }
        }
        Studio.emit("network:" + type, data);
      }
    });
  Studio.net = {
    subscribe(request, response) {
      hasConsumer = true;
      Studio.on("network:request", request);
      Studio.on("network:response", response);
      for (const [type, data] of buffer.splice(0)) (type === "request" ? request : response)(data);
      bufferBytes = 0;
    },
    request(path, options = {}) {
      if (!Studio.state.network.ready)
        return Promise.reject(Error("Ponte de rede indisponível. Recarregue o X."));
      const { signal, ...safe } = options;
      if (signal?.aborted) return Promise.reject(new DOMException("Abortado", "AbortError"));
      return new Promise((resolve, reject) => {
        const number = ++id,
          cleanup = () => signal?.removeEventListener("abort", abort);
        const abort = () => {
          const task = pending.get(number);
          if (!task) return;
          clearTimeout(task.timer);
          cleanup();
          pending.delete(number);
          call("cancel", {
            id: number,
          });
          reject(new DOMException("Abortado", "AbortError"));
        };
        const timer = setTimeout(() => {
          cleanup();
          pending.delete(number);
          if ((safe.method || "GET") === "GET")
            call("cancel", {
              id: number,
            });
          reject(Error("Tempo esgotado na ponte. Verifique a ação antes de repetir."));
        }, RUNTIME_LIMITS.networkBridge.connectStudioNetworkDelayMs);
        pending.set(number, {
          resolve,
          reject,
          timer,
          cleanup,
        });
        signal?.addEventListener("abort", abort, {
          once: true,
        });
        call("call", {
          id: number,
          path,
          ...safe,
        });
      });
    },
  };
  try {
    if (typeof unsafeWindow !== "undefined")
      studioPageBridge(unsafeWindow, channel, DEFAULT_SETTINGS, RUNTIME_LIMITS.networkPageBridge);
  } catch {}
  const tried = new Set();
  let observer, timeout;
  function inject() {
    if (Studio.state.network.ready) {
      observer?.disconnect();
      clearTimeout(timeout);
      return;
    }
    const root = document.documentElement;
    if (!root) return;
    const nonce = document.querySelector(DOM_SELECTORS.nonceScript)?.nonce || "";
    if (tried.has(nonce)) return;
    tried.add(nonce);
    try {
      const script = document.createElement("script");
      if (nonce) script.nonce = nonce;
      script.textContent =
        ";(" +
        studioPageBridge.toString() +
        ")(window," +
        JSON.stringify(channel) +
        "," +
        JSON.stringify(DEFAULT_SETTINGS) +
        "," +
        JSON.stringify(RUNTIME_LIMITS.networkPageBridge) +
        ");";
      root.append(script);
      script.remove();
    } catch {}
  }
  inject();
  if (!Studio.state.network.ready) {
    observer = new MutationObserver(inject);
    observer.observe(document, {
      childList: true,
      subtree: true,
    });
    timeout = setTimeout(() => {
      observer.disconnect();
      if (!Studio.state.network.ready) {
        Studio.state.network.error =
          "A extensão/CSP bloqueou a ponte de página. Os filtros não serão aplicados no DOM.";
        Studio.invalidate("state");
      }
    }, 16000);
  }
}
