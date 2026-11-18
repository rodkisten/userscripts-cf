/** @jsxImportSource react */
import type * as React from "react";
import { createRoot } from "react-dom/client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import type { DropdownItem, DropdownOptions, MenuSchema, MenuField } from "./menu.js";

function DropdownItems({ items }: { items: DropdownItem[] }) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type === "separator") return <DropdownMenu.Separator key={index} />;
        if (item.children?.length)
          return (
            <DropdownMenu.Sub key={index}>
              <DropdownMenu.SubTrigger disabled={item.disabled}>{item.label}</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent sideOffset={4}>
                  <DropdownItems items={item.children} />
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          );
        if (item.type === "checkbox")
          return (
            <DropdownMenu.CheckboxItem
              key={index}
              disabled={item.disabled}
              checked={Boolean(item.checked)}
              onCheckedChange={(checked) => item.onCheckedChange?.(checked === true)}
            >
              {item.label}
            </DropdownMenu.CheckboxItem>
          );
        return (
          <DropdownMenu.Item key={index} disabled={item.disabled} onSelect={() => item.onSelect?.()}>
            {item.label}
          </DropdownMenu.Item>
        );
      })}
    </>
  );
}

function DropdownView({ options, close }: { options: DropdownOptions; close: () => void }) {
  const rect = options.trigger.getBoundingClientRect();
  return (
    <DropdownMenu.Root
      defaultOpen
      onOpenChange={(open) => {
        if (!open) queueMicrotask(close);
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Menu"
          style={{
            position: "fixed",
            left: rect.left,
            top: rect.bottom,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={options.align ?? "start"}
          sideOffset={4}
          style={{
            zIndex: 2147483647,
            minWidth: 180,
            borderRadius: 10,
            padding: 6,
            background: "var(--popover, #18181b)",
            color: "var(--popover-foreground, #fafafa)",
            boxShadow: "0 8px 32px #0004",
          }}
        >
          <DropdownItems items={options.items} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function DialogField({ field, values }: { field: MenuField; values: Record<string, unknown> }) {
  return (
    <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
      {field.label ?? field.name}
      {field.type === "select" ? (
        <select
          defaultValue={String(values[field.name] ?? "")}
          onChange={(event) => {
            values[field.name] = event.target.value;
          }}
        >
          <option value="">Selecionar</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "search" ? "search" : "text"}
          placeholder={field.placeholder}
          defaultValue={String(values[field.name] ?? "")}
          onChange={(event) => {
            values[field.name] = event.target.value;
          }}
        />
      )}
    </label>
  );
}

function DialogView({ schema, close }: { schema: MenuSchema; close: () => void }) {
  const values: Record<string, unknown> = { ...schema.initialValues };
  return (
    <Dialog.Root
      defaultOpen
      onOpenChange={(open) => {
        if (!open) queueMicrotask(close);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "#0009" }} />
        <Dialog.Content
          aria-describedby={schema.description ? undefined : undefined}
          style={{
            position: "fixed",
            zIndex: 2147483647,
            left: "50%",
            bottom: 16,
            transform: "translateX(-50%)",
            width: "min(95vw, 540px)",
            maxHeight: "85dvh",
            overflow: "auto",
            borderRadius: 16,
            padding: 20,
            background: "#18181b",
            color: "#fafafa",
          }}
        >
          <Dialog.Title>{schema.title ?? "Menu"}</Dialog.Title>
          {schema.description && <Dialog.Description>{schema.description}</Dialog.Description>}
          {(schema.fields ?? []).map((field) => (
            <DialogField key={field.name} field={field} values={values} />
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {(schema.actions ?? []).map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  void Promise.resolve(action.handler?.({ values, close })).then((result) => {
                    if (result !== false) close();
                  });
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          <Dialog.Close asChild>
            <button type="button">Fechar</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function mount(view: (close: () => void) => React.ReactNode, name: string, owner: Document = document) {
  const host = owner.createElement("div");
  host.dataset.rodReactMenu = name;
  owner.body.append(host);
  const root = createRoot(host);
  let disposed = false;
  const close = () => {
    if (disposed) return;
    disposed = true;
    root.unmount();
    host.remove();
  };
  root.render(view(close));
  return { close, dispose: close };
}

export function openRadixDropdown(options: DropdownOptions) {
  return mount(
    (close) => <DropdownView options={options} close={close} />,
    options.id ?? "dropdown",
    options.trigger.ownerDocument,
  );
}
export function openRadixDialog(schema: MenuSchema) {
  return mount((close) => <DialogView schema={schema} close={close} />, schema.id ?? "dialog");
}
