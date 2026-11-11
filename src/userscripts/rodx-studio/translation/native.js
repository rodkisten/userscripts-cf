import { CSS_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";
import { state } from "../state/deck.js";

export let NativeTranslation;

export function initializeDeckNativeTranslation() {
  NativeTranslation = (() => {
    let lastScan = 0,
      lastClick = 0;
    const attempted = new WeakSet();
    const LABEL =
      /^(?:translate(?:\s+(?:post|tweet))?|traduzir(?:\s+(?:post|publica[cç][aã]o|tweet))?|traducir(?:\s+(?:post|publicaci[oó]n|tweet))?)$/i;
    function scan() {
      if (!state.visual.translatePosts || !document.body) return;
      const now = Date.now();
      if (now - lastScan < 1100 || now - lastClick < 800) return;
      lastScan = now;
      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        const r = article.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight + 160) continue;
        for (const el of article.querySelectorAll(CSS_SELECTORS.s215)) {
          if (
            attempted.has(el) ||
            !LABEL.test((el.innerText || el.textContent || "").trim().replace(/\s+/g, " "))
          )
            continue;
          attempted.add(el);
          lastClick = now;
          // Use the X-provided translation, not an invented translation overlay.
          try {
            el.click();
          } catch (error) {
            console.debug("[RodX] Tradução nativa indisponível:", error);
          }
          return;
        }
      }
    }
    return {
      scan,
    };
  })();
}
