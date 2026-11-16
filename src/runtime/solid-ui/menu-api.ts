import { openSolidDropdown } from "./SolidDropdown";
import { RodMenu } from "./menu";
import type { RodMenuSchema, RodMenuAction, AnyRecord } from "./menu/types";

export interface DropdownItem {
  label?: string;
  type?: "item" | "separator" | "checkbox";
  disabled?: boolean;
  checked?: boolean;
  children?: DropdownItem[];
  onSelect?: () => unknown;
  onCheckedChange?: (checked: boolean) => unknown;
}
export interface DropdownOptions {
  id?: string;
  trigger: HTMLElement;
  items: DropdownItem[];
  align?: "start" | "end";
}

type LegacyAction = {
  id: string;
  label: string;
  role?: "submit" | "cancel" | "secondary" | "destructive";
  handler?: (context: { values: AnyRecord; close: () => void }) => unknown;
  run?: (values: AnyRecord) => unknown;
  validate?: boolean;
  close?: boolean;
};
type LegacySchema = Omit<RodMenuSchema, "actions"> & {
  actions?: readonly LegacyAction[];
  values?: AnyRecord;
  content?: string;
  chrome?: "bare" | "default";
};
let defaults: Record<string, unknown> = {};

/** Compatibility facade: ctx.menu now delegates to RodMenu Solid 2. */
export const menu = Object.freeze({
  dropdown(options: DropdownOptions) {
    return openSolidDropdown(options);
  },
  configure(options: Record<string, unknown> = {}) {
    defaults = { ...defaults, ...options };
    return menu;
  },
  open(schema: LegacySchema) {
    const { values, content, chrome, ...nativeSchema } = schema;
    const actions: RodMenuAction[] | undefined = schema.actions?.map((action) => ({
      id: action.id,
      label: action.label,
      role: action.role,
      validate: action.validate,
      close: action.close,
      handler: async (context) => {
        if (action.handler) return action.handler({ values: context.values, close: () => context.close() });
        return action.run?.(context.values);
      },
    }));
    return RodMenu.open({
      ...nativeSchema,
      description: schema.description ?? content,
      initialValues: schema.initialValues ?? values,
      presentation:
        schema.presentation ??
        (defaults.defaultPresentation as RodMenuSchema["presentation"]) ??
        "bottom-sheet",
      actions,
    });
  },
  form: RodMenu.form,
  confirm: RodMenu.confirm,
  actions: RodMenu.actions,
  presets: RodMenu.presets,
  get: RodMenu.get,
  stack: RodMenu.stack,
  close(id: string) {
    RodMenu.get(id)?.close();
  },
  closeAll() {
    RodMenu.closeAll();
  },
});
