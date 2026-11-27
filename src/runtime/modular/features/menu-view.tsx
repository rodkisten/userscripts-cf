/** @jsxImportSource react */
import type * as React from "react";
import type { ReactElement } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Tabs from "@radix-ui/react-tabs";
import type { DropdownItem, DropdownOptions, MenuSchema, MenuField } from "./menu-types.js";
import { Button } from "../../react-ui/uai/button.js";
import { Input } from "../../react-ui/uai/input.js";
import menuViewStyles, { css as menuViewCss } from "./menu-view.module.css";

const EMPTY_SELECT_VALUE = "__rod_empty_option__";

function DropdownItems({ items, portal }: { items: DropdownItem[]; portal: HTMLElement }) {
  return (
    <>
      {items.map((item, index) => {
        const key = item.id ?? `${item.type ?? "item"}-${item.label ?? index}`;
        if (item.type === "separator") {
          return (
            <DropdownMenu.Separator key={key} style={{ height: 1, margin: "4px 0", background: "var(--border, #3f3f46)" }} />
          );
        }
        if (item.children?.length) {
          return (
            <DropdownMenu.Sub key={key}>
              <DropdownMenu.SubTrigger disabled={item.disabled}>{item.label}</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal container={portal}>
                <DropdownMenu.SubContent sideOffset={4} style={{ zIndex: 2147483647 }}>
                  <DropdownItems items={item.children} portal={portal} />
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          );
        }
        if (item.type === "checkbox") {
          return (
            <DropdownMenu.CheckboxItem
              key={key}
              disabled={item.disabled}
              checked={Boolean(item.checked)}
              onCheckedChange={(checked) => item.onCheckedChange?.(checked === true)}
            >
              {item.label}
            </DropdownMenu.CheckboxItem>
          );
        }
        return (
          <DropdownMenu.Item key={key} disabled={item.disabled} onSelect={() => item.onSelect?.()}>
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
  const rect = useMemo(() => options.trigger.getBoundingClientRect(), [options.trigger]);

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

function CustomField({ field }: { field: MenuField }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rendered = field.render?.();
    if (rendered && typeof rendered === "object" && "nodeType" in rendered && rendered.nodeType === 1) {
      container.replaceChildren(rendered as HTMLElement);
    }
    return () => {
      container.replaceChildren();
    };
  }, [field]);

  return <div ref={containerRef} className={menuViewStyles.field} />;
}

function RadixSelectField({
  id,
  field,
  initialValue,
  onChange,
  portal,
}: {
  id: string;
  field: MenuField;
  initialValue: string;
  onChange: (value: string) => void;
  portal: HTMLElement;
}) {
  const encode = (val: string) => (val === "" ? EMPTY_SELECT_VALUE : val);
  const decode = (val: string) => (val === EMPTY_SELECT_VALUE ? "" : val);
  const [selected, setSelected] = useState(() => encode(initialValue));

  return (
    <Select.Root
      value={selected}
      disabled={field.disabled}
      onValueChange={(next) => {
        setSelected(next);
        onChange(decode(next));
      }}
    >
      <Select.Trigger id={id} aria-label={field.label ?? field.name} className={menuViewStyles.selectTrigger}>
        <Select.Value placeholder={field.placeholder ?? "Selecione..."} />
        <Select.Icon aria-hidden="true">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal container={portal}>
        <Select.Content position="popper" sideOffset={4} className={menuViewStyles.selectContent}>
          <Select.Viewport className={menuViewStyles.selectViewport}>
            {(field.options ?? []).map((option) => {
              const optionValue = encode(String(option.value));
              return (
                <Select.Item key={optionValue} value={optionValue} className={menuViewStyles.selectItem}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>✓</Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function RadixSwitchField({
  id,
  field,
  initialChecked,
  onChange,
}: {
  id: string;
  field: MenuField;
  initialChecked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(initialChecked);

  return (
    <Switch.Root
      id={id}
      checked={checked}
      disabled={field.disabled}
      onCheckedChange={(next) => {
        setChecked(next);
        onChange(next);
      }}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "none",
        padding: 2,
        background: checked ? "var(--primary, #6d28d9)" : "var(--muted, #3f3f46)",
        cursor: field.disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        transition: "background 150ms ease",
      }}
    >
      <Switch.Thumb
        style={{
          display: "block",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "var(--primary-foreground, #fafafa)",
          transform: checked ? "translateX(18px)" : "translateX(0px)",
          transition: "transform 150ms ease",
        }}
      />
    </Switch.Root>
  );
}

function RadixCheckboxField({
  id,
  field,
  initialChecked,
  onChange,
}: {
  id: string;
  field: MenuField;
  initialChecked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(initialChecked);

  return (
    <Checkbox.Root
      id={id}
      checked={checked}
      disabled={field.disabled}
      onCheckedChange={(next) => {
        const isChecked = next === true;
        setChecked(isChecked);
        onChange(isChecked);
      }}
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        border: "1px solid var(--border, #52525b)",
        background: checked ? "var(--primary, #6d28d9)" : "var(--secondary, #27272a)",
        color: "var(--primary-foreground, #fafafa)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: field.disabled ? "not-allowed" : "pointer",
        padding: 0,
      }}
    >
      <Checkbox.Indicator style={{ fontSize: 13, lineHeight: 1 }}>✓</Checkbox.Indicator>
    </Checkbox.Root>
  );
}

function DialogField({
  field,
  values,
  portal,
}: {
  field: MenuField;
  values: Record<string, unknown>;
  portal: HTMLElement;
}) {
  const fieldId = useId();
  const name = field.name;
  const value = values[name];

  if (field.type === "custom") return <CustomField field={field} />;

  const isSwitch = field.type === "switch" || field.type === "toggle";
  const isCheckbox = field.type === "checkbox";

  if (isSwitch || isCheckbox) {
    return (
      <div className={`${menuViewStyles.field} ${menuViewStyles.fieldToggle}`}>
        <Label.Root htmlFor={fieldId}>{field.label ?? name}</Label.Root>
        {isSwitch ? (
          <RadixSwitchField
            id={fieldId}
            field={field}
            initialChecked={Boolean(value)}
            onChange={(next) => {
              values[name] = next;
            }}
          />
        ) : (
          <RadixCheckboxField
            id={fieldId}
            field={field}
            initialChecked={Boolean(value)}
            onChange={(next) => {
              values[name] = next;
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={menuViewStyles.field}>
      <Label.Root htmlFor={fieldId}>{field.label ?? name}</Label.Root>
      {field.type === "select" ? (
        <RadixSelectField
          id={fieldId}
          field={field}
          initialValue={String(value ?? "")}
          portal={portal}
          onChange={(next) => {
            values[name] = next;
          }}
        />
      ) : field.type === "textarea" ? (
        <textarea
          id={fieldId}
          disabled={field.disabled}
          placeholder={field.placeholder}
          defaultValue={String(value ?? "")}
          className={menuViewStyles.control}
          onChange={(event) => {
            values[name] = event.target.value;
          }}
        />
      ) : (
        <Input
          id={fieldId}
          disabled={field.disabled}
          type={
            ["search", "number", "email", "password", "url"].includes(field.type ?? "") ? field.type : "text"
          }
          placeholder={field.placeholder}
          defaultValue={String(value ?? "")}
          className="min-h-[42px] text-base"
          onChange={(event) => {
            values[name] =
              field.type === "number" && event.target.value !== ""
                ? Number(event.target.value)
                : event.target.value;
          }}
        />
      )}
    </div>
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
  const values = useRef<Record<string, unknown>>({
    ...Object.fromEntries(
      [...(schema.fields ?? []), ...(schema.tabs ?? []).flatMap((tab) => tab.fields)]
        .filter((field) => field.type !== "custom")
        .map((field) => [field.name, field.value]),
    ),
    ...schema.initialValues,
  });

  const [activeTab, setActiveTab] = useState(schema.tabs?.[0]?.id ?? "");
  const descriptionId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runAction = (action: NonNullable<MenuSchema["actions"]>[number]) => {
    if (pending) return;
    if (action.role === "cancel") {
      close();
      return;
    }
    setError(null);
    setPending(true);
    void Promise.resolve()
      .then(() => action.handler?.({ values: values.current, close }))
      .then((result) => {
        if (action.close === true || (action.close !== false && result !== false)) {
          close();
        }
      })
      .catch((reason: unknown) => {
        if (mountedRef.current) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setPending(false);
        }
      });
  };

  const primaryAction =
    schema.actions?.find((action) => action.role !== "cancel" && !action.disabled) ?? null;
  const presentation = schema.presentation ?? "bottom-sheet";
  const surfaceClass =
    presentation === "drawer" ? menuViewStyles.drawer : presentation === "modal" ? menuViewStyles.modal : "";

  return (
    <Dialog.Root
      defaultOpen
      onOpenChange={(open) => {
        if (!open) queueMicrotask(close);
      }}
    >
      <Dialog.Portal container={portal}>
        <Dialog.Overlay className={menuViewStyles.overlay} />
        <Dialog.Content
          aria-describedby={schema.description ? descriptionId : undefined}
          className={`${menuViewStyles.surface} ${surfaceClass}`}
        >
          <header className={menuViewStyles.header}>
            <Dialog.Title className={menuViewStyles.title}>{schema.title ?? "Menu"}</Dialog.Title>
            {schema.description && (
              <Dialog.Description id={descriptionId} className={menuViewStyles.description}>
                {schema.description}
              </Dialog.Description>
            )}
          </header>

          <form
            className={menuViewStyles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (primaryAction) runAction(primaryAction);
            }}
          >
            <div className={menuViewStyles.body}>
              {schema.tabs ? (
                <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
                  <Tabs.List aria-label="Seções das preferências" className={menuViewStyles.tabs}>
                    {schema.tabs.map((tab) => (
                      <Tabs.Trigger key={tab.id} value={tab.id} className={menuViewStyles.tab}>
                        {tab.label}
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                  {schema.tabs.map((tab) => (
                    <Tabs.Content key={tab.id} value={tab.id} className={menuViewStyles.tabContent}>
                      {tab.fields.map((field) => (
                        <DialogField key={field.name} field={field} values={values.current} portal={portal} />
                      ))}
                    </Tabs.Content>
                  ))}
                </Tabs.Root>
              ) : (
                <div className={menuViewStyles.fields}>
                  {(schema.fields ?? []).map((field) => (
                    <DialogField key={field.name} field={field} values={values.current} portal={portal} />
                  ))}
                </div>
              )}
            </div>

            <div className={menuViewStyles.actions}>
              {(schema.actions ?? []).map((action) => (
                <Button
                  variant={action === primaryAction ? "default" : "outline"}
                  key={action.id}
                  type={action === primaryAction ? "submit" : "button"}
                  disabled={pending || action.disabled}
                  className={menuViewStyles.action}
                  data-primary={action === primaryAction ? "true" : undefined}
                  onClick={() => {
                    if (action !== primaryAction) runAction(action);
                  }}
                >
                  {action.label}
                </Button>
              ))}
              <Dialog.Close asChild>
                <Button type="button" variant="outline" className={menuViewStyles.action}>
                  Fechar
                </Button>
              </Dialog.Close>
            </div>
          </form>

          {error && (
            <p role="alert" className={menuViewStyles.error}>
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function mount(
  view: (close: () => void, portal: HTMLElement) => React.ReactNode,
  name: string,
  owner: Document,
  target: ShadowRoot | HTMLElement,
  mountSharedReact: (component: ReactElement, container: HTMLElement) => { dispose: () => void },
) {
  const host = owner.createElement("div");
  host.dataset.rodReactMenu = name;
  const style = owner.createElement("style");
  style.dataset.rodReactMenuStyles = "";
  style.textContent = menuViewCss;
  const portal = owner.createElement("div");
  portal.dataset.rodReactMenuPortal = name;
  target.append(style, host, portal);
  let shared: { dispose: () => void } | undefined;
  let disposed = false;
  let resolveResult!: (value: void) => void;
  const result = new Promise<void>((resolve) => {
    resolveResult = resolve;
  });
  const close = () => {
    if (disposed) return;
    disposed = true;
    resolveResult();
    // A Radix event can close its own React tree; defer unmount until the event finishes.
    queueMicrotask(() => {
      shared?.dispose();
      host.remove();
      portal.remove();
      style.remove();
    });
  };
  try {
    const element = view(close, portal);
    shared = mountSharedReact(element as ReactElement, host);
  } catch (error) {
    host.remove();
    portal.remove();
    style.remove();
    throw error;
  }
  return { close, dispose: close, result };
}

/** Resolve the caller's tree without relying on a global ShadowRoot constructor. */
function resolveMenuTarget(trigger: HTMLElement): ShadowRoot | HTMLElement {
  const root = trigger.getRootNode();
  return root.nodeType === 11 && "host" in root ? (root as ShadowRoot) : trigger.ownerDocument.body;
}

export function openRadixDropdown(
  options: DropdownOptions,
  mountSharedReact: (component: ReactElement, container: HTMLElement) => { dispose: () => void },
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
  mountSharedReact: (component: ReactElement, container: HTMLElement) => { dispose: () => void },
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
