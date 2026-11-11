import { IDENT } from "../config/search.js";
import { Studio } from "../core/studio.js";
import { applyPostLimit } from "../feeds/local-limits.js";
import { state } from "../state/deck.js";
import { ResultEnhancer } from "../tweets/enhancer.js";
import { DragDock } from "./draggable-dock.js";
import { onClick } from "./events.js";
import { renderDock, renderRoot } from "./search-workbench.js";

export function ensureDock() {
  // The native search header is sticky and has its own flex layout. Never
  // insert a dock between its input and tabs (which broke mobile layouts).
  const path = location.pathname;
  const onHome = path === "/home";
  const onSearch = /^\/(?:search(?:\/|$)|hashtag\/)/.test(path);
  const primary = onHome || onSearch ? document.querySelector('[data-testid="primaryColumn"]') : null;
  if (!primary) {
    state.dockHost?.remove();
    state.dockHost = null;
    state.dockShadow = null;
    state.dockRoute = "";
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
  const tabs = primary.querySelector('[role="tablist"]');
  const header =
    tabs?.closest('[data-testid="ScrollSnap-List"]')?.parentElement ||
    tabs?.parentElement?.parentElement ||
    null;
  const cells = [...primary.querySelectorAll('[data-testid="cellInnerDiv"]')];
  const firstCell = cells.find((el) => el.closest('[data-testid="primaryColumn"]') === primary);
  let target = firstCell;
  while (target && target.parentElement !== primary) target = target.parentElement;
  if (onSearch && header) {
    let block = header;
    while (block.parentElement && block.parentElement !== primary) block = block.parentElement;
    if (block.parentElement === primary) target = block.nextSibling;
  }
  const host = state.dockHost;
  host.style.cssText =
    "display:block;position:relative;z-index:1;min-width:0;max-width:100%;contain:layout style;";
  // Mount once per primary column; virtualized cells must never move the dock.
  if (host.parentNode !== primary) primary.insertBefore(host, target);
  const routeName = onSearch ? "search" : "home";
  if (state.dockRoute !== routeName) {
    state.dockRoute = routeName;
    renderDock();
  }
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
