import { observePageFetch, observePageXHR } from "./network-interceptors.js";
export type DiagnosticRecord = {
  fingerprint: string;
  script: string;
  source: string;
  message: string;
  stack: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  url?: string;
  request?: unknown;
  response?: unknown;
  scripts?: string[];
};

type DiagnosticRegistry = {
  history: DiagnosticRecord[];
  capture(error: unknown, source?: string, owner?: string | null): void;
  export(): string;
  clear(): void;
};

type NetworkObservation = { refs: number; stop: () => void };
const networkObservations = new WeakMap<Window & typeof globalThis, NetworkObservation>();

export function getDiagnostics(host: Window = window): DiagnosticRegistry | undefined {
  // Keep the same realm as the injected build prelude. Never assume that a
  // page-global registry is reachable from a Tampermonkey isolated world.
  return (host as Window & { __rodScriptDiagnosticsV1?: DiagnosticRegistry }).__rodScriptDiagnosticsV1;
}

export function captureDiagnostic(
  error: unknown,
  source: string,
  script: string,
  host: Window = window,
): void {
  try {
    getDiagnostics(host)?.capture(error, source, script);
  } catch {
    // Diagnostics must never prevent application cleanup or navigation.
  }
}

/**
 * Opt-in network failure telemetry. Observes only metadata, never request or
 * response bodies, and never claims a page request belongs to a userscript.
 */
export function observeNetworkDiagnostics(
  host: Window & typeof globalThis = window,
  signal?: AbortSignal,
  owner?: string | readonly string[],
): () => void {
  const existing = networkObservations.get(host);
  if (existing) {
    existing.refs++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (--existing.refs === 0) {
        existing.stop();
        networkObservations.delete(host);
      }
    };
    if (signal?.aborted) release();
    else signal?.addEventListener("abort", release, { once: true });
    return release;
  }
  const capture = (
    kind: "fetch" | "xhr",
    event: {
      url: string;
      method?: string;
      status?: number;
      error?: string;
      durationMs?: number;
      requestBody?: string | null;
      body?: string | null;
      requestContentType?: string | null;
      responseContentType?: string | null;
      requestTruncated?: boolean;
      truncated?: boolean;
    },
  ) => {
    if (!event.error && !(event.status && event.status >= 400)) return;
    if (event.url.includes("manage.migos.club/error/capture")) return;
    let location = "[unavailable]";
    try {
      const url = new URL(event.url, host.location.href);
      location = url.origin + url.pathname;
    } catch {}
    const message = event.error ? "Network failure" : `HTTP ${event.status}`;
    const diagnostic = new Error(`${message} (${kind}) at ${location}`);
    Object.assign(diagnostic, {
      request: {
        url: location,
        method: event.method || "GET",
        contentType: event.requestContentType || null,
        body: event.requestBody || null,
        truncated: Boolean(event.requestTruncated),
      },
      response: {
        status: event.status || null,
        contentType: event.responseContentType || null,
        durationMs: event.durationMs || null,
        body: event.body || null,
        error: event.error || null,
        truncated: Boolean(event.truncated),
      },
    });
    const owners = Array.isArray(owner) ? owner : owner ? [owner] : ["unknown"];
    captureDiagnostic(diagnostic, `network.${kind}`, owners.join(","), host);
  };
  const stopFetch = observePageFetch((event) => capture("fetch", event), {
    host,
    signal,
    maxBodyCharacters: 2000,
  });
  const stopXHR = observePageXHR((event) => capture("xhr", event), {
    host,
    signal,
    maxBodyCharacters: 2000,
  });
  const observation: NetworkObservation = {
    refs: 1,
    stop: () => {
      stopFetch();
      stopXHR();
    },
  };
  networkObservations.set(host, observation);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    signal?.removeEventListener("abort", release);
    if (--observation.refs === 0) {
      observation.stop();
      networkObservations.delete(host);
    }
  };
  if (signal?.aborted) release();
  else signal?.addEventListener("abort", release, { once: true });
  return release;
}
