import type { HttpRequestOptions } from "./http-client.js";

export interface InterceptorOptions {
  priority?: number;
  once?: boolean;
  match?: string | RegExp | ((value: any) => boolean);
  signal?: AbortSignal;
}

export type InterceptorCallback<T = any> = (value: T) => any | Promise<any>;

export interface NetworkInterceptors {
  interceptRequest: (callback: InterceptorCallback, options?: InterceptorOptions) => () => void;
  interceptResponse: (callback: InterceptorCallback, options?: InterceptorOptions) => () => void;
  request: (url: RequestInfo | URL, options?: HttpRequestOptions) => Promise<Response>;
  dispose: () => void;
}

export interface NetworkInterceptorsConfig {
  signal?: AbortSignal;
  onError?: (...args: any[]) => void;
}

interface RegistryItem {
  callback: InterceptorCallback;
  priority: number;
  once: boolean;
  match?: InterceptorOptions["match"];
}

interface NetworkRegistry {
  requests: Set<RegistryItem>;
  responses: Set<RegistryItem>;
  original: (input: RequestInfo | URL, init?: HttpRequestOptions) => Promise<Response>;
}

const registries = new WeakMap<any, NetworkRegistry>();

export function createNetworkInterceptors(
  http: { request: (input: RequestInfo | URL, init?: HttpRequestOptions) => Promise<Response> },
  { signal, onError = console.error }: NetworkInterceptorsConfig = {},
): NetworkInterceptors {
  let registry = registries.get(http);
  if (!registry) {
    registry = { requests: new Set(), responses: new Set(), original: http.request.bind(http) };
    registries.set(http, registry);
  }

  const owned = new Set<() => void>();

  function register(
    kind: "requests" | "responses",
    callback: InterceptorCallback,
    options: InterceptorOptions = {},
  ): () => void {
    if (typeof callback !== "function") throw new TypeError("Interceptor must be a function");
    const item: RegistryItem = {
      callback,
      priority: options.priority ?? 0,
      once: !!options.once,
      match: options.match,
    };

    const entries = registry![kind];
    entries.add(item);

    const off = () => {
      entries.delete(item);
      owned.delete(off);
      options.signal?.removeEventListener("abort", off);
    };

    owned.add(off);
    if (options.signal?.aborted || signal?.aborted) off();
    else options.signal?.addEventListener("abort", off, { once: true });

    return off;
  }

  async function apply(kind: "requests" | "responses", value: any): Promise<any> {
    let current = value;
    for (const item of [...registry![kind]].sort((a, b) => b.priority - a.priority)) {
      if (!registry![kind].has(item)) continue;

      if (item.match) {
        const matches =
          typeof item.match === "function"
            ? item.match(current)
            : String(current.url).includes(String(item.match));
        if (!matches) continue;
      }

      if (item.once) registry![kind].delete(item);

      try {
        const next = await item.callback(current);
        if (next !== undefined) current = next;
      } catch (error) {
        onError("[Userscripts CF interceptor]", error);
      }
    }
    return current;
  }

  const request = async (url: RequestInfo | URL, options: HttpRequestOptions = {}): Promise<Response> => {
    const initial = { url: String(url), ...options };
    const modified = await apply("requests", initial);
    const response = await registry!.original(modified.url, modified);
    const result = await apply("responses", response);
    return result instanceof Response ? result : response;
  };

  const dispose = () => {
    for (const off of [...owned]) off();
  };

  signal?.addEventListener("abort", dispose, { once: true });

  return Object.freeze({
    interceptRequest: (callback, options) => register("requests", callback, options),
    interceptResponse: (callback, options) => register("responses", callback, options),
    request,
    dispose,
  });
}

/**
 * Opt-in passive native fetch recorder. Reuses one patch per window and restores
 * the original function when the last subscriber unsubscribes.
 * Bodies are read from clones, never from the response delivered to the page.
 */
export interface FetchObserverEvent {
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  responseUrl?: string;
  requestBody?: string | null;
  body?: string | null;
  requestContentType?: string | null;
  responseContentType?: string | null;
  truncated?: boolean;
  requestTruncated?: boolean;
  error?: string;
}

export interface FetchObserverOptions {
  host?: Window & typeof globalThis;
  signal?: AbortSignal;
  maxBodyCharacters?: number;
}

type FetchListener = { callback: (event: FetchObserverEvent) => void; limit: number };
interface FetchRegistryEntry {
  original: typeof window.fetch;
  wrapped: typeof window.fetch;
  listeners: Set<FetchListener>;
}
const nativeFetchObservers = new WeakMap<Window & typeof globalThis, FetchRegistryEntry>();

// Clone streams before consumption. Reading the clone must never consume the page's body.
async function readBody(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  contentType: string | null,
): Promise<{ text: string | null; truncated: boolean }> {
  if (!stream || limit <= 0) return { text: null, truncated: false };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const decoded = decoder.decode(chunk.value, { stream: true });
      const remaining = limit - text.length;
      if (decoded.length > remaining) {
        text += decoded.slice(0, Math.max(0, remaining));
        truncated = true;
        break;
      }
      text += decoded;
      if (text.length >= limit) {
        truncated = true;
        break;
      }
    }
    if (!truncated) text += decoder.decode();
  } finally {
    if (truncated) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (contentType && !/json|text|xml|javascript|graphql|html|form|yaml|csv|svg/i.test(contentType)) {
    return { text: "[Binary body: preview unavailable]", truncated };
  }
  return { text, truncated };
}

export function observePageFetch(
  callback: (event: FetchObserverEvent) => void,
  { host = window, signal, maxBodyCharacters = 120000 }: FetchObserverOptions = {},
): () => void {
  if (typeof callback !== "function") throw new TypeError("Expected network observer");
  if (typeof host.fetch !== "function") return () => {};
  let entry = nativeFetchObservers.get(host);
  if (!entry) {
    const original = host.fetch;
    const listeners = new Set<FetchListener>();
    const wrapped: typeof window.fetch = function (this: Window, ...args: Parameters<typeof window.fetch>) {
      const start = Date.now();
      const input = args[0];
      const init = args[1];
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const limit = Math.max(0, ...[...listeners].map((listener) => listener.limit));
      let requestClone: Request | null = null;
      try {
        if (limit > 0) requestClone = new Request(input, init).clone();
      } catch {
        /* Uncloneable or consumed request bodies remain metadata-only. */
      }
      const requestContentType = requestClone?.headers.get("content-type") ?? null;
      const requestBody = requestClone
        ? readBody(requestClone.body, limit, requestContentType).catch(() => ({
            text: null,
            truncated: false,
          }))
        : Promise.resolve({ text: null, truncated: false });
      const response = Reflect.apply(original, this, args);
      Promise.resolve(response).then(
        async (result) => {
          const responseContentType = result.headers?.get("content-type") ?? null;
          let bodyPromise: Promise<{ text: string | null; truncated: boolean }> = Promise.resolve({
            text: null,
            truncated: false,
          });
          try {
            if (limit > 0)
              bodyPromise = readBody(result.clone().body, limit, responseContentType).catch(() => ({
                text: null,
                truncated: false,
              }));
          } catch {
            /* Locked or opaque response: metadata only. */
          }
          const [requestData, responseData] = await Promise.all([requestBody, bodyPromise]);
          const base: FetchObserverEvent = {
            url,
            method,
            status: result.status,
            durationMs: Date.now() - start,
            responseUrl: result.url,
            requestContentType,
            responseContentType,
          };
          for (const listener of [...listeners]) {
            try {
              const max = listener.limit;
              listener.callback({
                ...base,
                requestBody: max > 0 ? (requestData.text?.slice(0, max) ?? null) : null,
                body: max > 0 ? (responseData.text?.slice(0, max) ?? null) : null,
                requestTruncated: requestData.truncated || (requestData.text?.length ?? 0) > max,
                truncated: responseData.truncated || (responseData.text?.length ?? 0) > max,
              });
            } catch {
              /* Observers must never break page requests. */
            }
          }
        },
        async (error) => {
          const requestData = await requestBody;
          for (const listener of [...listeners]) {
            try {
              listener.callback({
                url,
                method,
                error: String(error),
                durationMs: Date.now() - start,
                requestContentType,
                requestBody: listener.limit > 0 ? (requestData.text?.slice(0, listener.limit) ?? null) : null,
              });
            } catch {}
          }
        },
      );
      return response;
    };
    host.fetch = wrapped;
    entry = { original, wrapped, listeners };
    nativeFetchObservers.set(host, entry);
  }
  const subscriber: FetchListener = { callback, limit: Math.max(0, maxBodyCharacters) };
  entry.listeners.add(subscriber);
  let active = true;
  const off = () => {
    if (!active) return;
    active = false;
    entry!.listeners.delete(subscriber);
    if (!entry!.listeners.size) {
      if (host.fetch === entry!.wrapped) host.fetch = entry!.original;
      nativeFetchObservers.delete(host);
    }
    signal?.removeEventListener("abort", off);
  };
  if (signal?.aborted) off();
  else signal?.addEventListener("abort", off, { once: true });
  return off;
}

/**
 * Passive XHR observer. Installs once per window, never changes response data,
 * and restores prototype methods when no observers remain.
 */
export interface XHRObserverEvent {
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  body?: string | null;
  error?: string;
}

export interface XHRObserverOptions {
  host?: Window & typeof globalThis;
  signal?: AbortSignal;
  maxBodyCharacters?: number;
}

interface XHRRegistryEntry {
  open: typeof XMLHttpRequest.prototype.open;
  send: typeof XMLHttpRequest.prototype.send;
  patchedOpen: typeof XMLHttpRequest.prototype.open;
  patchedSend: typeof XMLHttpRequest.prototype.send;
  listeners: Set<(event: XHRObserverEvent) => void>;
}

const xhrObservers = new WeakMap<any, XHRRegistryEntry>();

export function observePageXHR(
  callback: (event: XHRObserverEvent) => void,
  { host = window, signal, maxBodyCharacters = 120000 }: XHRObserverOptions = {},
): () => void {
  const prototype = host.XMLHttpRequest?.prototype;
  if (!prototype) return () => {};

  let entry = xhrObservers.get(prototype);
  if (!entry) {
    const open = prototype.open;
    const send = prototype.send;
    const listeners = new Set<(event: XHRObserverEvent) => void>();
    const metadata = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

    const patchedOpen = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
      metadata.set(this, { method: String(method), url: String(url) });
      return open.call(this, method, url, ...(rest as [any, any]));
    };

    const patchedSend = function (this: XMLHttpRequest, ...args: any[]) {
      const info = metadata.get(this) || { method: "GET", url: "" };
      const start = Date.now();

      this.addEventListener(
        "loadend",
        () => {
          const event: XHRObserverEvent = {
            ...info,
            status: this.status,
            durationMs: Date.now() - start,
            body: null,
          };
          try {
            const type = this.getResponseHeader("content-type") || "";
            if (
              maxBodyCharacters > 0 &&
              (this.responseType === "" || this.responseType === "text") &&
              /json|text|xml|javascript|graphql|html/i.test(type)
            )
              event.body = String(this.responseText).slice(0, maxBodyCharacters);
            else if (maxBodyCharacters > 0 && this.responseType === "json")
              event.body = JSON.stringify(this.response).slice(0, maxBodyCharacters);
          } catch {
            /* Ignore opaque, binary, and inaccessible responses. */
          }

          for (const listener of [...listeners]) {
            try {
              listener(event);
            } catch {}
          }
        },
        { once: true },
      );

      return send.apply(this, args);
    };

    prototype.open = patchedOpen;
    prototype.send = patchedSend;
    entry = { open, send, patchedOpen, patchedSend, listeners };
    xhrObservers.set(prototype, entry);
  }

  entry.listeners.add(callback);

  const off = () => {
    entry!.listeners.delete(callback);
    if (!entry!.listeners.size) {
      if (prototype.open === entry!.patchedOpen) prototype.open = entry!.open;
      if (prototype.send === entry!.patchedSend) prototype.send = entry!.send;
      xhrObservers.delete(prototype);
    }
    signal?.removeEventListener("abort", off);
  };

  if (signal?.aborted) off();
  else signal?.addEventListener("abort", off, { once: true });

  return off;
}
