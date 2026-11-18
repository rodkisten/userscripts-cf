export type SurfaceType = 'bottom-sheet' | 'modal' | 'drawer' | 'popover';

export type Position = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'toggle' | 'slider';

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
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
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  onClick: (context: MenuContext) => void | Promise<void>;
}

export interface MenuSchema {
  id: string;
  title?: string;
  subtitle?: string;
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
