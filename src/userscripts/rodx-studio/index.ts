import { Studio } from "./core/studio.js";
import { ScriptContext } from "../../core/runtime";
import { initializeNetwork } from "./bootstrap/initializeNetwork.js";
import { initializeDeck } from "./bootstrap/initializeDeck.js";
import { openPanel, Preferences } from "./ui/preferences.js";

// ============================================================================
// Constantes Semânticas
// ============================================================================
const WINDOW_RODX_FLAG = "__rodxStudioV3";
const DOM_CONTENT_LOADED_EVENT = "DOMContentLoaded";
const DOCUMENT_LOADING_STATE = "loading";

const DOCK_ACTIONS = {
  saved: { id: "saved", label: "Pesquisas", panel: "saved" as const },
  editor: { id: "editor", label: "Editor", panel: "editor" as const },
  presets: { id: "presets", label: "Presets", panel: "presets" as const },
  settings: { id: "rodx-settings", label: "Preferências do X", panel: "visual" as const },
  filters: { id: "rodx-feed-filters", label: "Filtros do feed" },
} as const;

// Tipagem global estrita para window
declare global {
  interface Window {
    [WINDOW_RODX_FLAG]?: boolean;
  }
}

// ============================================================================
// Funções Auxiliares Semânticas
// ============================================================================
function hasRodXAlreadyStarted(win: Window & typeof globalThis): boolean {
  return Boolean(win[WINDOW_RODX_FLAG]);
}

function markRodXAsStarted(win: Window & typeof globalThis): void {
  win[WINDOW_RODX_FLAG] = true;
}

function scheduleDeckInitialization(): void {
  if (document.readyState === DOCUMENT_LOADING_STATE) {
    document.addEventListener(DOM_CONTENT_LOADED_EVENT, initializeDeck, { once: true });
  } else {
    initializeDeck();
  }
}

function registerStudioDockActions(ctx: ScriptContext): void {
  ctx.dock?.register([
    {
      id: DOCK_ACTIONS.saved.id,
      label: DOCK_ACTIONS.saved.label,
      run: () => openPanel(DOCK_ACTIONS.saved.panel),
    },
    {
      id: DOCK_ACTIONS.editor.id,
      label: DOCK_ACTIONS.editor.label,
      run: () => openPanel(DOCK_ACTIONS.editor.panel),
    },
    {
      id: DOCK_ACTIONS.presets.id,
      label: DOCK_ACTIONS.presets.label,
      run: () => openPanel(DOCK_ACTIONS.presets.panel),
    },
    {
      id: DOCK_ACTIONS.settings.id,
      label: DOCK_ACTIONS.settings.label,
      run: () => openPanel(DOCK_ACTIONS.settings.panel),
    },
    { id: DOCK_ACTIONS.filters.id, label: DOCK_ACTIONS.filters.label, run: () => Preferences?.filters() },
  ]);
}

// ============================================================================
// Funções Públicas (Pontos de Referência / Entrada)
// ============================================================================
export function startRodX(ctx: ScriptContext): void {
  if (hasRodXAlreadyStarted(window)) return;
  markRodXAsStarted(window);

  initializeNetwork();
  Studio.ctx = ctx;
  scheduleDeckInitialization();
}

export default {
  init(ctx: ScriptContext): void {
    registerStudioDockActions(ctx);
    startRodX(ctx);
  },
};
