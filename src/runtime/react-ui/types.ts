export type SurfaceType = "bottom-sheet" | "modal" | "drawer" | "popover";

export type Position = "top" | "bottom" | "left" | "right" | "center";

export type FieldType = "text" | "email" | "password" | "search" | "url" | "tel" | "textarea" | "number" | "select" | "checkbox" | "toggle" | "switch" | "slider" | "range";

export interface FieldDefinition {
  id?: string;
  name?: string;
  label: string;
  type: FieldType;
  value?: unknown;
  defaultValue?: any;
  placeholder?: string;
  options?: { label: string; value: any }[];
  min?: number;
  max?: number;
  step?: number;
  validation?: (value: any) => string | null;
}

export interface ActionDefinition {
  id: string;
  label: string;
  icon?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  onClick?: (context: MenuContext) => void | Promise<void>;
  role?: "cancel" | "submit";
}

export interface MenuSchema {
  id: string;
  title?: string;
  subtitle?: string;
  description?: string;
  presentation?: SurfaceType | "auto";
  surface?: SurfaceType;
  position?: Position;
  fields?: FieldDefinition[];
  actions?: ActionDefinition[];
  persistKey?: string;
  width?: string | number;
  height?: string | number;
}

export interface MenuContext {
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  close: () => void;
  reset: () => void;
}

export interface RodMenuProps {
  schema: MenuSchema;
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Record<string, any>;
  className?: string;
}
