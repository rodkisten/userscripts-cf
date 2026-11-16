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
};

type DiagnosticRegistry = {
  history: DiagnosticRecord[];
  capture(error: unknown, source?: string, owner?: string | null): void;
  export(): string;
  clear(): void;
};

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
): () => void {
  const capture = (kind: "fetch" | "xhr", event: { url: string; status?: number; error?: string }) => {
    if (!event.error && !(event.status && event.status >= 500)) return;
    let location = "[unavailable]";
    try {
      const url = new URL(event.url, host.location.href);
      location = url.origin + url.pathname;
    } catch {}
    const message = event.error ? "Network failure" : `HTTP ${event.status}`;
    captureDiagnostic(new Error(`${message} (${kind}) at ${location}`), `network.${kind}`, "unknown", host);
  };
  const stopFetch = observePageFetch((event) => capture("fetch", event), {
    host,
    signal,
    maxBodyCharacters: 0,
  });
  const stopXHR = observePageXHR((event) => capture("xhr", event), {
    host,
    signal,
    maxBodyCharacters: 0,
  });
  return () => {
    stopFetch();
    stopXHR();
  };
}
