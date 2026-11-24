import { openRadixDialog, openRadixDropdown } from "./menu-view.js";
import type { ReactElement } from "react";
export interface DropdownItem {
  /** Stable item identity for React reconciliation across menu updates. */
  id?: string;
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
  disabled?: boolean;
  label?: string;
  type?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  searchable?: boolean;
  value?: unknown;
  render?: () => unknown;
}
export interface MenuAction {
  id: string;
  label: string;
  variant?: string;
  role?: "cancel" | "submit" | string;
  close?: boolean;
  disabled?: boolean;
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
  tabs?: { id: string; label: string; fields: MenuField[] }[];
  actions?: MenuAction[];
  initialValues?: Record<string, unknown>;
}

export interface MenuFeatureOptions {
  /** Lazy so the instance ShadowRoot is created only when a menu opens. */
  container?: () => ShadowRoot | HTMLElement;
  /** The owning ScriptContext registers every menu handle for disposal. */
  onDispose?: (cleanup: () => void) => void;
  mountSharedReact: (component: ReactElement, container: HTMLElement) => { dispose: () => void };
}

export function createMenuFeature(options: MenuFeatureOptions) {
  const own = <T extends { close: () => void; dispose: () => void }>(handle: T): T => {
    options.onDispose?.(handle.dispose);
    return handle;
  };

  const feature: {
    open(schema: MenuSchema): ReturnType<typeof openRadixDialog>;
    dropdown(dropdownOptions: DropdownOptions): ReturnType<typeof openRadixDropdown>;
    configure(options?: Record<string, unknown>): typeof feature;
  } = {
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
    configure: (_options?: Record<string, unknown>) => feature,
  };
  return Object.freeze(feature);
}
