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
  request: (url: RequestInfo | URL, options?: RequestInit) => Promise<Response>;
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
  original: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const registries = new WeakMap<any, NetworkRegistry>();

export function createNetworkInterceptors(
  http: { request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> },
  { signal, onError = console.error }: NetworkInterceptorsConfig = {}
): NetworkInterceptors {
  let registry = registries.get(http);
  if (!registry) {
    registry = { requests: new Set(), responses: new Set(), original: http.request.bind(http) };
    registries.set(http, registry);
  }
  
  const owned = new Set<() => void>();

  function register(kind: "requests" | "responses", callback: InterceptorCallback, options: InterceptorOptions = {}): () => void {
    if (typeof callback !== "function") throw new TypeError("Interceptor must be a function");
    const item: RegistryItem = { 
      callback, 
      priority: options.priority ?? 0, 
      once: !!options.once, 
      match: options.match 
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
        const matches = typeof item.match === "function" 
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

  const request = async (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
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
  body?: string | null;
  truncated?: boolean;
  error?: string;
}

export interface FetchObserverOptions {
  host?: Window & typeof globalThis;
  signal?: AbortSignal;
  maxBodyCharacters?: number;
}

interface FetchRegistryEntry {
  original: typeof window.fetch;
  wrapped: typeof window.fetch;
  listeners: Set<(event: FetchObserverEvent) => void>;
}

const nativeFetchObservers = new WeakMap<Window & typeof globalThis, FetchRegistryEntry>();

export function observePageFetch(
  callback: (event: FetchObserverEvent) => void, 
  { host = window, signal, maxBodyCharacters = 120000 }: FetchObserverOptions = {}
): () => void {
  if (typeof callback !== "function") throw new TypeError("Expected network observer");
  if (typeof host.fetch !== "function") return () => {};
  
  let entry = nativeFetchObservers.get(host);
  if (!entry) {
    const original = host.fetch;
    const listeners = new Set<(event: FetchObserverEvent) => void>();
    
    const wrapped: typeof window.fetch = function (this: any, ...args: Parameters<typeof window.fetch>) {
      const start = Date.now();
      const request = args[0];
      const url = typeof request === "string" ? request : (request as Request)?.url || String(request);
      const method = (args[1] as RequestInit)?.method || (request as Request)?.method || "GET";
      const response = original.apply(this, args);
      
      Promise.resolve(response).then(async (result) => {
        const event: FetchObserverEvent = { 
          url, 
          method, 
          status: result.status, 
          durationMs: Date.now() - start, 
          responseUrl: result.url, 
          body: null, 
          truncated: false 
        };
        try {
          const type = result.headers?.get("content-type") || "";
          if (/json|text|xml|javascript|graphql|html/i.test(type)) {
            const body = await result.clone().text();
            event.body = body.slice(0, maxBodyCharacters);
            event.truncated = body.length > maxBodyCharacters;
          }
        } catch { /* Opaque, streaming and unreadable responses remain metadata-only. */ }
        
        for (const listener of [...listeners]) { 
          try { 
            listener(event); 
          } catch { /* Observer errors must not affect fetch. */ } 
        }
      }, (error) => {
        for (const listener of [...listeners]) { 
          try { 
            listener({ url, method, error: String(error), durationMs: Date.now() - start }); 
          } catch {} 
        }
      });
      
      return response;
    };
    
    host.fetch = wrapped;
    entry = { original, wrapped, listeners };
    nativeFetchObservers.set(host, entry);
  }
  
  entry.listeners.add(callback);
  
  const off = () => {
    entry!.listeners.delete(callback);
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
  { host = window, signal, maxBodyCharacters = 120000 }: XHRObserverOptions = {}
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
      
      this.addEventListener("loadend", () => {
        const event: XHRObserverEvent = { ...info, status: this.status, durationMs: Date.now() - start, body: null };
        try {
          const type = this.getResponseHeader("content-type") || "";
          if ((this.responseType === "" || this.responseType === "text") && /json|text|xml|javascript|graphql|html/i.test(type))
            event.body = String(this.responseText).slice(0, maxBodyCharacters);
          else if (this.responseType === "json") event.body = JSON.stringify(this.response).slice(0, maxBodyCharacters);
        } catch { /* Ignore opaque, binary, and inaccessible responses. */ }
        
        for (const listener of [...listeners]) { 
          try { 
            listener(event); 
          } catch {} 
        }
      }, { once: true });
      
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
