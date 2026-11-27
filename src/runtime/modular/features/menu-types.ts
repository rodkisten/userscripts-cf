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

