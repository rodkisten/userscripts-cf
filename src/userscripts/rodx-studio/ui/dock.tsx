import { applyComponentStyle } from "../../../core/css.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import { IDENT } from "../config/search.js";
import { Studio } from "../core/studio.js";
import { applyPostLimit } from "../feeds/local-limits.js";
import { state } from "../state/deck.js";
import { ResultEnhancer } from "../tweets/enhancer.tsx";
import { DragDock } from "./draggable-dock.tsx";
import { onClick, performAction } from "./events.tsx";
import { renderDock, renderRoot } from "./search-workbench.tsx";


/** Keep the shared Dock registry in sync without emitting on every SPA repaint. */
let sharedDockSignature = "";

function syncSharedDock() {
  const pinned = state.searches.filter((search) => search.pinned);
  const quickLists = Studio.services.lists?.quickLists() ?? [];
  const signature = JSON.stringify({
    account: state.account,
    route: state.dockRoute,
    pinned: pinned.map((search) => [search.id, search.name, search.icon, search.query, search.sort]),
    lists: quickLists.map((list) => [list.id, Studio.services.lists.displayName(list)]),
  });
  if (signature === sharedDockSignature) return;
  sharedDockSignature = signature;

  const actions = [
    { id: "home", label: "Início", action: "home" },
    { id: "new", label: "Criar timeline", action: "new" },
    { id: "organize", label: "Organizar pesquisas", action: "open" },
    { id: "lists", label: "Listas", action: "lists-studio" },
  ].map(({ id, label, action }) => ({
    id,
    label,
    run: () => { void performAction(action); },
  }));
  for (const search of pinned) {
    actions.push({
      id: `search:${search.id}`,
      label: `${search.icon ?? ""} ${search.name}`.trim(),
      run: () => { void performAction("open-search", String(search.id)); },
    });
  }
  for (const list of quickLists) {
    actions.push({
      id: `list:${list.id}`,
      label: Studio.services.lists.displayName(list),
      run: () => {
        const buttons = state.dockShadow?.querySelectorAll<HTMLElement>("[data-studio-list]");
        [...(buttons ?? [])].find((button) => button.dataset.studioList === String(list.id))?.click();
      },
    });
  }
  document.dispatchEvent(new CustomEvent("rod-dock:registry", {
    detail: { type: "register", module: { id: "rodx-studio", name: "RodX Studio", actions } },
  }));
}

function unregisterSharedDock() {
  if (!sharedDockSignature) return;
  sharedDockSignature = "";
  document.dispatchEvent(new CustomEvent("rod-dock:registry", {
    detail: { type: "unregister", id: "rodx-studio" },
  }));
}

export function ensureDock() {
  // The native search header is sticky and has its own flex layout. Never
  // insert a dock between its input and tabs (which broke mobile layouts).
  const path = location.pathname;
  const onHome = path === "/home";
  const onSearch = /^\/(?:search(?:\/|$)|hashtag\/)/.test(path);
  const primary =
    onHome || onSearch ? document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) : null;
  if (!primary) {
    unregisterSharedDock();
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
  const tabs = primary.querySelector<HTMLElement>(DOM_SELECTORS.tabLists);
  const header =
    tabs?.closest(NATIVE_X_SELECTORS.scrollSnapList)?.parentElement ||
    tabs?.parentElement?.parentElement ||
    null;
  const cells = [...primary.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.timelineCells)];
  const firstCell = cells.find((el) => el.closest(NATIVE_X_SELECTORS.primaryColumn) === primary);
  let target: ChildNode = firstCell;
  while (target && target.parentElement !== primary) target = target.parentElement;
  if (onSearch && header) {
    let block = header;
    while (block.parentElement && block.parentElement !== primary) block = block.parentElement;
    if (block.parentElement === primary) target = block.nextSibling;
  }
  const host = state.dockHost;
  applyComponentStyle(host, "rx-dock-host", false);
  // Mount once per primary column; virtualized cells must never move the dock.
  if (host.parentNode !== primary) primary.insertBefore(host, target);
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
