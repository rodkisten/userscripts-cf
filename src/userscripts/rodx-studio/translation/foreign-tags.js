import { RODX_SELECTORS } from "../../../selectors.js";
import { state } from "../state/deck.js";

export let ForeignTags;

export function initializeDeckForeignTags() {
  ForeignTags = (() => {
    const cache = new Map(),
      waiting = new Map();
    let active = 0,
      started = 0;
    const MAX = 180;
    const languageAllowed = new Set(["pt", "es", "en"]);
    const gmRequest = (args) => {
      const fn =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
            ? GM.xmlHttpRequest.bind(GM)
            : null;
      if (!fn) return Promise.reject(new Error("GM HTTP indisponível"));
      return new Promise((resolve, reject) => {
        try {
          fn({
            ...args,
            onload: (r) =>
              r.status >= 200 && r.status < 300 ? resolve(r) : reject(new Error("HTTP " + r.status)),
            onerror: () => reject(new Error("Rede indisponível")),
            ontimeout: () => reject(new Error("Timeout")),
          });
        } catch (e) {
          reject(e);
        }
      });
    };
    const translate = async (tag) => {
      const text = tag.replace(/^#/, "").replace(/_/g, " ").trim();
      const response = await gmRequest({
        url:
          "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=" +
          encodeURIComponent(text),
        method: "GET",
        timeout: 7000,
        responseType: "text",
      });
      const json = JSON.parse(response.responseText || "null");
      const lang = String(json?.[2] || "")
        .toLowerCase()
        .split("-")[0];
      const translated = (json?.[0] || [])
        .map((part) => part?.[0] || "")
        .join("")
        .trim();
      if (
        !lang ||
        languageAllowed.has(lang) ||
        !translated ||
        translated.toLocaleLowerCase() === text.toLocaleLowerCase()
      )
        return null;
      return {
        translation: translated,
        lang,
      };
    };
    const apply = (key) => {
      const value = cache.get(key);
      for (const item of document.querySelectorAll(RODX_SELECTORS.hashtagItems)) {
        if (
          String(item.dataset.tag || "")
            .replace(/^#/, "")
            .toLocaleLowerCase() !== key
        )
          continue;
        item.querySelector(RODX_SELECTORS.tagTranslation)?.remove();
        // All hashtag actions live in OUR tray. Keep original tags visible here;
        // only add parenthesized translation for languages outside PT/ES/EN.
        item.hidden = false;
        if (value?.translation) {
          const span = document.createElement("span");
          span.className = "rodx-tag-translation";
          span.textContent = "(" + value.translation + ")";
          span.title = "Tradução do idioma " + value.lang;
          item.append(span);
        }
      }
    };
    function scan(tray) {
      if (!state.visual.translateForeignTags) return;
      for (const item of tray.querySelectorAll(RODX_SELECTORS.hashtagItems)) {
        const key = String(item.dataset.tag || "")
          .replace(/^#/, "")
          .toLocaleLowerCase();
        if (!key || key.length > 65 || /^\d+$/.test(key)) {
          item.hidden = false;
          continue;
        }
        if (cache.has(key)) {
          apply(key);
          continue;
        }
        // Keep both + and minus available even before optional translation resolves.
        item.hidden = false;
        if (waiting.has(key) || active >= 2 || started >= MAX) continue;
        active++;
        started++;
        const promise = translate(item.dataset.tag)
          .then((value) => {
            cache.set(key, value);
            if (cache.size > 450) cache.delete(cache.keys().next().value);
            apply(key);
          })
          .catch(() => {
            cache.set(key, {
              unavailable: true,
            });
            apply(key); /* Unknown: keep only native hashtag. */
          })
          .finally(() => {
            active--;
            waiting.delete(key);
          });
        waiting.set(key, promise);
      }
    }
    return Object.freeze({
      scan,
    });
  })();
}
