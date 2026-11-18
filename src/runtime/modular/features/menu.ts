import { openRadixDialog, openRadixDropdown } from "./menu-view.js";
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
export function createMenuFeature() {
  return menu;
}
