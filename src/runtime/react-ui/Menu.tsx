import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { RodMenuProps } from "./types";
import { createInitialValues, loadPersistence, savePersistence } from "./core";
import styles from "./Menu.module.css";

export const RodMenu: React.FC<RodMenuProps> = ({ schema, isOpen, onClose, initialValues, className }) => {
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
  const surfaceClass = surface === "modal" ? styles.surfaceModal : surface === "drawer" ? styles.surfaceDrawer : surface === "popover" ? styles.surfacePopover : "";
  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content
        aria-label={schema.title || "Rod Menu"}
        aria-describedby={undefined}
        className={`${styles.surface} ${surfaceClass} ${className || ""}`}
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
              <div key={fieldId} className={`${styles.fieldGroup} ${isCheckbox ? styles.checkboxGroup : ""}`}>
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
                    value={values[fieldId] ?? field.min ?? 0}
                    onChange={(e) => handleChange(fieldId, Number(e.target.value))}
                  />
                ) : field.type === "textarea" ? (
                  <textarea
                    id={fieldId}
                    placeholder={field.placeholder}
                    value={String(values[fieldId] ?? "")}
                    onChange={(e) => handleChange(fieldId, e.target.value)}
                  />
                ) : isCheckbox ? (
                  <input
                    id={fieldId}
                    type="checkbox"
                    checked={!!values[fieldId]}
                    onChange={(e) => handleChange(fieldId, e.target.checked)}
                  />
                ) : (
                  <input
                    id={fieldId}
                    type={
                      ["number", "email", "password", "search", "url", "tel"].includes(field.type)
                        ? field.type
                        : "text"
                    }
                    placeholder={field.placeholder}
                    value={values[fieldId] ?? ""}
                    onChange={(e) =>
                      handleChange(
                        fieldId,
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
                  onClick={() => { if (action.role === "cancel") onClose(); else void action.onClick?.(context); }}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
};
export default RodMenu;
