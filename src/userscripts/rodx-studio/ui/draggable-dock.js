import { CSS_SELECTORS } from "../../../selectors.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/account.js";
import { renderDock } from "./search-workbench.js";
import { showRodxToast } from "./toast.js";

export let DragDock;

export function initializeDeckDragDock() {
  DragDock = (() => {
    let active = null,
      swallowUntil = 0;
    const point = (event) => event.touches?.[0] || event.changedTouches?.[0] || event;
    const reset = () => {
      if (!active) return;
      clearTimeout(active.timer);
      const shadow = active.shadow;
      shadow
        .querySelectorAll(CSS_SELECTORS.s248)
        .forEach((el) => el.classList.remove("dragging", "drop-before", "drop-after"));
      active.ghost?.remove();
      active = null;
    };
    function move(fromId, beforeId, after = false) {
      if (!fromId || !beforeId || fromId === beforeId) return;
      const previous = state.searches.slice();
      const from = state.searches.findIndex((s) => s.id === fromId);
      const dest = state.searches.findIndex((s) => s.id === beforeId);
      if (from < 0 || dest < 0) return;
      const [item] = state.searches.splice(from, 1);
      const at = state.searches.findIndex((s) => s.id === beforeId);
      state.searches.splice(at + (after ? 1 : 0), 0, item);
      renderDock();
      void saveState().catch((error) => {
        state.searches = previous;
        renderDock();
        showRodxToast(error.message, "error");
      });
    }
    function closestTarget(x, y) {
      if (!active) return null;
      const elements = [...active.shadow.querySelectorAll(CSS_SELECTORS.s249)].filter(
        (el) => el.dataset.dragId !== active.id,
      );
      const direct = active.shadow.elementFromPoint?.(x, y)?.closest?.(CSS_SELECTORS.s249);
      if (direct && direct.dataset.dragId !== active.id) return direct;
      // A touch can land between tabs or outside the dock; use nearest center.
      return (
        elements.reduce((best, node) => {
          const r = node.getBoundingClientRect();
          const d = Math.abs(x - (r.left + r.right) / 2) + Math.abs(y - (r.top + r.bottom) / 2) * 0.4;
          return !best || d < best.d
            ? {
                node,
                d,
              }
            : best;
        }, null)?.node || null
      );
    }
    function setDrop(x, y) {
      if (!active?.started) return;
      const shadow = active.shadow;
      const nav = shadow.querySelector(CSS_SELECTORS.s250);
      if (nav) {
        const r = nav.getBoundingClientRect();
        if (x > r.right - 34) nav.scrollLeft += 15;
        else if (x < r.left + 34) nav.scrollLeft -= 15;
      }
      const item = closestTarget(x, y);
      shadow
        .querySelectorAll(CSS_SELECTORS.s251)
        .forEach((el) => el.classList.remove("drop-before", "drop-after"));
      if (item) {
        const r = item.getBoundingClientRect();
        active.target = item.dataset.dragId;
        active.after = x > (r.left + r.right) / 2;
        item.classList.add(active.after ? "drop-after" : "drop-before");
      } else {
        active.target = null;
      }
      if (active.ghost) {
        active.ghost.style.left = x + 9 + "px";
        active.ghost.style.top = y - 14 + "px";
      }
    }
    function start(x, y) {
      if (!active || active.started) return;
      active.started = true;
      active.handle.closest(CSS_SELECTORS.s249)?.classList.add("dragging");
      const ghost = document.createElement("div");
      ghost.textContent = active.label;
      ghost.className = "rodx-drag-ghost";
      document.body.append(ghost);
      active.ghost = ghost;
      setDrop(x, y);
    }
    function attach(shadow) {
      shadow.addEventListener(
        "dragstart",
        (e) => {
          if (e.target.closest(CSS_SELECTORS.s249)) e.preventDefault();
        },
        true,
      );
      shadow.addEventListener(
        "selectstart",
        (e) => {
          if (e.target.closest(CSS_SELECTORS.s252)) e.preventDefault();
        },
        true,
      );
      shadow.addEventListener(
        "contextmenu",
        (e) => {
          if (e.target.closest(CSS_SELECTORS.s252)) e.preventDefault();
        },
        true,
      );
      shadow.addEventListener(
        "click",
        (e) => {
          if (Date.now() < swallowUntil && e.target.closest(CSS_SELECTORS.s249)) {
            e.stopImmediatePropagation();
            e.preventDefault();
          }
        },
        true,
      );
      const down = (e) => {
        const h = e.target.closest?.(CSS_SELECTORS.s252);
        if (!h) return;
        if (active) reset();
        const p = point(e),
          id = h.dataset.dragHandle;
        active = {
          id,
          handle: h,
          shadow,
          startX: p.clientX,
          startY: p.clientY,
          started: false,
          target: null,
          after: false,
          ghost: null,
          label: h.nextElementSibling?.textContent?.trim() || "Timeline",
        };
        // Touch-handle never scrolls or selects; the timeline itself remains scrollable.
        if (e.type === "touchstart" && e.cancelable) e.preventDefault();
        active.timer = setTimeout(() => {
          if (active && active.id === id) start(active.startX, active.startY);
        }, 160);
      };
      const track = (e) => {
        if (!active) return;
        const p = point(e);
        if (!p) return;
        if (e.cancelable) e.preventDefault();
        if (!active.started) {
          if (Math.hypot(p.clientX - active.startX, p.clientY - active.startY) > 5) {
            clearTimeout(active.timer);
            start(p.clientX, p.clientY);
          }
        }
        if (active.started) setDrop(p.clientX, p.clientY);
      };
      const up = (e) => {
        if (!active) return;
        const p = point(e);
        if (active.started) {
          if (p) setDrop(p.clientX, p.clientY);
          const { id, target, after } = active;
          swallowUntil = Date.now() + 650;
          reset();
          if (target) move(id, target, after);
        } else reset();
        if (e.type === "touchend" && e.cancelable) e.preventDefault();
      };
      shadow.addEventListener("touchstart", down, {
        capture: true,
        passive: false,
      });
      shadow.addEventListener("touchmove", track, {
        capture: true,
        passive: false,
      });
      shadow.addEventListener("touchend", up, {
        capture: true,
        passive: false,
      });
      shadow.addEventListener("touchcancel", reset, true);
      shadow.addEventListener(
        "pointerdown",
        (e) => {
          if (e.pointerType !== "touch") down(e);
        },
        true,
      );
      shadow.addEventListener(
        "pointermove",
        (e) => {
          if (e.pointerType !== "touch") track(e);
        },
        true,
      );
      shadow.addEventListener(
        "pointerup",
        (e) => {
          if (e.pointerType !== "touch") up(e);
        },
        true,
      );
      shadow.addEventListener(
        "pointercancel",
        (e) => {
          if (e.pointerType !== "touch") reset();
        },
        true,
      );
    }
    return Object.freeze({
      attach,
    });
  })();
}
