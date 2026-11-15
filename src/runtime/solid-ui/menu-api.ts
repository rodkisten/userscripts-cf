import { openSolidDropdown } from "./SolidDropdown";
import { menuActions, type MenuEntry, type MenuValue } from "./menu-store";
import { mountMenuRoot } from "./MenuRoot";


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
type Values = Record<string, MenuValue>;
type LegacyAction = { id: string; label: string; role?: "submit" | "cancel" | "secondary" | "destructive"; handler?: (context: { values: Values; close: () => void }) => unknown; run?: (values: Values) => unknown; validate?: boolean };
type LegacySchema = Omit<MenuEntry, "actions" | "id" | "title"> & { id?: string; title?: string } & { description?: string; size?: string; actions?: LegacyAction[]; values?: Values; fields?: MenuEntry["fields"] };
let defaults: Record<string, unknown> = {};

function ensureMounted() {
  if (typeof document === "undefined") return;
  mountMenuRoot();
}

/** Single Solid-backed menu API exposed as ctx.menu. */
export const menu = Object.freeze({
  dropdown(options: DropdownOptions) { return openSolidDropdown(options); },
  configure(options: Record<string, unknown> = {}) {
    defaults = { ...defaults, ...options };
    return menu;
  },
  open(schema: LegacySchema) {
    ensureMounted();
    const id = schema.id || "rod-menu-" + Math.random().toString(36).slice(2);
    const entry: MenuEntry = {
      ...schema,
      id,
      title: schema.title || "",
      content: schema.content ?? schema.description,
      presentation: schema.presentation ?? (defaults.defaultPresentation as MenuEntry["presentation"]) ?? "bottom-sheet",
      initialValues: schema.initialValues ?? schema.values,
      actions: schema.actions?.map((action) => ({
        id: action.id,
        label: action.label,
        role: action.role,
        validate: action.validate,
        run: async (values) => {
          if (action.handler) await action.handler({ values: values as Values, close: () => menuActions.close(id) });
          else await action.run?.(values as Values);
        },
      })),
    };
    return menuActions.open(entry);
  },
  close(id: string) { menuActions.close(id); },
  closeAll() { menuActions.closeAll(); },
});
