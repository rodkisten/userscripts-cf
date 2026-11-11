import { applyComponentStyle } from "../../../core/css.js";
import { RODX_SELECTORS } from "../../../selectors.js";
import { IDENT } from "../config/search.js";
import { tray } from "../search/block-editing.js";
import { state } from "../state/deck.js";
import { onClick, onFieldChange, onFileChange, onGroupToggle } from "./events.tsx";
import { addChips, renderBlockEditor, renderRoot, renderTags } from "./search-workbench.tsx";

export function initializeRoot() {
  const host = (<div />) as HTMLDivElement;
  host.id = `${IDENT}-root`;
  applyComponentStyle(host, "rx-root-host", false);
  const shadow = host.attachShadow({
    mode: "open",
  });
  shadow.addEventListener("click", onClick);
  shadow.addEventListener("input", onFieldChange);
  shadow.addEventListener("change", onFieldChange);
  shadow.addEventListener("change", onFileChange);
  shadow.addEventListener("toggle", onGroupToggle, true);
  shadow.addEventListener("keydown", (event) => {
    const input = (event.target as HTMLElement).closest?.(RODX_SELECTORS.chipInput);
    if (!input) return;
    if ((event as KeyboardEvent).key === "Enter" || (event as KeyboardEvent).key === "Tab") {
      if ((input as HTMLInputElement).value.trim()) {
        event.preventDefault();
        try {
          addChips((input as HTMLInputElement).value);
        } catch (error) {
          state.message = error.message;
          renderRoot();
        }
      }
    }
    if ((event as KeyboardEvent).key === "Backspace" && !(input as HTMLInputElement).value) {
      const t = tray();
      if (t?.children.length) {
        t.children.pop();
        renderTags();
        renderBlockEditor();
      }
    }
  });
  shadow.addEventListener("focusout", (event) => {
    const input = (event.target as HTMLElement).closest?.(RODX_SELECTORS.chipInput);
    if ((input as HTMLInputElement)?.value?.trim()) {
      try {
        addChips((input as HTMLInputElement).value, false);
      } catch (error) {
        state.message = error.message;
        renderRoot();
      }
    }
  });
  // Escape hatch for iOS: drag downward on the header to return to the X timeline.
  let yStart = null;
  shadow.addEventListener(
    "touchstart",
    (event) => {
      yStart = (event.target as HTMLElement).closest?.(RODX_SELECTORS.workspaceHeadRow)
        ? (event as TouchEvent).touches[0]?.clientY
        : null;
    },
    {
      passive: true,
    },
  );
  shadow.addEventListener(
    "touchend",
    (event) => {
      if (yStart == null || !state.open) return;
      const delta = ((event as TouchEvent).changedTouches[0]?.clientY ?? yStart) - yStart;
      yStart = null;
      if (delta > 110) {
        state.open = false;
        renderRoot();
      }
    },
    {
      passive: true,
    },
  );
  document.body.append(host);
  state.rootHost = host;
  state.rootShadow = shadow;
  renderRoot();
}
