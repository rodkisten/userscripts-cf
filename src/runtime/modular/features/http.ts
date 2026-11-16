import { captureDiagnostic } from "../../diagnostics.js";
import { createHttpClient } from "../../http-client.js";
import { createNetworkInterceptors } from "../../network-interceptors.js";

export function createHttpFeature(host: Window & typeof globalThis, signal: AbortSignal, storage: any, namespace: string) {
  const client = createHttpClient({ host, signal, storage, namespace });
  const interceptors = createNetworkInterceptors(client, {
    signal,
    onError: (_label: string, error: unknown) => {
      captureDiagnostic(error, "http.interceptor", namespace, host);
      console.error("[Userscripts CF interceptor]", error);
    },
  });
  const request: typeof interceptors.request = async (url, options) => {
    try {
      return await interceptors.request(url, options);
    } catch (error) {
      if (!signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
        captureDiagnostic(error, "http.request", namespace, host);
      }
      throw error;
    }
  };
  return {
    http: Object.freeze({ ...client, request }),
    interceptRequest: interceptors.interceptRequest,
    interceptResponse: interceptors.interceptResponse,
    dispose() {
      interceptors.dispose();
      client.dispose();
    },
  };
}
