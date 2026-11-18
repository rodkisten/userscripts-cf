import React from "react";
import { createRoot } from "react-dom/client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

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

export const menu = Object.freeze({
  dropdown: openRadixDropdown,
  configure: (_options?: Record<string, unknown>) => menu,
});
export function createMenuFeature() { return menu; }
