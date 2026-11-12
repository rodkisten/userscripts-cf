import { createStore } from "solid-js/store";

export type MenuValue = string | number | boolean | string[] | null;
export interface MenuOption { label: string; value: string; disabled?: boolean }
export interface MenuField {
  name: string;
  label?: string;
  type: "text" | "email" | "password" | "url" | "search" | "tel" | "number" |
    "textarea" | "select" | "multiselect" | "radio" | "checkbox" | "switch" |
    "range" | "date" | "time" | "color" | "hidden";
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  options?: MenuOption[];
  min?: number;
  max?: number;
  step?: number;
  validate?: (value: MenuValue, values: Readonly<Record<string, MenuValue>>) => string | null | Promise<string | null>;
}
export interface MenuAction {
  id: string;
  label: string;
  run?: (values: Readonly<Record<string, MenuValue>>) => void | Promise<void>;
  validate?: boolean;
}
export interface MenuEntry {
  id: string;
  title: string;
  content?: string;
  fields?: MenuField[];
  initialValues?: Record<string, MenuValue>;
  actions?: MenuAction[];
  presentation?: "bottom-sheet" | "modal" | "drawer";
  dismissible?: boolean;
}
export interface MenuResult {
  reason: "action" | "dismiss" | "close";
  action?: string;
  values: Record<string, MenuValue>;
}
interface MenuSession { resolve: (result: MenuResult) => void }
interface MenuView { stack: MenuEntry[]; values: Record<string, Record<string, MenuValue>>; errors: Record<string, Record<string, string>>; busy: Record<string, boolean> }
const [state, setState] = createStore<MenuView>({ stack: [], values: {}, errors: {}, busy: {} });
const sessions = new Map<string, MenuSession>();
export const menuState = state;
export const menuActions = {
  open(entry: MenuEntry) {
    menuActions.close(entry.id);
    let resolve!: (result: MenuResult) => void;
    const result = new Promise<MenuResult>((done) => { resolve = done; });
    sessions.set(entry.id, { resolve });
    const values: Record<string, MenuValue> = { ...entry.initialValues };
    for (const field of entry.fields ?? []) if (!(field.name in values)) values[field.name] = field.type === "checkbox" || field.type === "switch" ? false : field.type === "multiselect" ? [] : "";
    setState("values", entry.id, values);
    setState("errors", entry.id, {});
    setState("stack", (stack) => [...stack, entry]);
    return { close: () => menuActions.close(entry.id), result };
  },
  setValue(id: string, name: string, value: MenuValue) {
    setState("values", id, name, value);
    setState("errors", id, name, "");
  },
  async validate(id: string) {
    const entry = state.stack.find((item) => item.id === id);
    if (!entry) return false;
    const values = state.values[id] ?? {};
    const errors: Record<string, string> = {};
    for (const field of entry.fields ?? []) {
      const value = values[field.name];
      if (field.required && (value === "" || value == null || (Array.isArray(value) && !value.length))) errors[field.name] = "Campo obrigatório";
      else if (field.validate) {
        const message = await field.validate(value, values);
        if (message) errors[field.name] = message;
      }
    }
    setState("errors", id, errors);
    return Object.keys(errors).length === 0;
  },
  async invoke(id: string, action: MenuAction) {
    const session = sessions.get(id);
    if (!session || state.busy[id]) return;
    setState("busy", id, true);
    try {
      if (action.validate !== false && !(await menuActions.validate(id))) return;
      const values = { ...state.values[id] };
      await action.run?.(values);
      if (sessions.get(id) !== session) return;
      session.resolve({ reason: "action", action: action.id, values });
      sessions.delete(id);
      setState("stack", (stack) => stack.filter((entry) => entry.id !== id));
    } catch (error) {
      setState("errors", id, "_form", error instanceof Error ? error.message : String(error));
    } finally { setState("busy", id, false); }
  },
  close(id: string, reason: MenuResult["reason"] = "close") {
    const session = sessions.get(id);
    if (session) {
      sessions.delete(id);
      session.resolve({ reason, values: { ...state.values[id] } });
    }
    setState("stack", (stack) => stack.filter((entry) => entry.id !== id));
  },
  closeAll() { for (const id of [...sessions.keys()]) menuActions.close(id); },
};
