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

export function captureDiagnostic(error: unknown, source: string, script: string, host: Window = window): void {
  try {
    getDiagnostics(host)?.capture(error, source, script);
  } catch {
    // Diagnostics must never prevent application cleanup or navigation.
  }
}
