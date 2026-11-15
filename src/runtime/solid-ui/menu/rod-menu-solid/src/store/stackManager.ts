import { createSignal } from 'solid-js';
import type { RodMenuHandle } from '../types';

export interface StackEntry {
  id: string;
  handle: RodMenuHandle<any>;
  focus: () => void;
}

const [stackSignal, setStackSignal] = createSignal<StackEntry[]>([]);

export function useSurfaceStack() {
  return stackSignal;
}

export function registerSurface(entry: StackEntry) {
  setStackSignal((prev) => [...prev.filter((item) => item.id !== entry.id), entry]);
}

export function unregisterSurface(id: string) {
  setStackSignal((prev) => {
    const next = prev.filter((item) => item.id !== id);
    if (next.length > 0 && prev[prev.length - 1]?.id === id) {
      queueMicrotask(() => next[next.length - 1]?.focus());
    }
    return next;
  });
}

export function activateSurface(id: string): boolean {
  const current = stackSignal();
  const idx = current.findIndex((item) => item.id === id);
  if (idx < 0) return false;
  if (idx !== current.length - 1) {
    const target = current[idx];
    setStackSignal([...current.slice(0, idx), ...current.slice(idx + 1), target]);
  }
  queueMicrotask(() => current[idx].focus());
  return true;
}

export function activatePreviousSurface(id: string): boolean {
  const current = stackSignal();
  const idx = current.findIndex((item) => item.id === id);
  if (idx <= 0) return false;
  return activateSurface(current[idx - 1].id);
}

export function getHandleById(id: string): RodMenuHandle<any> | undefined {
  return stackSignal().find((item) => item.id === id)?.handle;
}

export function getAllHandles(): readonly RodMenuHandle<any>[] {
  return stackSignal().map((item) => item.handle);
}
