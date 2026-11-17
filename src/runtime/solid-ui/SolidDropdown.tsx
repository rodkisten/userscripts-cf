import { createSignal, For, onCleanup } from "solid-js";
import { render } from "@solidjs/web";
import type { DropdownOptions, DropdownItem } from "./menu-api";

const activeDropdowns = new WeakMap<HTMLElement, () => void>();

export function openSolidDropdown(options: DropdownOptions) {
  const trigger = options.trigger;
  // Opening the same trigger again toggles the existing dropdown closed.
  const existing = activeDropdowns.get(trigger);
  if (existing) {
    existing();
    return { close: existing };
  }
  const root = trigger.getRootNode();
  const parent = root instanceof ShadowRoot ? root : trigger.ownerDocument.body;
  const mount = trigger.ownerDocument.createElement("div");
  mount.style.cssText = "position:fixed;z-index:2147483647;max-width:calc(100vw - 16px)";
  parent.append(mount);
  const previous = trigger.getAttribute("aria-expanded");
  trigger.setAttribute("aria-expanded", "true");
  const controller = new AbortController();
  let disposed = false;
  const [stack, setStack] = createSignal<DropdownItem[][]>([options.items]);
  const [version, setVersion] = createSignal(0);
  const close = () => {
    if (disposed) return;
    disposed = true;
    activeDropdowns.delete(trigger);
    controller.abort();
    dispose();
    mount.remove();
    if (previous === null) trigger.removeAttribute("aria-expanded");
    else trigger.setAttribute("aria-expanded", previous);
    if (trigger.isConnected) trigger.focus();
  };
  activeDropdowns.set(trigger, close);
  const focusFirst = () => mount.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  const position = () => {
    const rect = trigger.getBoundingClientRect();
    const width = mount.offsetWidth;
    mount.style.left =
      Math.max(
        8,
        Math.min(innerWidth - width - 8, options.align === "start" ? rect.left : rect.right - width),
      ) + "px";
    mount.style.top =
      (rect.bottom + mount.offsetHeight > innerHeight - 8
        ? Math.max(8, rect.top - mount.offsetHeight - 4)
        : rect.bottom + 4) + "px";
  };
  const dispose = render(
    () => (
      <div
        role="menu"
        aria-label="Opções"
        data-rod-dropdown={options.id ?? "menu"}
        style={{
          "min-width": "220px",
          "max-width": "340px",
          "max-height": "70dvh",
          "overflow-y": "auto",
          padding: "6px",
          background: "#202b3d",
          color: "#edf2fb",
          border: "1px solid #435067",
          "border-radius": "12px",
          "box-shadow": "0 12px 32px #0009",
          font: "14px system-ui",
        }}
      >
        <For each={stack().length > 1 ? [true] : []}>
          {() => (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setStack((s) => s.slice(0, -1)); queueMicrotask(() => { position(); focusFirst(); }); }}
              style={buttonStyle}
            >
              ‹ Voltar
            </button>
          )}
        </For>
        <For each={stack().at(-1) ?? []}>
          {(item) =>
            item.type === "separator" ? (
              <hr style={{ border: "0", "border-top": "1px solid #435067", margin: "6px 0" }} />
            ) : (
              <button
                type="button"
                role={item.type === "checkbox" ? "menuitemcheckbox" : "menuitem"}
                aria-checked={item.type === "checkbox" ? String(Boolean(item.checked)) : undefined}
                disabled={item.disabled}
                style={buttonStyle}
                onClick={() => {
                  if (item.children?.length) {
                    setStack((s) => [...s, item.children!]);
                    queueMicrotask(() => { position(); focusFirst(); });
                    return;
                  }
                  if (item.type === "checkbox") {
                    item.checked = !item.checked;
                    setVersion((v) => v + 1);
                    void item.onCheckedChange?.(item.checked);
                    return;
                  }
                  void item.onSelect?.();
                  close();
                }}
              >
                {version() >= 0 && item.type === "checkbox" ? (item.checked ? "✓ " : "　") : ""}
                {item.label}
                {item.children?.length ? " ›" : ""}
              </button>
            )
          }
        </For>
      </div>
    ),
    mount,
  );
  trigger.ownerDocument.addEventListener(
    "pointerdown",
    (event) => {
      const path = event.composedPath();
      if (!path.includes(mount) && !path.includes(trigger)) close();
    },
    { capture: true, signal: controller.signal },
  );
  trigger.ownerDocument.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        close();
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        const buttons = [...mount.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
        event.preventDefault();
      }
      if (event.key === "ArrowLeft" && stack().length > 1) {
        setStack((items) => items.slice(0, -1));
        queueMicrotask(() => { position(); focusFirst(); });
        event.preventDefault();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const buttons = [...mount.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(
          (root instanceof ShadowRoot ? root.activeElement : document.activeElement) as HTMLButtonElement,
        );
        buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        event.preventDefault();
      }
    },
    { signal: controller.signal },
  );
  window.addEventListener("resize", position, { signal: controller.signal });
  // Capture scrolling from nested containers, including mobile overflow panes.
  trigger.ownerDocument.addEventListener("scroll", position, { capture: true, passive: true, signal: controller.signal });
  position();
  focusFirst();
  return { close };
}
const buttonStyle = {
  display: "block",
  width: "100%",
  "min-height": "40px",
  "text-align": "left",
  padding: "9px 12px",
  border: "0",
  "border-radius": "7px",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};
