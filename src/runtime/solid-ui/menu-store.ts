import { createStore } from "solid-js/store";

export interface MenuAction {
  id: string;
  label: string;
  run?: () => void | Promise<void>;
}
export interface MenuEntry {
  id: string;
  title: string;
  content?: string;
  actions?: MenuAction[];
}
const [state, setState] = createStore<{ stack: MenuEntry[] }>({ stack: [] });
export const menuState = state;
export const menuActions = {
  open(entry: MenuEntry) {
    setState("stack", (stack) => [...stack.filter((item) => item.id !== entry.id), entry]);
    return { close: () => menuActions.close(entry.id) };
  },
  close(id: string) {
    setState("stack", (stack) => stack.filter((entry) => entry.id !== id));
  },
  closeAll() {
    setState("stack", []);
  },
};
