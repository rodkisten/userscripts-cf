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
  presentation?: "bottom-sheet" | "modal" | "drawer";
  dismissible?: boolean;
}
interface MenuSession {
  entry: MenuEntry;
  resolve: (value: MenuResult) => void;
}
export interface MenuResult {
  reason: "action" | "dismiss" | "close";
  action?: string;
}
const [state, setState] = createStore<{ stack: MenuEntry[] }>({ stack: [] });
const sessions = new Map<string, MenuSession>();
export const menuState = state;
export const menuActions = {
  open(entry: MenuEntry) {
    menuActions.close(entry.id);
    let resolve!: (value: MenuResult) => void;
    const result = new Promise<MenuResult>((done) => { resolve = done; });
    sessions.set(entry.id, { entry, resolve });
    setState("stack", (stack) => [...stack, entry]);
    return { close: () => menuActions.close(entry.id), result };
  },
  async invoke(id: string, action: MenuAction) {
    const session = sessions.get(id);
    if (!session) return;
    await action.run?.();
    if (sessions.get(id) !== session) return;
    session.resolve({ reason: "action", action: action.id });
    sessions.delete(id);
    setState("stack", (stack) => stack.filter((entry) => entry.id !== id));
  },
  close(id: string, reason: MenuResult["reason"] = "close") {
    const session = sessions.get(id);
    if (session) {
      sessions.delete(id);
      session.resolve({ reason });
    }
    setState("stack", (stack) => stack.filter((entry) => entry.id !== id));
  },
  closeAll() {
    for (const id of [...sessions.keys()]) menuActions.close(id);
  },
};
