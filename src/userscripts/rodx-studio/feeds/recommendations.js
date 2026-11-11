import { CSS_SELECTORS } from "../../../selectors.js";
export function installRecommendationCleanup(Studio) {
  Studio.register(
    "feeds.recommendations",
    () => {
      const labels =
        /^(?:sugerid[oa]s?|quem seguir|who to follow|suggested(?: for you)?|recommended(?: for you)?|talvez você curta|you might like)$/i;
      const candidates = new Set(document.querySelectorAll(CSS_SELECTORS.s038));
      for (const h of document.querySelectorAll(CSS_SELECTORS.s039))
        if (labels.test(h.textContent.trim())) {
          const box = h.closest(CSS_SELECTORS.s040);
          if (box && !box.querySelector(CSS_SELECTORS.s041)) candidates.add(box);
        }
      for (const box of candidates)
        if (!box.closest(CSS_SELECTORS.s041)) box.style.setProperty("display", "none", "important");
    },
    { minMs: 700 },
  );
}
