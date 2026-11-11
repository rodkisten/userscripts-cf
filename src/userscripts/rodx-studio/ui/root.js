import { IDENT } from "../config/search.js";
import { tray } from "../search/block-editing.js";
import { state } from "../state/deck.js";
import { onClick, onFieldChange, onFileChange, onGroupToggle } from "./events.js";
import { addChips, renderBlockEditor, renderRoot, renderTags } from "./search-workbench.js";

export function initializeRoot() {
  const host = document.createElement("div");
  host.id = `${IDENT}-root`;
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;pointer-events:none;";
  const shadow = host.attachShadow({
    mode: "open",
  });
  shadow.addEventListener("click", onClick);
  shadow.addEventListener("input", onFieldChange);
  shadow.addEventListener("change", onFieldChange);
  shadow.addEventListener("change", onFileChange);
  shadow.addEventListener("toggle", onGroupToggle, true);
  shadow.addEventListener("keydown", (event) => {
    const input = event.target.closest?.("[data-chip-input]");
    if (!input) return;
    if (event.key === "Enter" || event.key === "Tab") {
      if (input.value.trim()) {
        event.preventDefault();
        try {
          addChips(input.value);
        } catch (error) {
          state.message = error.message;
          renderRoot();
        }
      }
    }
    if (event.key === "Backspace" && !input.value) {
      const t = tray();
      if (t?.children.length) {
        t.children.pop();
        renderTags();
        renderBlockEditor();
      }
    }
  });
  shadow.addEventListener("focusout", (event) => {
    const input = event.target.closest?.("[data-chip-input]");
    if (input?.value?.trim()) {
      try {
        addChips(input.value, false);
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
      yStart = event.target.closest?.(".head-row") ? event.touches[0]?.clientY : null;
    },
    {
      passive: true,
    },
  );
  shadow.addEventListener(
    "touchend",
    (event) => {
      if (yStart == null || !state.open) return;
      const delta = (event.changedTouches[0]?.clientY ?? yStart) - yStart;
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
