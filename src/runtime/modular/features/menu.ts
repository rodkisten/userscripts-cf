import React from "react";
import { createRoot } from "react-dom/client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";

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

/** Imperative ctx.menu bridge using official Radix DropdownMenu components. */
export function openRadixDropdown(options: DropdownOptions) {
  const owner = options.trigger.ownerDocument;
  const host = owner.createElement("div");
  host.dataset.rodRadixDropdown = options.id ?? "";
  owner.body.append(host);
  const root = createRoot(host);
  let disposed = false;
  const close = () => {
    if (disposed) return;
    disposed = true;
    root.unmount();
    host.remove();
  };
  const renderItems = (items: DropdownItem[]): React.ReactNode[] =>
    items.map((item, index) => {
      const key = String(index);
      if (item.type === "separator") return React.createElement(DropdownMenu.Separator, { key });
      if (item.children?.length) {
        return React.createElement(DropdownMenu.Sub, { key },
          React.createElement(DropdownMenu.SubTrigger, { disabled: item.disabled }, item.label),
          React.createElement(DropdownMenu.Portal, null,
            React.createElement(DropdownMenu.SubContent, { sideOffset: 4 }, renderItems(item.children))));
      }
      if (item.type === "checkbox") {
        return React.createElement(DropdownMenu.CheckboxItem, {
          key, disabled: item.disabled, checked: Boolean(item.checked),
          onCheckedChange: (checked: boolean | "indeterminate") => item.onCheckedChange?.(checked === true),
        }, item.label);
      }
      return React.createElement(DropdownMenu.Item, {
        key, disabled: item.disabled, onSelect: () => item.onSelect?.(),
      }, item.label);
    });
  root.render(React.createElement(DropdownMenu.Root, {
    defaultOpen: true,
    onOpenChange: (open: boolean) => { if (!open) queueMicrotask(close); },
  },
  React.createElement(DropdownMenu.Trigger, { asChild: true },
    React.createElement("button", {
      type: "button",
      style: { position: "fixed", left: options.trigger.getBoundingClientRect().left, top: options.trigger.getBoundingClientRect().bottom, width: 1, height: 1, opacity: 0, pointerEvents: "none" },
      "aria-label": "Menu",
    })),
  React.createElement(DropdownMenu.Portal, null,
    React.createElement(DropdownMenu.Content, {
      align: options.align ?? "start", sideOffset: 4,
      style: { zIndex: 2147483647, minWidth: 180, borderRadius: 10, padding: 6, background: "var(--popover, #18181b)", color: "var(--popover-foreground, #fafafa)", boxShadow: "0 8px 32px #0004" },
    }, renderItems(options.items)))));
  return { close, dispose: close };
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
  description?: string;
  fields?: MenuField[];
  actions?: MenuAction[];
  initialValues?: Record<string, unknown>;
}

/** Imperative dialog facade composed from upstream Radix primitives. */
export function openRadixDialog(schema: MenuSchema) {
  const host = document.createElement("div");
  host.dataset.rodRadixDialog = schema.id ?? "";
  document.body.append(host);
  const root = createRoot(host);
  const values: Record<string, unknown> = { ...schema.initialValues };
  let disposed = false;
  const close = () => {
    if (disposed) return;
    disposed = true;
    root.unmount();
    host.remove();
  };
  const fields = (schema.fields ?? []).map((field) =>
    React.createElement("label", { key: field.name, style: { display: "grid", gap: 6, marginTop: 12 } },
      field.label ?? field.name,
      field.type === "select"
        ? React.createElement("select", {
            defaultValue: String(values[field.name] ?? ""),
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => { values[field.name] = event.target.value; },
          }, React.createElement("option", { value: "" }, "Selecionar"),
          ...(field.options ?? []).map((option) => React.createElement("option", { key: option.value, value: option.value }, option.label)))
        : React.createElement("input", {
            type: field.type === "search" ? "search" : "text",
            placeholder: field.placeholder,
            defaultValue: String(values[field.name] ?? ""),
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => { values[field.name] = event.target.value; },
          })));
  const actions = (schema.actions ?? []).map((action) => React.createElement("button", {
    key: action.id,
    type: "button",
    onClick: () => { void Promise.resolve(action.handler?.({ values, close })).then((result) => { if (result !== false) close(); }); },
  }, action.label));
  root.render(React.createElement(Dialog.Root, { defaultOpen: true, onOpenChange: (open: boolean) => { if (!open) queueMicrotask(close); } },
    React.createElement(Dialog.Portal, null,
      React.createElement(Dialog.Overlay, { style: { position: "fixed", inset: 0, zIndex: 2147483646, background: "#0009" } }),
      React.createElement(Dialog.Content, {
        "aria-describedby": schema.description ? undefined : undefined,
        style: { position: "fixed", zIndex: 2147483647, left: "50%", bottom: 16, transform: "translateX(-50%)", width: "min(95vw, 540px)", maxHeight: "85dvh", overflow: "auto", borderRadius: 16, padding: 20, background: "#18181b", color: "#fafafa" },
      },
        React.createElement(Dialog.Title, null, schema.title ?? "Menu"),
        schema.description ? React.createElement(Dialog.Description, null, schema.description) : null,
        ...fields,
        React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 } }, ...actions),
        React.createElement(Dialog.Close, { asChild: true }, React.createElement("button", { type: "button" }, "Fechar"))))));
  return { close, dispose: close };
}

export const menu = Object.freeze({
  open: openRadixDialog,
  dropdown: openRadixDropdown,
  configure: (_options?: Record<string, unknown>) => menu,
});
export function createMenuFeature() { return menu; }
