/** @jsxImportSource react */
import type { ReactNode } from "react";
import { Button } from "./uai/button.js";
import { Input } from "./uai/input.js";
import * as Dialog from "@radix-ui/react-dialog";

/** Presentation-only primitive; independent of userscript runtime state. */
export function DockHeader({ title, closeLabel }: { title: string; closeLabel: string }) {
  return (
    <header className="panel-header">
      <Dialog.Title className="panel-title">{title}</Dialog.Title>
      <Dialog.Close asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={closeLabel}>✕</Button>
      </Dialog.Close>
    </header>
  );
}

export function DockSearch({
  id,
  label,
  variant,
  placeholder,
  value,
  onChange,
}: {
  id?: string;
  label?: string;
  variant: "spaced" | "block";
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      id={id}
      aria-label={label}
      className={`dock-search input--${variant}`}
      type="search"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function DockOverlay({ secondary = false, onClose }: { secondary?: boolean; onClose: () => void }) {
  return (
    <div
      className={secondary ? "overlay overlay--secondary" : "overlay"}
      aria-hidden="true"
      onClick={onClose}
    />
  );
}

/** Non-modal Radix composition avoids document-level scroll locking in shadow roots. */
export function DockPanel({
  open,
  onOpenChange,
  portal,
  title,
  closeLabel,
  secondary = false,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portal: HTMLElement;
  title: string;
  closeLabel: string;
  secondary?: boolean;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={portal}>
        {open && <DockOverlay secondary={secondary} onClose={() => onOpenChange(false)} />}
        <Dialog.Content className="panel" {...(!description ? { "aria-describedby": undefined } : {})}>
          <DockHeader title={title} closeLabel={closeLabel} />
          <div className="panel-body">
            {description && (
              <Dialog.Description className="panel-description">{description}</Dialog.Description>
            )}
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
