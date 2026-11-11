import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { RODX_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { extractIdentity } from "./account.js";
import { SearchHistory } from "../search/history.tsx";
import { state } from "../state/deck.js";
import { loadAccount } from "../storage/account.js";
import { ensureDock, repaint } from "../ui/dock.tsx";
import { initializeRoot } from "../ui/root.tsx";

export function tick() {
  if (!document.body) return;
  if (!state.rootHost?.isConnected) initializeRoot();
  const route = `${location.pathname}${location.search}`;
  SearchHistory.currentRoute();
  if (route !== state.lastUrl) {
    state.lastUrl = route;
    // Never modify the native search box or install an overlay on it.
    state.readObserver?.disconnect();
    state.readObserver = null;
    state.readTimers.forEach(clearTimeout);
    state.readTimers.clear();
    state.readProgress = new WeakMap();
    document
      .querySelectorAll(RODX_SELECTORS.observedElements)
      .forEach((article) => delete article.dataset.rodxObserved);
    state.filterSignature = "";
    repaint();
  }
  const now = Date.now();
  if (now - state.lastAccountCheck > 550) {
    state.lastAccountCheck = now;
    const detected = extractIdentity();
    if (detected.key !== state.accountCandidate) {
      state.accountCandidate = detected.key;
      state.accountCandidateSince = now;
      setTimeout(() => Studio.queue("identity.navigation"), RUNTIME_LIMITS.identityNavigation.tickDelayMs);
    }
    // A numeric ID is stable even while X is updating its desktop/mobile menu.
    // Fallback handles require a short stable interval to avoid stale-account reads.
    const transientIdentity = !detected.key && Boolean(state.account);
    const temporaryCookieLoss =
      !detected.id &&
      Boolean(state.account?.startsWith("uid-")) &&
      Boolean(detected.handle) &&
      state.accountLabel.toLowerCase() === `@${detected.handle}`;
    // On iOS the profile link disappears during X route transitions. Never
    // reset an editor just because a navigation temporarily hid the identity.
    if (
      detected.key !== (state.account || "") &&
      !transientIdentity &&
      !temporaryCookieLoss &&
      (detected.id || now - state.accountCandidateSince > 2500)
    ) {
      void loadAccount(detected);
    } else if (
      detected.key === state.account &&
      detected.label !== state.accountLabel &&
      (!detected.id || now - state.accountCandidateSince > 550)
    ) {
      state.accountLabel = detected.label;
      state.accountSource = detected.source;
      repaint();
    }
  }
  ensureDock();
}
