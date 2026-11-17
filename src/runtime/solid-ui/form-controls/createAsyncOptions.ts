import { createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { QueryObserver } from "@tanstack/query-core";
import type { QueryClient } from "@tanstack/query-core";
import { getFormControlsQueryClient } from "./query-client";
import { normalizeOptions, type ControlOption, type OptionsSource } from "./options";

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
  const client = config.queryClient ?? getFormControlsQueryClient();
  const [options, setOptions] = createSignal<ControlOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<unknown | null>(null);
  let observer: QueryObserver<ControlOption[]> | undefined;
  let unsubscribe: (() => void) | undefined;
  let revision = 0;
  const instanceKey = ["form-controls", "suggestions", Math.random().toString(36).slice(2)];

  // Solid 2 invokes components under untrack during rendering. createEffect
  // can access a missing effect scheduler there; a memo tracks dependencies
  // synchronously without requiring that scheduler.
  createMemo(() => {
    const currentSource = source();
    const currentQuery = query();
    const enabled = config.enabled?.() ?? true;
    const current = ++revision;
    untrack(() => {
      unsubscribe?.();
      observer?.destroy();
    });
    observer = new QueryObserver<ControlOption[]>(client, {
      queryKey: [...(config.queryKey ?? instanceKey), currentQuery],
      enabled,
      staleTime: config.staleTime ?? 30_000,
      queryFn: async ({ signal }) => {
        const result =
          typeof currentSource === "function" ? await currentSource(currentQuery, { signal }) : currentSource;
        return normalizeOptions(result);
      },
    });
    untrack(() => {
      unsubscribe = observer!.subscribe((result) => {
        if (current !== revision) return;
        setOptions(result.data ?? []);
        setLoading(result.isPending && result.fetchStatus === "fetching");
        setError(result.error ?? null);
      });
      const initial = observer!.getCurrentResult();
      setOptions(initial.data ?? []);
      setLoading(initial.isPending && initial.fetchStatus === "fetching");
      setError(initial.error ?? null);
    });
  });

  onCleanup(() => {
    revision++;
    unsubscribe?.();
    observer?.destroy();
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
