import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DynamicForm } from "./DynamicForm";
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
            <DynamicForm schema={schema} values={values} onChange={handleChange} />
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
