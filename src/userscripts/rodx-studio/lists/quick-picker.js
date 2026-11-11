import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { RODX_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import {
  cleanHandle,
  displayListName,
  esc,
  listUsage,
  normalize,
  orderedQuickLists,
  qs,
  refresh,
  render,
  settings,
  state,
  usageStat,
  validHandle,
} from "./render.js";
import { host, shadow, style } from "./view.js";

export function initializeRodX_lists_78() {
  shadow.appendChild(style);
}

export let shell;

export function initializeListsShell() {
  shell = document.createElement("div");
}

export function initializeRodX_lists_80() {
  shell.innerHTML = `<button type="button" class="fab" id="xls-fab" aria-label="Abrir X Lists Studio">☷ Lists</button>
    <div class="overlay" id="xls-overlay"><section class="panel" role="dialog" aria-label="X Lists Studio">
      <div class="top"><div class="brand"><strong>▰ X LISTS STUDIO</strong><small>Gerencie, filtre, copie e restaure</small></div>
        <button class="btn ghost" data-action="close" aria-label="Fechar painel">✕</button></div>
      <nav class="tabs" id="xls-tabs"></nav>
      <div class="body" id="xls-body"></div>
      <div class="footer" id="xls-footer">Armazenamento local · sem API paga</div>
    </section></div>`;
}

export function initializeRodX_lists_81() {
  shadow.appendChild(shell);
}

export let quickRoot;

export function initializeListsQuickRoot() {
  quickRoot = document.createElement("div");
}

export function initializeRodX_lists_83() {
  quickRoot.innerHTML = `<div class="quick-backdrop" id="xls-quick-backdrop"></div>
    <section class="quick-picker" id="xls-quick-picker" role="dialog" aria-label="Adicionar usuário a uma lista">
      <div class="quick-head"><div><strong id="xls-quick-title">Escolher lista</strong>
        <div class="small" id="xls-quick-subtitle">Toque na lista para colocar na fila</div></div>
        <button class="btn mini ghost" id="xls-quick-close" type="button" aria-label="Fechar">✕</button></div>
      <div class="rx-quick-picker-search-field"><input id="xls-quick-search" class="quick-search" type="search"
        placeholder="Buscar listas" autocomplete="off" aria-label="Buscar lista"></div>
      <div class="quick-flags"><label><input type="checkbox" id="xls-quick-follow"> Seguir</label>
        <label><input type="checkbox" id="xls-quick-reposts"> Desativar reposts</label></div>
      <div class="quick-options" id="xls-quick-options"></div>
      <div class="quick-status" id="xls-quick-status"></div>
    </section><div class="quick-toast" id="xls-quick-toast" role="status" aria-live="polite"></div>`;
}

export function initializeRodX_lists_84() {
  shadow.appendChild(quickRoot);
}

export let overlay;

export function initializeListsOverlay() {
  overlay = qs(RODX_SELECTORS.listsOverlay, shadow);
}

export let body;

export function initializeListsBody() {
  body = qs(RODX_SELECTORS.listsBody, shadow);
}

export let tabArea;

export function initializeListsTabArea() {
  tabArea = qs(RODX_SELECTORS.listsTabs, shadow);
}

export function initializeRodX_lists_88() {
  qs(RODX_SELECTORS.listsFloatingButton, shadow).remove();
}

export function initializeRodX_lists_89() {
  qs(RODX_SELECTORS.listsOverlay, shadow).addEventListener("click", (event) => {
    if (event.target === overlay) toggle(false);
  });
}

export function toggle(open) {
  if (open) Studio.services.deck?.close();
  state.visible = open;
  overlay.classList.toggle("open", open);
  if (open) {
    Studio.menu.panel("lists", "Listas e membros", host, () => {
      state.visible = false;
      overlay.classList.remove("open");
    });
    refresh();
  } else Studio.menu.close("lists");
}

export function notice(message, type = "") {
  state.message = message;
  state.messageType = type;
  if (state.visible) render();
}

export let noteHTML;

export function initializeListsNoteHTML() {
  noteHTML = () =>
    state.message ? `<div class="notice ${esc(state.messageType)}">${esc(state.message)}</div>` : "";
}

export let optionsHTML;

export function initializeListsOptionsHTML() {
  optionsHTML = (value, options) =>
    options
      .map(
        ([id, label]) =>
          `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
}

export let listOptions;

export function initializeListsListOptions() {
  listOptions = (selected = "", ignore = "") =>
    optionsHTML(
      selected,
      state.lists.filter((x) => x.id !== ignore).map((x) => [x.id, displayListName(x)]),
    );
}

export let currentList;

export function initializeListsCurrentList() {
  currentList = () => state.lists.find((l) => l.id === state.listId);
}

export let memberCount;

export function initializeListsMemberCount() {
  memberCount = () => state.members.length;
}

export let quickOrder;

export function initializeListsQuickOrder() {
  quickOrder = [];
}

export let quickUser;

export function initializeListsQuickUser() {
  quickUser = null;
}

export let quickAnchor;

export function initializeListsQuickAnchor() {
  quickAnchor = null;
}

export let quickSearchValue;

export function initializeListsQuickSearchValue() {
  quickSearchValue = "";
}

export let quickToastTimer;

export function initializeListsQuickToastTimer() {
  quickToastTimer = null;
}

export let quickBackdrop;

export function initializeListsQuickBackdrop() {
  quickBackdrop = qs(RODX_SELECTORS.quickPickerBackdrop, shadow);
}

export let quickPicker;

export function initializeListsQuickPicker() {
  quickPicker = qs(RODX_SELECTORS.quickPicker, shadow);
}

export let quickSearch;

export function initializeListsQuickSearch() {
  quickSearch = qs(RODX_SELECTORS.quickPickerSearch, shadow);
}

export let quickOptions;

export function initializeListsQuickOptions() {
  quickOptions = qs(RODX_SELECTORS.quickPickerOptions, shadow);
}

export function quickToast(message) {
  const el = qs(RODX_SELECTORS.quickPickerToast, shadow);
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(quickToastTimer);
  quickToastTimer = setTimeout(
    () => el.classList.remove("show"),
    RUNTIME_LIMITS.listsQuickPicker.quickToastDelayMs,
  );
}

export function closeQuickPicker() {
  quickUser = null;
  quickOrder = [];
  quickAnchor = null;
  quickPicker.classList.remove("open");
  quickBackdrop.classList.remove("open");
}

export function positionQuickPicker() {
  if (!quickAnchor || !quickUser || !quickPicker.classList.contains("open")) return;
  if (window.matchMedia("(max-width:600px)").matches) return;
  const rect = quickAnchor.getBoundingClientRect();
  const viewport = window.visualViewport;
  const width = Math.min(350, window.innerWidth - 16);
  let left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const height = Math.min(500, Math.round(window.innerHeight * 0.65));
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
  quickPicker.style.setProperty("left", `${left}px`, "important");
  quickPicker.style.setProperty("top", `${top}px`, "important");
  if (viewport && viewport.scale !== 1)
    quickPicker.style.setProperty("top", `${Math.max(8, top)}px`, "important");
}

export function renderQuickOptions() {
  if (!quickUser) return;
  const term = normalize(quickSearchValue);
  const byId = new Map(state.lists.map((row) => [String(row.id), row]));
  const known = new Set(quickOrder);
  const stable = [
    ...quickOrder.map((id) => byId.get(id)).filter(Boolean),
    ...orderedQuickLists().filter((row) => !known.has(String(row.id))),
  ];
  const lists = stable.filter(
    (l) => normalize(displayListName(l)).includes(term) || String(l.id).includes(term),
  );
  quickOptions.innerHTML =
    lists
      .map((l, i) => {
        const last = l.id === listUsage.lastId;
        const stat = usageStat(l.id);
        const frequent = stat.count > 1 && !last;
        const already = quickUser.sourceId && l.id === quickUser.sourceId;
        return `<button class="quick-option" type="button" data-quick-list-id="${esc(l.id)}" ${already ? "disabled" : ""}>
        <span class="rx-quick-picker-list-icon">${last ? "★" : frequent ? "◷" : "☷"}</span>
        <span class="copy">${esc(displayListName(l))}<small>${last ? "Última lista usada" : frequent ? `Usada ${Number(stat.count)} vezes` : `Lista #${esc(l.id)}`}</small></span>
        <span class="checkmark">${already ? "Origem" : "Adicionar"}</span></button>`;
      })
      .join("") ||
    `<div class="rx-quick-picker-empty-state">${term ? "Nenhuma lista corresponde à busca." : "Nenhuma lista salva. Abra a aba Listas e sincronize suas listas."}</div>`;
  qs(RODX_SELECTORS.quickPickerStatus, shadow).textContent =
    `${state.lists.length} listas locais · Adição imediata · ${state.bridgeStatus}`;
}

export function refreshQuickPickerIfOpen() {
  if (quickUser && quickPicker.classList.contains("open") && !quickSearchValue) renderQuickOptions();
}

export async function openQuickPicker(user, anchor) {
  if (!user?.username || !validHandle(user.username)) return;
  if (!state.lists.length) {
    await refresh();
  }
  quickUser = {
    username: cleanHandle(user.username),
    name: user.name || "",
    userId: user.userId || "",
    sourceId: user.sourceId || "",
  };
  quickAnchor = anchor;
  quickOrder = orderedQuickLists().map((row) => String(row.id));
  quickSearchValue = "";
  quickSearch.value = "";
  qs(RODX_SELECTORS.quickPickerTitle, shadow).textContent = `@${quickUser.username}`;
  qs(RODX_SELECTORS.quickPickerSubtitle, shadow).textContent =
    "Adição individual imediata, confirmada pelo X";
  qs(RODX_SELECTORS.quickPickerFollow, shadow).checked = Boolean(settings.quickAddFollow);
  qs(RODX_SELECTORS.quickPickerReposts, shadow).checked = Boolean(settings.quickAddDisableReposts);
  quickBackdrop.classList.add("open");
  quickPicker.classList.add("open");
  renderQuickOptions();
  positionQuickPicker();
}

export function initializeRodX_lists_112() {
  quickBackdrop.addEventListener("click", closeQuickPicker);
}

export function initializeRodX_lists_113() {
  qs(RODX_SELECTORS.quickPickerClose, shadow).addEventListener("click", closeQuickPicker);
}

export function initializeRodX_lists_114() {
  quickSearch.addEventListener("input", () => {
    quickSearchValue = quickSearch.value;
    renderQuickOptions();
  });
}
