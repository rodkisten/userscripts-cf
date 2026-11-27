import { applyComponentStyle } from "../../../core/css.js";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { RODX_SELECTORS } from "../../../selectors.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import { IDENT } from "../config/search.js";
import { Studio } from "../core/studio-runtime.js";
import { applyPostLimit } from "../feeds/local-limits.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/persistence.js";
import { ResultEnhancer } from "../tweets/enhancer.tsx";
import { studioListIndex } from "../lists/access.tsx";
import { onClick, performAction } from "./events.tsx";
import { renderDock, renderRoot } from "./search-workbench.tsx";
import { showRodxToast } from "./runtime.tsx";

/** Move among pinned searches only; unpinned searches must retain their positions. */
async function movePinnedSearch(id: string, direction: -1 | 1) {
  const pinned = state.searches.filter((search) => search.pinned);
  const position = pinned.findIndex((search) => String(search.id) === id);
  const neighbor = pinned[position + direction];
  if (position < 0 || !neighbor) {
    return;
  }
  const from = state.searches.findIndex((search) => String(search.id) === id);
  const to = state.searches.findIndex((search) => String(search.id) === String(neighbor.id));
  if (from < 0 || to < 0) {
    return;
  }
  const previous = state.searches.slice();
  [state.searches[from], state.searches[to]] = [state.searches[to], state.searches[from]];
  renderDock();
  syncSharedDock();
  try {
    await saveState();
  } catch (error) {
    state.searches = previous;
    renderDock();
    syncSharedDock();
    showRodxToast(error instanceof Error ? error.message : String(error), "error");
  }
}

/** Persist pointer reordering without disturbing unpinned searches. */
async function reorderPinnedSearch(sourceId: string, targetId: string) {
  const from = state.searches.findIndex((search) => String(search.id) === sourceId && search.pinned);
  const to = state.searches.findIndex((search) => String(search.id) === targetId && search.pinned);
  if (from < 0 || to < 0 || from === to) {
    return;
  }
  const previous = state.searches.slice();
  const [search] = state.searches.splice(from, 1);
  const target = state.searches.findIndex((item) => String(item.id) === targetId);
  state.searches.splice(target, 0, search);
  renderDock();
  syncSharedDock();
  try {
    await saveState();
  } catch (error) {
    state.searches = previous;
    renderDock();
    syncSharedDock();
    showRodxToast(error instanceof Error ? error.message : String(error), "error");
  }
}

/** Keep the shared Dock registry in sync without emitting on every SPA repaint. */
let sharedDockSignature = "";

function syncSharedDock(force = false) {
  const pinned = state.searches.filter((search) => search.pinned);
  const quickLists = Studio.services.lists?.quickLists() ?? [];
  const signature = JSON.stringify({
    account: state.account,
    route: state.dockRoute,
    pinned: pinned.map((search) => [search.id, search.name, search.icon, search.query, search.sort]),
    lists: quickLists.map((list) => [list.id, Studio.services.lists.displayName(list)]),
  });
  if (!force && signature === sharedDockSignature) {
    return;
  }
  sharedDockSignature = signature;

  const actions: { id: string; label: string; run: () => void; reorder?: (targetId: string) => void }[] = [
    { id: "home", label: "Início", action: "home" },
    { id: "new", label: "Criar timeline", action: "new" },
    { id: "organize", label: "Organizar pesquisas", action: "open" },
    { id: "lists", label: "Listas", action: "lists-studio" },
  ].map(({ id, label, action }) => ({
    id,
    label,
    run: () => {
      void performAction(action);
    },
  }));
  for (const [index, search] of pinned.entries()) {
    actions.push({
      id: `search:${search.id}`,
      label: `${search.icon ?? ""} ${search.name}`.trim(),
      run: () => {
        void performAction("open-search", String(search.id));
      },
      reorder: (targetId: string) => {
        void reorderPinnedSearch(String(search.id), targetId.replace(/^search:/, ""));
      },
    });
    // Keyboard-accessible ordering while pointer/touch drag remains in the inline Dock.
    if (index > 0) {
      actions.push({
        id: `search-up:${search.id}`,
        label: `↑ ${search.name}`,
        run: () => {
          void movePinnedSearch(String(search.id), -1);
        },
      });
    }
    if (index < pinned.length - 1) {
      actions.push({
        id: `search-down:${search.id}`,
        label: `↓ ${search.name}`,
        run: () => {
          void movePinnedSearch(String(search.id), 1);
        },
      });
    }
  }
  for (const list of quickLists) {
    actions.push({
      id: `list:${list.id}`,
      label: Studio.services.lists.displayName(list),
      run: () => Studio.navigate(`${studioListIndex(Studio)}/${list.id}`),
    });
  }
  document.dispatchEvent(
    new CustomEvent("rod-dock:registry", {
      detail: { type: "register", module: { id: "rodx-studio-shortcuts", name: "RodX Studio · Atalhos", actions } },
    }),
  );
}

function unregisterSharedDock() {
  if (!sharedDockSignature) {
    return;
  }
  sharedDockSignature = "";
  document.dispatchEvent(
    new CustomEvent("rod-dock:registry", {
      detail: { type: "unregister", id: "rodx-studio-shortcuts" },
    }),
  );
}

// Re-register after the shared Dock mounts, even if the RodX state did not change.
document.addEventListener("rod-dock:ready", () => {
  if (sharedDockSignature) {
    syncSharedDock(true);
  }
});

export function ensureDock() {
  // The native search header is sticky and has its own flex layout. Never
  // insert a dock between its input and tabs (which broke mobile layouts).
  const path = location.pathname;
  const onHome = path === "/home";
  const onSearch = /^\/(?:search(?:\/|$)|hashtag\/)/.test(path);
  const primary =
    onHome || onSearch ? document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) : null;
  if (!primary) {
    state.dockHost?.remove();
    state.dockHost = null;
    state.dockShadow = null;
    state.dockRoute = "";
    syncSharedDock();
    return;
  }
  if (!state.dockHost) {
    const host = document.createElement("div");
    host.id = `${IDENT}-dock`;
    const shadow = host.attachShadow({
      mode: "open",
    });
    shadow.addEventListener("click", onClick);
    DragDock.attach(shadow);
    state.dockHost = host;
    state.dockShadow = shadow;
  }
  // Locate the entire navigation/header block and insert AFTER it, never
  // between its flex children. Prefer the sibling immediately following the
  // tablist wrapper. If unavailable, insert before the first timeline cell.
  const tabs = primary.querySelector<HTMLElement>(DOM_SELECTORS.tabLists);
  const header =
    tabs?.closest(NATIVE_X_SELECTORS.scrollSnapList)?.parentElement ||
    tabs?.parentElement?.parentElement ||
    null;
  const cells = [...primary.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.timelineCells)];
  const firstCell = cells.find((el) => el.closest(NATIVE_X_SELECTORS.primaryColumn) === primary);
  let target: ChildNode = firstCell;
  while (target && target.parentElement !== primary) {
    target = target.parentElement;
  }
  if (onSearch && header) {
    let block = header;
    while (block.parentElement && block.parentElement !== primary) {
      block = block.parentElement;
    }
    if (block.parentElement === primary) {
      target = block.nextSibling;
    }
  }
  const host = state.dockHost;
  applyComponentStyle(host, "rx-dock-host", false);
  // Mount once per primary column; virtualized cells must never move the dock.
  if (host.parentNode !== primary) {
    primary.insertBefore(host, target);
  }
  const routeName = onSearch ? "search" : "home";
  if (state.dockRoute !== routeName) {
    state.dockRoute = routeName;
    renderDock();
  }
  syncSharedDock();
}

export function repaint() {
  Studio.invalidate("state");
  renderRoot();
  ensureDock();
  renderDock();
  // Busca global antiga desativada: usar somente o botão flutuante configurável.
  applyPostLimit();
  ResultEnhancer.scan();
}

// Consolidated DragDock controller
export let DragDock: any;


export function initializeDeckDragDock() {
  Studio.ctx?.onDispose(unregisterSharedDock);
  DragDock = (() => {
    let active = null,
      swallowUntil = 0;
    const point = (event) => event.touches?.[0] || event.changedTouches?.[0] || event;
    const reset = () => {
      if (!active) {
        return;
      }
      clearTimeout(active.timer);
      const shadow = active.shadow;
      shadow
        .querySelectorAll(RODX_SELECTORS.dragStateItems)
        .forEach((el) => el.classList.remove("dragging", "drop-before", "drop-after"));
      active.ghost?.remove();
      active = null;
    };
    function move(fromId, beforeId, after = false) {
      if (!fromId || !beforeId || fromId === beforeId) {
        return;
      }
      const previous = state.searches.slice();
      const from = state.searches.findIndex((s) => s.id === fromId);
      const dest = state.searches.findIndex((s) => s.id === beforeId);
      if (from < 0 || dest < 0) {
        return;
      }
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
      if (!active) {
        return null;
      }
      const elements = [...active.shadow.querySelectorAll(RODX_SELECTORS.draggableItems)].filter(
        (el) => el.dataset.dragId !== active.id,
      );
      const direct = active.shadow.elementFromPoint?.(x, y)?.closest?.(RODX_SELECTORS.draggableItems);
      if (direct && direct.dataset.dragId !== active.id) {
        return direct;
      }
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
      if (!active?.started) {
        return;
      }
      const shadow = active.shadow;
      const nav = shadow.querySelector(RODX_SELECTORS.searchDock);
      if (nav) {
        const r = nav.getBoundingClientRect();
        if (x > r.right - 34) {
          nav.scrollLeft += 15;
        } else if (x < r.left + 34) {
          nav.scrollLeft -= 15;
        }
      }
      const item = closestTarget(x, y);
      shadow
        .querySelectorAll(RODX_SELECTORS.dropIndicators)
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
        active.ghost.style.setProperty("left", x + 9 + "px", "important");
        active.ghost.style.setProperty("top", y - 14 + "px", "important");
      }
    }
    function start(x, y) {
      if (!active || active.started) {
        return;
      }
      active.started = true;
      active.handle.closest(RODX_SELECTORS.draggableItems)?.classList.add("dragging");
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
          if (e.target.closest(RODX_SELECTORS.draggableItems)) {
            e.preventDefault();
          }
        },
        true,
      );
      shadow.addEventListener(
        "selectstart",
        (e) => {
          if (e.target.closest(RODX_SELECTORS.dragHandles)) {
            e.preventDefault();
          }
        },
        true,
      );
      shadow.addEventListener(
        "contextmenu",
        (e) => {
          if (e.target.closest(RODX_SELECTORS.dragHandles)) {
            e.preventDefault();
          }
        },
        true,
      );
      shadow.addEventListener(
        "click",
        (e) => {
          if (Date.now() < swallowUntil && e.target.closest(RODX_SELECTORS.draggableItems)) {
            e.stopImmediatePropagation();
            e.preventDefault();
          }
        },
        true,
      );
      const down = (e) => {
        const h = e.target.closest?.(RODX_SELECTORS.dragHandles);
        if (!h) {
          return;
        }
        if (active) {
          reset();
        }
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
        if (e.type === "touchstart" && e.cancelable) {
          e.preventDefault();
        }
        active.timer = setTimeout(() => {
          if (active && active.id === id) {
            start(active.startX, active.startY);
          }
        }, RUNTIME_LIMITS.uiDraggableDock.attachDelayMs);
      };
      const track = (e) => {
        if (!active) {
          return;
        }
        const p = point(e);
        if (!p) {
          return;
        }
        if (e.cancelable) {
          e.preventDefault();
        }
        if (!active.started) {
          if (Math.hypot(p.clientX - active.startX, p.clientY - active.startY) > 5) {
            clearTimeout(active.timer);
            start(p.clientX, p.clientY);
          }
        }
        if (active.started) {
          setDrop(p.clientX, p.clientY);
        }
      };
      const up = (e) => {
        if (!active) {
          return;
        }
        const p = point(e);
        if (active.started) {
          if (p) {
            setDrop(p.clientX, p.clientY);
          }
          const { id, target, after } = active;
          swallowUntil = Date.now() + 650;
          reset();
          if (target) {
            move(id, target, after);
          }
        } else {
          reset();
        }
        if (e.type === "touchend" && e.cancelable) {
          e.preventDefault();
        }
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
          if (e.pointerType !== "touch") {
            down(e);
          }
        },
        true,
      );
      shadow.addEventListener(
        "pointermove",
        (e) => {
          if (e.pointerType !== "touch") {
            track(e);
          }
        },
        true,
      );
      shadow.addEventListener(
        "pointerup",
        (e) => {
          if (e.pointerType !== "touch") {
            up(e);
          }
        },
        true,
      );
      shadow.addEventListener(
        "pointercancel",
        (e) => {
          if (e.pointerType !== "touch") {
            reset();
          }
        },
        true,
      );
    }
    return Object.freeze({
      attach,
    });
  })();
}
