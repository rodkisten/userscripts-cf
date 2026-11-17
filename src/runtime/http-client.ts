export interface HttpClientOptions {
  host?: Window & typeof globalThis;
  signal?: AbortSignal;
  storage?: {
    get(key: string, fallback?: unknown): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  namespace?: string;
  ttlMs?: number;
  maxEntries?: number;
}

export interface HttpRequestOptions extends RequestInit {
  timeoutMs?: number;
  transport?: "auto" | "gm" | "fetch";
  cacheMode?: "on" | "off";
  ttlMs?: number;
}

export interface HttpClientStats {
  hits: number;
  misses: number;
  requests: number;
}

export interface HttpClient {
  request(url: RequestInfo | URL, options?: HttpRequestOptions): Promise<Response>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  json<T = unknown>(url: RequestInfo | URL, options?: HttpRequestOptions): Promise<T>;
  text(url: RequestInfo | URL, options?: HttpRequestOptions): Promise<string>;
  invalidate(): void;
  readonly stats: HttpClientStats;
  dispose(): void;
}

interface GMRequestDetails {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  data?: BodyInit | null;
  responseType?: "arraybuffer" | "blob" | "json" | "text";
  timeout?: number;
  onload?: (response: {
    status: number;
    statusText: string;
    responseHeaders?: string;
    response: ArrayBuffer;
  }) => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  [key: string]: unknown;
}

interface GMRequestHandle {
  abort?: () => void;
}

type GMXhrFn = (details: GMRequestDetails) => GMRequestHandle;

interface CacheEntry {
  response: Response;
  expires: number;
}

// Central transport boundary for userscripts. Never patch global fetch or XMLHttpRequest.
export function createHttpClient({
  host = window,
  signal,
  storage: _storage,
  namespace: _namespace = "runtime",
  ttlMs = 60_000,
  maxEntries = 200,
}: HttpClientOptions = {}): HttpClient {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<Response>>();
  const stats: HttpClientStats = { hits: 0, misses: 0, requests: 0 };

  const hostGM = (host as Window & { GM?: { xmlHttpRequest?: GMXhrFn } }).GM;
  const gm: GMXhrFn | undefined =
    hostGM?.xmlHttpRequest?.bind(hostGM) ??
    (host as Window & { GM_xmlhttpRequest?: GMXhrFn }).GM_xmlhttpRequest;

  const abortError = () => new DOMException("Aborted", "AbortError");

  const keyFor = (url: string, options: HttpRequestOptions): string =>
    JSON.stringify([
      url,
      (options.method ?? "GET").toUpperCase(),
      options.credentials ?? "same-origin",
      [...new Headers(options.headers ?? {}).entries()].sort(),
    ]);

  function gmFetch(url: string, options: HttpRequestOptions): Promise<Response> {
    if (!gm) throw new Error("GM transport unavailable: check @grant and @connect");
    return new Promise((resolve, reject) => {
      let done = false;
      let handle: GMRequestHandle | undefined;

      const stop = () => {
        handle?.abort?.();
        finish(reject, abortError());
      };

      function finish<T extends Response | Error>(fn: (value: T) => void, value: T): void {
        if (done) return;
        done = true;
        options.signal?.removeEventListener("abort", stop);
        fn(value);
      }

      if (options.signal?.aborted) return reject(abortError());
      options.signal?.addEventListener("abort", stop, { once: true });

      try {
        handle = gm({
          url,
          method: options.method ?? "GET",
          headers: Object.fromEntries(new Headers(options.headers ?? {})),
          data: options.body,
          responseType: "arraybuffer",
          timeout: options.timeoutMs,
          onload: (response) => {
            const headers = new Headers();
            for (const line of String(response.responseHeaders ?? "").split(/\r?\n/)) {
              const i = line.indexOf(":");
              if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
            }
            const status = Number(response.status);
            if (status < 200 || status > 599) {
              return finish(reject, new TypeError("Invalid GM HTTP status: " + status));
            }
            const body =
              options.method?.toUpperCase() === "HEAD" || status === 204 || status === 205 || status === 304
                ? null
                : response.response;
            finish(resolve, new Response(body, { status, statusText: response.statusText, headers }));
          },
          onerror: () => finish(reject, new TypeError("GM request failed")),
          ontimeout: () => finish(reject, new DOMException("Request timed out", "TimeoutError")),
          onabort: () => finish(reject, abortError()),
        });
      } catch (error) {
        finish(reject, error as Error);
      }
    });
  }

  async function request(url: RequestInfo | URL, options: HttpRequestOptions = {}): Promise<Response> {
    const method = (options.method ?? "GET").toUpperCase();
    const urlString = String(url);
    const key = keyFor(urlString, options);

    const useCache =
      method === "GET" &&
      !options.signal &&
      !signal &&
      options.cacheMode !== "off" &&
      !new Headers(options.headers ?? {}).has("authorization") &&
      options.credentials !== "include";

    const now = Date.now();
    if (useCache) {
      const hit = cache.get(key);
      if (hit && hit.expires > now) {
        stats.hits++;
        cache.delete(key);
        cache.set(key, hit);
        return hit.response.clone();
      }
      cache.delete(key);
    }

    stats.misses++;
    if (useCache && pending.has(key)) return (await pending.get(key)!).clone();

    const run = async (): Promise<Response> => {
      stats.requests++;
      const controller = new AbortController();
      const cancel = () => controller.abort();

      signal?.addEventListener("abort", cancel, { once: true });
      options.signal?.addEventListener("abort", cancel, { once: true });

      let timer: ReturnType<typeof setTimeout> | undefined;
      if (options.timeoutMs) timer = setTimeout(cancel, options.timeoutMs);

      try {
        if (controller.signal.aborted) throw abortError();
        const transport = options.transport ?? "auto";
        const opts: HttpRequestOptions = { ...options, signal: controller.signal };

        const response =
          transport === "gm" ||
          (transport === "auto" &&
            gm &&
            new URL(urlString, host.location?.href ?? "https://localhost/").origin !==
              (host.location?.origin ?? "https://localhost"))
            ? await gmFetch(urlString, opts)
            : await host.fetch(urlString, opts);

        if (
          useCache &&
          response.ok &&
          !/no-store|private/i.test(response.headers.get("cache-control") ?? "") &&
          maxEntries > 0
        ) {
          cache.set(key, { response: response.clone(), expires: Date.now() + (options.ttlMs ?? ttlMs) });
          while (cache.size > maxEntries) {
            const firstKey = cache.keys().next().value;
            if (firstKey !== undefined) cache.delete(firstKey);
            else break;
          }
        }
        return response;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        options.signal?.removeEventListener("abort", cancel);
      }
    };

    // Shared requests must not be cancelled by an individual consumer.
    const task = run();
    if (useCache) pending.set(key, task);

    try {
      return (await task).clone();
    } finally {
      if (pending.get(key) === task) pending.delete(key);
    }
  }

  return Object.freeze({
    request,
    fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
      // Keep the native RequestInfo/URL + RequestInit contract, including
      // inherited headers, credentials, body and AbortSignal from Request.
      const isRequest = typeof Request !== "undefined" && input instanceof Request;
      if (!isRequest) return request(input, { ...init, cacheMode: "off" });

      const merged = new Request(input, init);
      return request(merged.url, {
        method: merged.method,
        headers: merged.headers,
        body: /^(GET|HEAD)$/i.test(merged.method) ? undefined : merged.body,
        credentials: merged.credentials,
        signal: merged.signal,
        redirect: merged.redirect,
        mode: merged.mode,
        referrer: merged.referrer,
        referrerPolicy: merged.referrerPolicy,
        integrity: merged.integrity,
        keepalive: merged.keepalive,
        cacheMode: "off",
      });
    },
    async json<T = unknown>(url: RequestInfo | URL, options?: HttpRequestOptions): Promise<T> {
      const r = await request(url, options);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json() as Promise<T>;
    },
    async text(url: RequestInfo | URL, options?: HttpRequestOptions): Promise<string> {
      const r = await request(url, options);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    },
    invalidate() {
      cache.clear();
    },
    stats,
    dispose() {
      cache.clear();
      pending.clear();
    },
  });
}
