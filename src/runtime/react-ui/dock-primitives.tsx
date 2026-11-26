/** @jsxImportSource react */
import * as Dialog from "@radix-ui/react-dialog";

/** Presentation-only primitive; independent of userscript runtime state. */
export function DockHeader({ title, closeLabel }: { title: string; closeLabel: string }) {
  return (
    <header className="panel-header">
      <Dialog.Title className="panel-title">{title}</Dialog.Title>
      <Dialog.Close className="btn btn--icon" aria-label={closeLabel}>✕</Dialog.Close>
    </header>
  );
}

export function DockSearch({ id, label, variant, placeholder, value, onChange }: {
  id?: string;
  label?: string;
  variant: "spaced" | "block";
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input id={id} aria-label={label} className={`input input--${variant}`}
      type="search" autoCapitalize="none" autoCorrect="off" spellCheck={false}
      placeholder={placeholder} value={value}
      onChange={(event) => onChange(event.target.value)} />
  );
}

export function DockOverlay({ secondary = false, onClose }: { secondary?: boolean; onClose: () => void }) {
  return <div className={secondary ? "overlay overlay--secondary" : "overlay"} aria-hidden="true" onClick={onClose} />;
}

