import { CSS_SELECTORS } from "../../../selectors.js";
export function installRecommendationCleanup(Studio) {
  Studio.register(
    "feeds.recommendations",
    () => {
      const labels =
        /^(?:sugerid[oa]s?|quem seguir|who to follow|suggested(?: for you)?|recommended(?: for you)?|talvez você curta|you might like)$/i;
      const candidates = new Set(document.querySelectorAll(CSS_SELECTORS.userRecommendations));
      for (const h of document.querySelectorAll(CSS_SELECTORS.sidebarHeadings))
        if (labels.test(h.textContent.trim())) {
          const box = h.closest(CSS_SELECTORS.sidebarContainers);
          if (box && !box.querySelector(CSS_SELECTORS.articles)) candidates.add(box);
        }
      for (const box of candidates)
        if (!box.closest(CSS_SELECTORS.articles)) box.style.setProperty("display", "none", "important");
    },
    { minMs: 700 },
  );
}
