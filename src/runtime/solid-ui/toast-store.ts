import { createStore, reconcile } from "solid-js/store";

export type ToastKind = "info" | "success" | "warning" | "error" | "debug";
export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
  duration: number;
  createdAt: number;
}
const [state, setState] = createStore<{ items: ToastItem[] }>({ items: [] });
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let nextId = 0;

export const toastState = state;
export const toastActions = {
  show(message: string, options: Partial<Pick<ToastItem, "id" | "kind" | "duration">> = {}) {
    const id = options.id ?? `toast-${++nextId}`;
    const item: ToastItem = {
      id,
      message: String(message),
      kind: options.kind ?? "info",
      duration: options.duration ?? 4000,
      createdAt: Date.now(),
    };
    clearTimeout(timers.get(id));
    setState("items", (items) => {
      const index = items.findIndex((entry) => entry.id === id);
      if (index < 0) return [...items, item];
      return items.map((entry) => (entry.id === id ? item : entry));
    });
    if (item.duration > 0) timers.set(id, setTimeout(() => toastActions.dismiss(id), item.duration));
    return id;
  },
  dismiss(id: string) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    setState("items", (items) => items.filter((item) => item.id !== id));
  },
  clear() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    setState("items", reconcile([]));
  },
};
