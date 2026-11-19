import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { RodMenu as RodMenuView } from "./Menu";
import type { MenuSchema } from "./types";

/**
 * A single React host owns all imperative menus. Mount <RodMenuHost /> once
 * inside the application root; callers use RodMenu.open() without creating roots.
 */
type MenuEntry = { schema: MenuSchema; token: number };
let current: MenuEntry | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => current;
const serverSnapshot = (): MenuEntry | null => null;

export const RodMenu = {
  open(schema: MenuSchema) {
    const token = ++sequence;
    current = { schema, token };
    emit();
    return { close: () => RodMenu.close(token) };
  },
  close(token?: number) {
    if (!current || (token !== undefined && current.token !== token)) return;
    current = null;
    emit();
  },
  get active() { return current?.schema ?? null; },
};

export function RodMenuHost({ container }: { container?: Element | DocumentFragment | null }) {
  const entry = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!entry) return null;
  const view = (
    <RodMenuView
      key={entry.token}
      schema={entry.schema}
      isOpen
      onClose={() => RodMenu.close(entry.token)}
    />
  );
  const target = container ?? (typeof document !== "undefined" ? document.body : null);
  return target ? createPortal(view, target) : view;
}

export { RodMenuView };
export type { MenuSchema } from "./types";
