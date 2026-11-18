import React, { useState, useEffect } from "react";
import { RodMenuProps } from "./types";
import { createInitialValues, loadPersistence, savePersistence } from "./core";
import styles from "./Menu.module.css";

export const RodMenu: React.FC<RodMenuProps> = ({ schema, isOpen, onClose, initialValues, className }) => {
  if (!isOpen) return null;

  const [values, setValues] = useState<Record<string, any>>(() => {
    const persisted = loadPersistence(schema.persistKey);
    return { ...createInitialValues(schema, initialValues), ...persisted };
  });

  useEffect(() => {
    savePersistence(schema.persistKey, values);
  }, [values, schema.persistKey]);

  const handleChange = (fieldId: string, value: any) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const context = {
    values,
    setValue: handleChange,
    close: onClose,
    reset: () => setValues(createInitialValues(schema, initialValues)),
  };

  const isModal = schema.surface === "modal";

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.surface} ${isModal ? styles.surfaceModal : ""} ${className || ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(schema.title || schema.subtitle) && (
          <div className={styles.header}>
            <div className={styles.titleWrapper}>
              {schema.title && <h3>{schema.title}</h3>}
              {schema.subtitle && <p>{schema.subtitle}</p>}
            </div>
            <button className={styles.closeButton} onClick={onClose} aria-label="Close menu">
              &times;
            </button>
          </div>
        )}

        <div className={styles.body}>
          {schema.fields?.map((field) => {
            const isCheckbox = field.type === "checkbox" || field.type === "toggle";
            return (
              <div
                key={field.id}
                className={`${styles.fieldGroup} ${isCheckbox ? styles.checkboxGroup : ""}`}
              >
                <label htmlFor={field.id}>{field.label}</label>
                {field.type === "select" ? (
                  <select
                    id={field.id}
                    value={values[field.id] ?? ""}
                    onChange={(e) => handleChange(field.id, e.target.value)}
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
                ) : isCheckbox ? (
                  <input
                    id={field.id}
                    type="checkbox"
                    checked={!!values[field.id]}
                    onChange={(e) => handleChange(field.id, e.target.checked)}
                  />
                ) : (
                  <input
                    id={field.id}
                    type={field.type === "number" ? "number" : "text"}
                    placeholder={field.placeholder}
                    value={values[field.id] ?? ""}
                    onChange={(e) => handleChange(field.id, e.target.value)}
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
                  onClick={() => action.onClick(context)}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
export default RodMenu;
