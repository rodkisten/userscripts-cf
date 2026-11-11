import { Studio } from "../core/studio.js";
import { FeedFilters } from "../feeds/filters.js";
import { state } from "../state/deck.js";
import { normalizeVisual } from "../state/visual.js";
import { saveState } from "../storage/account.js";
import { XRepost } from "../tweets/publisher.js";
import { buildStudioPreferences } from "./preferences-schema.js";
import { blankDraft, renderRoot } from "./search-workbench.js";
import { showRodxToast } from "./toast.js";

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
