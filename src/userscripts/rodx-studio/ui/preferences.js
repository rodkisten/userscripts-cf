import { Studio } from "../core/studio.js";
import { FeedFilters } from "../feeds/filters.tsx";
import { state } from "../state/deck.js";
import { normalizeVisual } from "../state/visual.js";
import { saveState } from "../storage/account.js";
import { XRepost } from "../tweets/publisher.tsx";
import { buildStudioPreferences } from "./preferences-schema.tsx";
import { blankDraft, renderRoot } from "./search-workbench.tsx";
import { showRodxToast } from "./toast.tsx";

export let Preferences;

export function initializeDeckPreferences() {
  Preferences = buildStudioPreferences(Studio, {
    state,
    normalizeVisual,
    saveState,
    publish: () => FeedFilters.publish(),
    scope: () => FeedFilters.scope(),
    feedSettings: () => FeedFilters.settings(),
    toast: showRodxToast,
  });
}

export function closePanel() {
  state.open = false;
  renderRoot();
}

export function openPanel(view = "saved") {
  if (view === "visual") {
    Studio.services.lists?.close();
    state.open = false;
    renderRoot();
    Preferences.open();
    return;
  }
  Studio.services.lists?.close();
  state.view = view;
  state.open = true;
  state.message = "";
  if (view === "editor" && !state.draft) state.draft = blankDraft();
  renderRoot();
  if (view === "xrepost") XRepost.onOpen();
}
