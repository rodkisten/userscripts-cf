import { createSignal, For } from 'solid-js';
import type { AnyRecord, RodMenuHandle, RodMenuSchema } from '../types';
import { Surface } from './Surface';
import '../styles/tokens.css';

interface ActiveSurfaceEntry {
  id: string;
  schema: RodMenuSchema<any>;
  onCreated: (handle: RodMenuHandle<any>) => void;
}

const [surfaces, setSurfaces] = createSignal<ActiveSurfaceEntry[]>([]);
let idCounter = 0;

export function spawnSurface<TValues extends AnyRecord = AnyRecord>(
  schema: RodMenuSchema<TValues>,
): RodMenuHandle<TValues> {
  idCounter += 1;
  const id = schema.id || `rod-menu-${Date.now().toString(36)}-${idCounter.toString(36)}`;
  let capturedHandle!: RodMenuHandle<TValues>;

  setSurfaces((prev) => [
    ...prev.filter((item) => item.id !== id),
    {
      id,
      schema,
      onCreated: (h) => {
        capturedHandle = h;
      },
    },
  ]);

  if (!capturedHandle) {
    throw new Error(`[RodMenu] Surface ${id} was not initialized synchronously`);
  }
  return capturedHandle;
}

export function closeAllSurfaces() {
  for (const item of surfaces()) {
    try {
      // Unmount triggers cleanup
      setSurfaces((prev) => prev.filter((s) => s.id !== item.id));
    } catch {}
  }
}

export function RodMenuHost() {
  return (
    <For each={surfaces()}>
      {(entry) => (
        <Surface
          id={entry.id}
          initialSchema={entry.schema}
          onCreated={entry.onCreated}
          onDestroy={(id) => setSurfaces((prev) => prev.filter((s) => s.id !== id))}
        />
      )}
    </For>
  );
}
