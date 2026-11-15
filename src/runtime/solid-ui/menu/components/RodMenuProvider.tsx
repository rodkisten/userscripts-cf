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
const activeHandles = new Map<string, RodMenuHandle<any>>();
let idCounter = 0;

export function spawnSurface<TValues extends AnyRecord = AnyRecord>(
  schema: RodMenuSchema<TValues>,
): RodMenuHandle<TValues> {
  idCounter += 1;
  const id = schema.id || `rod-menu-${Date.now().toString(36)}-${idCounter.toString(36)}`;
  // Close an existing instance before replacing its keyed Solid component.
  activeHandles.get(id)?.close();
  let capturedHandle: RodMenuHandle<TValues> | undefined;

  setSurfaces((prev) => [
    ...prev.filter((item) => item.id !== id),
    {
      id,
      schema,
      onCreated: (h) => {
        capturedHandle = h;
        activeHandles.set(id, h);
      },
    },
  ]);

  if (!capturedHandle) {
    setSurfaces((prev) => prev.filter((item) => item.id !== id));
    throw new Error(`[RodMenu] Surface ${id} was not initialized synchronously`);
  }
  return capturedHandle;
}

export function closeAllSurfaces() {
  for (const handle of [...activeHandles.values()]) handle.close();
}

export function RodMenuHost() {
  return (
    <For each={surfaces()}>
      {(entry) => (
        <Surface
          id={entry.id}
          initialSchema={entry.schema}
          onCreated={entry.onCreated}
          onDestroy={(id) => {
            // A previous instance may finish its exit animation after a new
            // instance with the same ID has mounted. Never delete the newer one.
            const current = surfaces().find((item) => item.id === id);
            if (current !== entry) return;
            activeHandles.delete(id);
            setSurfaces((prev) => prev.filter((s) => s !== entry));
          }}
        />
      )}
    </For>
  );
}
