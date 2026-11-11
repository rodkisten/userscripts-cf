import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-ui-dock-1.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
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
  const primary = onHome || onSearch ? document.querySelector(CSS_SELECTORS.s031) : null;
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
  const tabs = primary.querySelector(CSS_SELECTORS.s035);
  const header =
    tabs?.closest(CSS_SELECTORS.s036)?.parentElement || tabs?.parentElement?.parentElement || null;
  const cells = [...primary.querySelectorAll(CSS_SELECTORS.s233)];
  const firstCell = cells.find((el) => el.closest(CSS_SELECTORS.s031) === primary);
  let target = firstCell;
  while (target && target.parentElement !== primary) target = target.parentElement;
  if (onSearch && header) {
    let block = header;
    while (block.parentElement && block.parentElement !== primary) block = block.parentElement;
    if (block.parentElement === primary) target = block.nextSibling;
  }
  const host = state.dockHost;
  host.style.cssText = cssDeclarations(inlineCSS1);
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
