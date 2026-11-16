import { QueryClient } from "@tanstack/query-core";

/**
 * Shared cache for controls within one bundled runtime module.
 * Callers can still inject a client for tests or isolated scopes.
 * Do not clear this client when an individual control unmounts.
 */
let sharedClient: QueryClient | undefined;

export function getFormControlsQueryClient(): QueryClient {
  return (sharedClient ??= new QueryClient({
    defaultOptions: { queries: { retry: 1, gcTime: 5 * 60_000 } },
  }));
}

/** Explicitly release the shared cache when disposing the owning runtime. */
export function disposeFormControlsQueryClient(): void {
  sharedClient?.clear();
  sharedClient = undefined;
}
