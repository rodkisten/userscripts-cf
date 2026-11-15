import { createHttpClient } from "../../http-client.js";
import { createNetworkInterceptors } from "../../network-interceptors.js";

export function createHttpFeature(host: Window & typeof globalThis, signal: AbortSignal, storage: any, namespace: string) {
  const client = createHttpClient({ host, signal, storage, namespace });
  const interceptors = createNetworkInterceptors(client, { signal });
  return {
    http: Object.freeze({ ...client, request: interceptors.request }),
    interceptRequest: interceptors.interceptRequest,
    interceptResponse: interceptors.interceptResponse,
    dispose() {
      interceptors.dispose();
      client.dispose();
    },
  };
}
