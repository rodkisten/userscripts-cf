export function installRecommendationCleanup(Studio) {
  Studio.register(
    "feeds.recommendations",
    () => {
      const labels =
        /^(?:sugerid[oa]s?|quem seguir|who to follow|suggested(?: for you)?|recommended(?: for you)?|talvez você curta|you might like)$/i;
      const candidates = new Set(
        document.querySelectorAll('[data-testid="UserRecommendations"],[data-testid="whoToFollow"]'),
      );
      for (const h of document.querySelectorAll('aside h2,[role="complementary"] [role="heading"]'))
        if (labels.test(h.textContent.trim())) {
          const box = h.closest('aside,[role="complementary"]');
          if (box && !box.querySelector("article")) candidates.add(box);
        }
      for (const box of candidates)
        if (!box.closest("article")) box.style.setProperty("display", "none", "important");
    },
    { minMs: 700 },
  );
}
