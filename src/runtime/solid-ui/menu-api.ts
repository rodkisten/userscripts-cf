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
function openDropdown(options: DropdownOptions) {
  const root = options.trigger.getRootNode();
  const parent = root instanceof ShadowRoot ? root : document.body;
  const doc = options.trigger.ownerDocument;
  const popup = doc.createElement("div");
  popup.setAttribute("role", "menu");
  popup.setAttribute("aria-label", "Opções");
  popup.dataset.rodDropdown = options.id ?? "menu";
  popup.style.cssText = "position:fixed;z-index:2147483647;min-width:220px;max-width:min(340px,calc(100vw - 16px));max-height:70dvh;overflow:auto;padding:6px;background:#202b3d;color:#edf2fb;border:1px solid #435067;border-radius:12px;box-shadow:0 12px 32px #0009;font:14px system-ui";
  let closed = false;
  const previousExpanded = options.trigger.getAttribute("aria-expanded");
  options.trigger.setAttribute("aria-expanded", "true");
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    popup.remove();
    if (previousExpanded === null) options.trigger.removeAttribute("aria-expanded");
    else options.trigger.setAttribute("aria-expanded", previousExpanded);
    options.trigger.focus();
  };
  const controller = new AbortController();
  const draw = (items: DropdownItem[], container: HTMLElement, back?: () => void) => {
    container.replaceChildren();
    if (back) {
      const button = doc.createElement("button");
      button.textContent = "‹ Voltar";
      button.addEventListener("click", back);
      container.append(button);
    }
    for (const item of items) {
      if (item.type === "separator") {
        const line = doc.createElement("hr");
        line.style.cssText = "border:0;border-top:1px solid #435067;margin:6px 0";
        container.append(line);
        continue;
      }
      const button = doc.createElement("button");
      button.type = "button";
      button.setAttribute("role", item.type === "checkbox" ? "menuitemcheckbox" : "menuitem");
      button.disabled = !!item.disabled;
      if (item.type === "checkbox") button.setAttribute("aria-checked", String(!!item.checked));
      button.textContent = (item.type === "checkbox" ? (item.checked ? "✓ " : "　") : "") + (item.label ?? "") + (item.children?.length ? "  ›" : "");
      button.style.cssText = "display:block;width:100%;min-height:40px;text-align:left;padding:9px 12px;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;cursor:pointer";
      button.addEventListener("click", () => {
        if (item.children?.length) { draw(item.children, container, () => draw(items, container, back)); return; }
        if (item.type === "checkbox") {
          item.checked = !item.checked;
          button.setAttribute("aria-checked", String(item.checked));
          button.textContent = (item.checked ? "✓ " : "　") + (item.label ?? "");
          void item.onCheckedChange?.(item.checked);
        } else { void item.onSelect?.(); close(); }
      });
      container.append(button);
    }
  };
  draw(options.items, popup);
  parent.append(popup);
  const position = () => {
    const rect = options.trigger.getBoundingClientRect();
    const width = popup.getBoundingClientRect().width;
    popup.style.left = Math.max(8, Math.min(innerWidth - width - 8, options.align === "start" ? rect.left : rect.right - width)) + "px";
    popup.style.top = (rect.bottom + popup.offsetHeight > innerHeight - 8 ? Math.max(8, rect.top - popup.offsetHeight - 4) : rect.bottom + 4) + "px";
  };
  position();
  doc.addEventListener("pointerdown", (event) => {
    if (!event.composedPath().includes(popup) && !event.composedPath().includes(options.trigger)) close();
  }, { capture: true, signal: controller.signal });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const buttons = [...popup.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const current = buttons.indexOf((root instanceof ShadowRoot ? root.activeElement : doc.activeElement) as HTMLButtonElement);
      buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      event.preventDefault();
    }
  }, { signal: controller.signal });
  window.addEventListener("resize", position, { signal: controller.signal });
  popup.querySelector<HTMLButtonElement>("button")?.focus();
  return { close };
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
  dropdown(options: DropdownOptions) { return openDropdown(options); },
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
