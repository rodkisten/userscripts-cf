import { openRadixDialog, openRadixDropdown } from "./menu-view.js";
import type { ReactElement } from "react";
export interface DropdownItem {
  label?: string;
  type?: "item" | "separator" | "checkbox";
  disabled?: boolean;
  checked?: boolean;
  children?: DropdownItem[];
  onSelect?: () => unknown;
  onCheckedChange?: (checked: boolean) => unknown;
}
export interface DropdownOptions {
  container?: ShadowRoot | HTMLElement;
  id?: string;
  trigger: HTMLElement;
  items: DropdownItem[];
  align?: "start" | "end";
}

export interface MenuField {
  name: string;
  label?: string;
  type?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  searchable?: boolean;
}
export interface MenuAction {
  id: string;
  label: string;
  variant?: string;
  handler?: (context: { values: Record<string, unknown>; close: () => void }) => unknown;
}
export interface MenuSchema {
  /** Optional script-owned ShadowRoot or host for the Radix dialog portal. */
  container?: ShadowRoot | HTMLElement;
  id?: string;
  title?: string;
  presentation?: "bottom-sheet" | "dialog" | "popover" | string;
  size?: string;
  description?: string;
  fields?: MenuField[];
  actions?: MenuAction[];
  initialValues?: Record<string, unknown>;
}

export const menu = Object.freeze({
  open: openRadixDialog,
  dropdown: openRadixDropdown,
  configure: (_options?: Record<string, unknown>) => menu,
});
export interface MenuFeatureOptions {
  /** Lazy so the instance ShadowRoot is created only when a menu opens. */
  container?: () => ShadowRoot | HTMLElement;
  /** The owning ScriptContext registers every menu handle for disposal. */
  onDispose?: (cleanup: () => void) => void;
  mountSharedReact?: (component: ReactElement, container: HTMLElement) => { dispose: () => void };
}

export function createMenuFeature(options: MenuFeatureOptions = {}) {
  if (!options.container && !options.onDispose && !options.mountSharedReact) return menu;

  const own = <T extends { close: () => void; dispose: () => void }>(handle: T): T => {
    options.onDispose?.(handle.dispose);
    return handle;
  };

  return Object.freeze({
    open(schema: MenuSchema) {
      return own(
        openRadixDialog(
          {
            ...schema,
            container: schema.container ?? options.container?.(),
          },
          options.mountSharedReact,
        ),
      );
    },
    dropdown(dropdownOptions: DropdownOptions) {
      return own(
        openRadixDropdown(
          {
            ...dropdownOptions,
            container: dropdownOptions.container ?? options.container?.(),
          },
          options.mountSharedReact,
        ),
      );
    },
    configure: menu.configure,
  });
}
