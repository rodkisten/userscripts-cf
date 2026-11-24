import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import * as Checkbox from "@radix-ui/react-checkbox";
import type { RodMenuProps } from "./types";
import { createInitialValues, loadPersistence, savePersistence } from "./core";
import styles, { css as menuCss } from "./Menu.module.css";

import themeCss from "./theme.css?inline";
import { registerShadowStyles } from "./shadow-styles";
import { applyMenuTheme } from "./theme";

export const RodMenu: React.FC<RodMenuProps> = ({ schema, isOpen, onClose, initialValues, className }) => {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const host = document.createElement("div");
    host.setAttribute("data-rod-menu-host", "");
    const root = host.attachShadow({ mode: "open" });
    const release = registerShadowStyles(root, [themeCss, menuCss]);
    const container = document.createElement("div");
    container.className = "rod-theme";
    root.append(container);
    document.body.append(host);
    setPortal(container);
    return () => {
      release();
      host.remove();
      setPortal(null);
    };
  }, [isOpen]);
  useEffect(() => {
    if (!portal) return;
    return applyMenuTheme(portal, schema.theme);
  }, [portal, schema.theme]);
  const [values, setValues] = useState<Record<string, any>>(() => {
    const persisted = loadPersistence(schema.persistKey);
    return { ...createInitialValues(schema, initialValues), ...persisted };
  });

  useEffect(() => {
    if (isOpen) savePersistence(schema.persistKey, values);
  }, [isOpen, values, schema.persistKey]);

  const handleChange = (fieldId: string, value: any) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const context = {
    values,
    setValue: handleChange,
    close: onClose,
    reset: () => setValues(createInitialValues(schema, initialValues)),
  };

  const surface = schema.surface ?? schema.presentation ?? "bottom-sheet";
  const surfaceClass =
    surface === "modal"
      ? styles.surfaceModal
      : surface === "drawer"
        ? styles.surfaceDrawer
        : surface === "popover"
          ? styles.surfacePopover
          : "";
  if (!isOpen || !portal) return null;

  return (
    <Dialog.Root
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal container={portal}>
        {/* Non-modal prevents Radix from locking iOS Safari when content fails to paint. */}
        <Dialog.Content
          aria-label={schema.title || "Rod Menu"}
          aria-describedby={undefined}
          className={`bg-background text-foreground border-border ${styles.surface} ${surfaceClass} ${className || ""}`}

        >
          <Dialog.Title className={styles.accessibleTitle}>{schema.title || "Rod Menu"}</Dialog.Title>
          {(schema.title || schema.subtitle || schema.description) && (
            <div className={styles.header}>
              <div className={styles.titleWrapper}>
                {schema.title && <h3>{schema.title}</h3>}
                {(schema.subtitle || schema.description) && <p>{schema.subtitle || schema.description}</p>}
              </div>
              <Dialog.Close className={styles.closeButton} aria-label="Fechar menu">
                &times;
              </Dialog.Close>
            </div>
          )}

          <div className={styles.body}>
            {schema.fields?.map((field, index) => {
              const fieldId = `${schema.id}-${field.id ?? field.name ?? `field-${index}`}`;
              const valueKey = field.id ?? field.name ?? `field-${index}`;
              const isCheckbox =
                field.type === "checkbox" || field.type === "toggle" || field.type === "switch";
              return (
                <div
                  key={fieldId}
                  className={`${styles.fieldGroup} ${isCheckbox ? styles.checkboxGroup : ""}`}
                >
                  <label htmlFor={fieldId}>{field.label}</label>
                  {field.type === "select" ? (
                    <select
                      id={fieldId}
                      value={values[valueKey] ?? ""}
                      onChange={(e) => handleChange(valueKey, e.target.value)}
                    >
                      <option value="" disabled>
                        {field.placeholder || "Select option..."}
                      </option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "slider" || field.type === "range" ? (
                    <input
                      id={fieldId}
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={values[valueKey] ?? field.min ?? 0}
                      onChange={(e) => handleChange(valueKey, Number(e.target.value))}
                    />
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={fieldId}
                      placeholder={field.placeholder}
                      value={String(values[valueKey] ?? "")}
                      onChange={(e) => handleChange(valueKey, e.target.value)}
                    />
                  ) : isCheckbox ? (
                    field.type === "checkbox" ? (
                    <Checkbox.Root id={fieldId} className={styles.checkbox} checked={!!values[valueKey]} onCheckedChange={(checked) => handleChange(valueKey, checked === true)}>
                      <Checkbox.Indicator>✓</Checkbox.Indicator>
                    </Checkbox.Root>
                  ) : (
                    <Switch.Root id={fieldId} className={styles.switch} checked={!!values[valueKey]} onCheckedChange={(checked) => handleChange(valueKey, checked)}>
                      <Switch.Thumb className={styles.switchThumb} />
                    </Switch.Root>
                  )
                  ) : (
                    <input
                      id={fieldId}
                      type={
                        ["number", "email", "password", "search", "url", "tel"].includes(field.type)
                          ? field.type
                          : "text"
                      }
                      placeholder={field.placeholder}
                      value={values[valueKey] ?? ""}
                      onChange={(e) =>
                        handleChange(
                          valueKey,
                          field.type === "number" && e.target.value !== ""
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>

          {schema.actions && schema.actions.length > 0 && (
            <div className={styles.actions}>
              {schema.actions.map((action) => {
                const variantClass =
                  action.variant === "danger"
                    ? styles.btnDanger
                    : action.variant === "secondary"
                      ? styles.btnSecondary
                      : styles.btnPrimary;

                return (
                  <button
                    key={action.id}
                    disabled={action.disabled}
                    className={`${styles.btn} ${variantClass}`}
                    onClick={() => {
                      if (action.role === "cancel") onClose();
                      else void action.onClick?.(context);
                    }}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
export default RodMenu;
