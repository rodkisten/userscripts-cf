import { RodMenu } from "./menu";
import type { RodMenuSchema, RodMenuAction, AnyRecord } from "./menu/types";

type LegacyAction = {
  id: string;
  label: string;
  role?: "submit" | "cancel" | "secondary" | "destructive";
  handler?: (context: { values: AnyRecord; close: () => void }) => unknown;
  run?: (values: AnyRecord) => unknown;
  validate?: boolean;
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
      handler: async (context) => {
        if (action.handler) return action.handler({ values: context.values, close: () => context.close() });
        return action.run?.(context.values);
      },
    }));
    return RodMenu.open({
      ...nativeSchema,
      description: schema.description ?? content,
      initialValues: schema.initialValues ?? values,
      presentation: schema.presentation ?? (defaults.defaultPresentation as RodMenuSchema["presentation"]) ?? "bottom-sheet",
      actions,
    });
  },
  form: RodMenu.form,
  confirm: RodMenu.confirm,
  actions: RodMenu.actions,
  presets: RodMenu.presets,
  get: RodMenu.get,
  stack: RodMenu.stack,
  close(id: string) { RodMenu.get(id)?.close(); },
  closeAll() { RodMenu.closeAll(); },
});
