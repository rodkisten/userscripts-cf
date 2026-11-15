import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import { createOptionsLoader, normalizeOptions, type ControlOption, type OptionsSource } from './options';

export interface AsyncOptionsState {
  options: Accessor<ControlOption[]>;
  loading: Accessor<boolean>;
  error: Accessor<unknown | null>;
  reload: () => Promise<void>;
}

/**
 * SolidJS adapter for the headless options loader.
 * Cancels superseded requests, prevents stale results and cleans up on unmount.
 */
export function createAsyncOptions(
  source: Accessor<OptionsSource>,
  query: Accessor<string>,
): AsyncOptionsState {
  const [options, setOptions] = createSignal<ControlOption[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<unknown | null>(null);
  let loader = createOptionsLoader(source());
  let revision = 0;

  const reload = async () => {
    const current = ++revision;
    setLoading(true);
    setError(null);
    try {
      const next = await loader.load(query());
      if (current === revision) setOptions(normalizeOptions(next));
    } catch (reason) {
      if (current === revision) {
        setOptions([]);
        setError(reason);
      }
    } finally {
      if (current === revision) setLoading(false);
    }
  };

  createEffect(() => {
    const currentSource = source();
    query();
    loader.dispose();
    loader = createOptionsLoader(currentSource);
    void reload();
  });
  onCleanup(() => { revision++; loader.dispose(); });
  return { options, loading, error, reload };
}
