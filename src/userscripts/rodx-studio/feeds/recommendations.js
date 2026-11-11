import { NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
export function installRecommendationCleanup(Studio) {
  Studio.register(
    "feeds.recommendations",
    () => {
      const labels =
        /^(?:sugerid[oa]s?|quem seguir|who to follow|suggested(?: for you)?|recommended(?: for you)?|talvez você curta|you might like)$/i;
      const candidates = new Set(document.querySelectorAll(NATIVE_X_SELECTORS.userRecommendations));
      for (const h of document.querySelectorAll(DOM_SELECTORS.sidebarHeadings))
        if (labels.test(h.textContent.trim())) {
          const box = h.closest(DOM_SELECTORS.sidebarContainers);
          if (box && !box.querySelector(DOM_SELECTORS.articles)) candidates.add(box);
        }
      for (const box of candidates)
        if (!box.closest(DOM_SELECTORS.articles)) box.style.setProperty("display", "none", "important");
    },
    { minMs: 700 },
  );
}
