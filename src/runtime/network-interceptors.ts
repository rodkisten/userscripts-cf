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
        const targetUrl = String(current?.url ?? "");
        const matches =
          typeof item.match === "function"
            ? item.match(current)
            : item.match instanceof RegExp
              ? item.match.test(targetUrl)
              : targetUrl.includes(String(item.match));
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
    signal?.removeEventListener("abort", dispose);
  };

  if (signal?.aborted) dispose();
  else signal?.addEventListener("abort", dispose, { once: true });

  return Object.freeze({
    interceptRequest: (callback, options) => register("requests", callback, options),
    interceptResponse: (callback, options) => register("responses", callback, options),
    request,
    dispose,
  });
}

const TEXT_CONTENT_RE = /json|text|xml|javascript|graphql|html|x-www-form-urlencoded/i;

/**
 * Lê até `limit` caracteres de um stream sem alocar o payload inteiro na memória.
 */
async function readBoundedText(
  stream: ReadableStream<Uint8Array> | null | undefined,
  limit: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!stream || limit <= 0) return { text: "", truncated: false };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        text += decoder.decode(value, { stream: true });
        if (text.length >= limit) {
          text = text.slice(0, limit);
          truncated = true;
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
    if (!truncated) {
      text += decoder.decode();
    }
  } finally {
    reader.releaseLock();
  }

  return { text, truncated };
}

async function extractRequestPayload(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  maxChars: number,
): Promise<{
  requestBody?: string | null;
  requestContentType?: string | null;
  requestTruncated?: boolean;
}> {
  const headers = new Headers(
    init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
  );
  const requestContentType = headers.get("content-type");

  if (maxChars <= 0) {
    return { requestContentType };
  }

  const rawBody = init?.body;
  if (rawBody !== undefined && rawBody !== null) {
    if (typeof rawBody === "string") {
      return {
        requestBody: rawBody.slice(0, maxChars),
        requestContentType,
        requestTruncated: rawBody.length > maxChars,
      };
    }
    if (typeof URLSearchParams !== "undefined" && rawBody instanceof URLSearchParams) {
      const serialized = rawBody.toString();
      return {
        requestBody: serialized.slice(0, maxChars),
        requestContentType: requestContentType || "application/x-www-form-urlencoded",
        requestTruncated: serialized.length > maxChars,
      };
    }
    if (typeof FormData !== "undefined" && rawBody instanceof FormData) {
      const parts: string[] = [];
      for (const [k, v] of rawBody.entries()) {
        parts.push(`${k}=${typeof v === "string" ? v : `[File:${v.name}]`}`);
      }
      const serialized = parts.join("&");
      return {
        requestBody: serialized.slice(0, maxChars),
        requestContentType: requestContentType || "multipart/form-data",
        requestTruncated: serialized.length > maxChars,
      };
    }
    return { requestBody: "[Binary or Stream Body]", requestContentType };
  }

  if (typeof Request !== "undefined" && input instanceof Request && input.body && !input.bodyUsed) {
    try {
      const cloned = input.clone();
      const { text, truncated } = await readBoundedText(cloned.body, maxChars);
      return { requestBody: text, requestContentType, requestTruncated: truncated };
    } catch {
      return { requestBody: "[Unreadable Request Body]", requestContentType };
    }
  }

  return { requestContentType };
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
  requestTruncated?: boolean;
  truncated?: boolean;
  error?: string;
}

export interface FetchObserverOptions {
  host?: Window & typeof globalThis;
  signal?: AbortSignal;
  maxBodyCharacters?: number;
}

interface FetchListenerEntry {
  callback: (event: FetchObserverEvent) => void;
  maxBodyCharacters: number;
}

interface FetchRegistryEntry {
  original: typeof window.fetch;
  wrapped: typeof window.fetch;
  listeners: Set<FetchListenerEntry>;
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
    const listeners = new Set<FetchListenerEntry>();

    const getEffectiveLimit = () => {
      let limit = 0;
      for (const item of listeners) {
        if (item.maxBodyCharacters > limit) limit = item.maxBodyCharacters;
      }
      return limit;
    };

    const wrapped: typeof window.fetch = function (this: any, ...args: Parameters<typeof window.fetch>) {
      const start = performance.now();
      const request = args[0];
      const init = args[1];
      const url = typeof request === "string" ? request : (request as Request)?.url || String(request);
      const method = (init?.method || (request as Request)?.method || "GET").toUpperCase();
      const effectiveLimit = getEffectiveLimit();

      // Captura o requestBody antes que o fetch consuma o stream
      const requestInfoPromise = extractRequestPayload(request, init, effectiveLimit);
      const response = original.apply(this, args);

      Promise.resolve(response).then(
        async (result) => {
          const reqInfo = await requestInfoPromise;
          const responseContentType = result.headers?.get("content-type") || null;
          const event: FetchObserverEvent = {
            url,
            method,
            status: result.status,
            durationMs: Math.round(performance.now() - start),
            responseUrl: result.url,
            body: null,
            responseContentType,
            ...reqInfo,
            truncated: false,
          };

          const currentLimit = getEffectiveLimit();
          try {
            if (currentLimit > 0 && responseContentType && TEXT_CONTENT_RE.test(responseContentType)) {
              const { text, truncated } = await readBoundedText(result.clone().body, currentLimit);
              event.body = text;
              event.truncated = truncated;
            }
          } catch {
            /* Opaque, streaming and unreadable responses remain metadata-only. */
          }

          for (const listener of [...listeners]) {
            try {
              if (listener.maxBodyCharacters <= 0) {
                listener.callback({
                  ...event,
                  body: null,
                  requestBody: undefined,
                  truncated: false,
                  requestTruncated: false,
                });
              } else {
                listener.callback({
                  ...event,
                  body: event.body ? event.body.slice(0, listener.maxBodyCharacters) : event.body,
                  requestBody: event.requestBody
                    ? event.requestBody.slice(0, listener.maxBodyCharacters)
                    : event.requestBody,
                });
              }
            } catch {
              /* Observers must never break page requests. */
            }
          }
        },
        async (error) => {
          const reqInfo = await requestInfoPromise;
          for (const listener of [...listeners]) {
            try {
              listener.callback({
                url,
                method,
                ...reqInfo,
                error: String(error),
                durationMs: Math.round(performance.now() - start),
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

  const listenerEntry: FetchListenerEntry = { callback, maxBodyCharacters };
  entry.listeners.add(listenerEntry);

  const off = () => {
    entry!.listeners.delete(listenerEntry);
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
  responseContentType?: string | null;
  body?: string | null;
  truncated?: boolean;
  error?: string;
}

export interface XHRObserverOptions {
  host?: Window & typeof globalThis;
  signal?: AbortSignal;
  maxBodyCharacters?: number;
}

interface XHRListenerEntry {
  callback: (event: XHRObserverEvent) => void;
  maxBodyCharacters: number;
}

interface XHRRegistryEntry {
  open: typeof XMLHttpRequest.prototype.open;
  send: typeof XMLHttpRequest.prototype.send;
  patchedOpen: typeof XMLHttpRequest.prototype.open;
  patchedSend: typeof XMLHttpRequest.prototype.send;
  listeners: Set<XHRListenerEntry>;
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
    const listeners = new Set<XHRListenerEntry>();
    const metadata = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

    const getEffectiveLimit = () => {
      let limit = 0;
      for (const item of listeners) {
        if (item.maxBodyCharacters > limit) limit = item.maxBodyCharacters;
      }
      return limit;
    };

    const patchedOpen = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
      metadata.set(this, { method: String(method).toUpperCase(), url: String(url) });
      return open.call(this, method, url, ...(rest as [any, any]));
    };

    const patchedSend = function (this: XMLHttpRequest, ...args: any[]) {
      const info = metadata.get(this) || { method: "GET", url: "" };
      const start = performance.now();

      this.addEventListener(
        "loadend",
        () => {
          const responseContentType = this.getResponseHeader("content-type") || null;
          const event: XHRObserverEvent = {
            ...info,
            status: this.status,
            durationMs: Math.round(performance.now() - start),
            responseContentType,
            body: null,
            truncated: false,
            ...(this.status === 0 ? { error: "Network error or aborted XHR" } : {}),
          };

          const limit = getEffectiveLimit();
          try {
            if (
              limit > 0 &&
              (this.responseType === "" || this.responseType === "text") &&
              responseContentType &&
              TEXT_CONTENT_RE.test(responseContentType)
            ) {
              const raw = String(this.responseText);
              event.body = raw.slice(0, limit);
              event.truncated = raw.length > limit;
            } else if (limit > 0 && this.responseType === "json" && this.response !== null) {
              const serialized = JSON.stringify(this.response);
              event.body = serialized.slice(0, limit);
              event.truncated = serialized.length > limit;
            }
          } catch {
            /* Ignore opaque, binary, and inaccessible responses. */
          }

          for (const listener of [...listeners]) {
            try {
              if (listener.maxBodyCharacters <= 0) {
                listener.callback({ ...event, body: null, truncated: false });
              } else {
                listener.callback({
                  ...event,
                  body: event.body ? event.body.slice(0, listener.maxBodyCharacters) : event.body,
                });
              }
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

  const listenerEntry: XHRListenerEntry = { callback, maxBodyCharacters };
  entry.listeners.add(listenerEntry);

  const off = () => {
    entry!.listeners.delete(listenerEntry);
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
