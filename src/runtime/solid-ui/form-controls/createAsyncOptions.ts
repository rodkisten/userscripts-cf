import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import { QueryClient, QueryObserver } from '@tanstack/query-core';
import { normalizeOptions, type ControlOption, type OptionsSource } from './options';

export interface AsyncOptionsState {
  options: Accessor<ControlOption[]>;
  loading: Accessor<boolean>;
  error: Accessor<unknown | null>;
  reload: () => Promise<void>;
}

export interface AsyncOptionsConfig {
  queryClient?: QueryClient;
  queryKey?: readonly unknown[];
  staleTime?: number;
  enabled?: Accessor<boolean>;
}

/**
 * TanStack Query core adapter for SolidJS 2.
 * Uses QueryObserver rather than the Solid 1 adapter; consumers may share a
 * QueryClient to reuse cached suggestions across fields and menus.
 */
export function createAsyncOptions(
  source: Accessor<OptionsSource>,
  query: Accessor<string>,
  config: AsyncOptionsConfig = {},
): AsyncOptionsState {
  const ownedClient = !config.queryClient;
  const client = config.queryClient ?? new QueryClient({
    defaultOptions: { queries: { retry: 1, gcTime: 5 * 60_000 } },
  });
  const [options, setOptions] = createSignal<ControlOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<unknown | null>(null);
  let observer: QueryObserver<ControlOption[]> | undefined;
  let unsubscribe: (() => void) | undefined;
  let revision = 0;

  createEffect(() => {
    const currentSource = source();
    const currentQuery = query();
    const enabled = config.enabled?.() ?? true;
    const current = ++revision;
    unsubscribe?.();
    observer?.destroy();
    observer = new QueryObserver<ControlOption[]>(client, {
      queryKey: [...(config.queryKey ?? ['form-controls', 'suggestions']), currentQuery],
      enabled,
      staleTime: config.staleTime ?? 30_000,
      queryFn: async ({ signal }) => {
        const result = typeof currentSource === 'function'
          ? await currentSource(currentQuery, { signal })
          : currentSource;
        return normalizeOptions(result);
      },
    });
    unsubscribe = observer.subscribe((result) => {
      if (current !== revision) return;
      setOptions(result.data ?? []);
      setLoading(result.isPending && result.fetchStatus === 'fetching');
      setError(result.error ?? null);
    });
  });

  onCleanup(() => {
    revision++;
    unsubscribe?.();
    observer?.destroy();
    if (ownedClient) client.clear();
  });

  return {
    options,
    loading,
    error,
    reload: async () => {
      await observer?.refetch();
    },
  };
}
