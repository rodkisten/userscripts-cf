/** @jsxImportSource react */
import type * as React from "react";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import type { DropdownItem, DropdownOptions, MenuSchema, MenuField } from "./menu.js";

function DropdownItems({ items, portal }: { items: DropdownItem[]; portal: HTMLElement }) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type === "separator") return <DropdownMenu.Separator key={index} />;
        if (item.children?.length)
          return (
            <DropdownMenu.Sub key={index}>
              <DropdownMenu.SubTrigger disabled={item.disabled}>{item.label}</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal container={portal}>
                <DropdownMenu.SubContent sideOffset={4}>
                  <DropdownItems items={item.children} portal={portal} />
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

function DropdownView({
  options,
  close,
  portal,
}: {
  options: DropdownOptions;
  close: () => void;
  portal: HTMLElement;
}) {
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
      <DropdownMenu.Portal container={portal}>
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
          <DropdownItems items={options.items} portal={portal} />
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

function DialogView({
  schema,
  close,
  portal,
}: {
  schema: MenuSchema;
  close: () => void;
  portal: HTMLElement;
}) {
  const values = useRef<Record<string, unknown>>({ ...schema.initialValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Dialog.Root
      defaultOpen
      onOpenChange={(open) => {
        if (!open) queueMicrotask(close);
      }}
    >
      <Dialog.Portal container={portal}>
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
            <DialogField key={field.name} field={field} values={values.current} />
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {(schema.actions ?? []).map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={pending}
                onClick={() => {
                  if (pending) return;
                  setError(null);
                  setPending(true);
                  void Promise.resolve()
                    .then(() => action.handler?.({ values: values.current, close }))
                    .then((result) => {
                      if (result !== false) close();
                    })
                    .catch((reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : String(reason));
                    })
                    .finally(() => setPending(false));
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
          <Dialog.Close asChild>
            <button type="button">Fechar</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function mount(
  view: (close: () => void, portal: HTMLElement) => React.ReactNode,
  name: string,
  owner: Document,
  target: ShadowRoot | HTMLElement = owner.body,
  mountSharedReact?: (component: ReactElement, container: HTMLElement) => { dispose: () => void },
) {
  const host = owner.createElement("div");
  host.dataset.rodReactMenu = name;
  const portal = owner.createElement("div");
  portal.dataset.rodReactMenuPortal = name;
  target.append(host, portal);
  let shared: { dispose: () => void } | undefined;
  const root = mountSharedReact ? undefined : createRoot(host);
  let disposed = false;
  const close = () => {
    if (disposed) return;
    disposed = true;
    // A Radix event can close its own React tree; defer unmount until the event finishes.
    queueMicrotask(() => {
      shared?.dispose();
      root?.unmount();
      host.remove();
      portal.remove();
    });
  };
  const element = view(close, portal);
  if (mountSharedReact) shared = mountSharedReact(element as ReactElement, host);
  else root?.render(element);
  return { close, dispose: close };
}

/** Resolve the caller's tree without relying on a global ShadowRoot constructor. */
function resolveMenuTarget(trigger: HTMLElement): ShadowRoot | HTMLElement {
  const root = trigger.getRootNode();
  return root.nodeType === 11 && "host" in root ? (root as ShadowRoot) : trigger.ownerDocument.body;
}

export function openRadixDropdown(
  options: DropdownOptions,
  mountSharedReact?: (component: ReactElement, container: HTMLElement) => { dispose: () => void },
) {
  return mount(
    (close, portal) => <DropdownView options={options} close={close} portal={portal} />,
    options.id ?? "dropdown",
    options.trigger.ownerDocument,
    options.container ?? resolveMenuTarget(options.trigger),
    mountSharedReact,
  );
}
export function openRadixDialog(
  schema: MenuSchema,
  mountSharedReact?: (component: ReactElement, container: HTMLElement) => { dispose: () => void },
) {
  const owner = schema.container?.ownerDocument ?? document;
  const target = schema.container ?? owner.body;
  return mount(
    (close, portal) => <DialogView schema={schema} close={close} portal={portal} />,
    schema.id ?? "dialog",
    owner,
    target,
    mountSharedReact,
  );
}
