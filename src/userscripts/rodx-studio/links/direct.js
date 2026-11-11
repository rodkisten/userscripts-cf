import { CSS_SELECTORS } from "../../../selectors.js";
export let DirectLinks;

export function initializeDeckDirectLinks() {
  DirectLinks = (() => {
    const cache = new Map();
    const failures = new Map();
    const inProgress = new Set();
    let scans = 0;
    const SHORT = /^https?:\/\/t\.co\/[a-zA-Z0-9]+(?:[?#].*)?$/i;
    function safeLink(raw) {
      const value = String(raw || "").trim();
      if (!/^https?:\/\//i.test(value)) return "";
      try {
        const url = new URL(value);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
        if (url.hostname === "t.co" || url.hostname.endsWith(".t.co")) return "";
        return url.href;
      } catch {
        return "";
      }
    }
    function show(anchor, expanded) {
      if (!anchor.isConnected || !expanded) return;
      anchor.href = expanded;
      anchor.dataset.rodxExpanded = expanded;
      anchor.title = expanded;
      const text = (anchor.textContent || "").trim();
      if (text.startsWith("https://t.co/") || text.startsWith("http://t.co/")) {
        anchor.textContent = expanded;
      }
    }
    function known(anchor) {
      for (const attr of ["data-expanded-url", "data-full-url", "data-url", "title"]) {
        const url = safeLink(anchor.getAttribute(attr));
        if (url) return url;
      }
      // A complete displayed URL is safe to use. Truncated text with an ellipsis
      // is not a valid URL and must never be guessed.
      const text = (anchor.textContent || "").trim();
      return !/[…\u2026]/.test(text) ? safeLink(text) : "";
    }
    async function resolve(short) {
      if (cache.has(short)) return cache.get(short);
      if ((failures.get(short) || 0) > Date.now()) return "";
      const gm =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
            ? GM.xmlHttpRequest.bind(GM)
            : null;
      if (!gm) return "";
      const expanded = await new Promise((resolve) => {
        try {
          gm({
            url: short,
            method: "HEAD",
            timeout: 7500,
            onload: (resp) => resolve(safeLink(resp.finalUrl || resp.responseURL)),
            onerror: () => resolve(""),
            ontimeout: () => resolve(""),
          });
        } catch {
          resolve("");
        }
      });
      if (expanded) {
        cache.set(short, expanded);
        failures.delete(short);
      } else failures.set(short, Date.now() + 10 * 60_000);
      return expanded;
    }
    function scan() {
      if (++scans % 3 !== 0) return;
      const anchors = [...document.querySelectorAll(CSS_SELECTORS.tweetContentLinks)].filter((a) =>
        SHORT.test(a.getAttribute("href") || ""),
      );
      let count = 0;
      for (const anchor of anchors) {
        if (++count > 75) break;
        const short = anchor.href;
        const local = known(anchor) || cache.get(short);
        if (local) {
          show(anchor, local);
          continue;
        }
        if (inProgress.has(short) || inProgress.size >= 3) continue;
        inProgress.add(short);
        void resolve(short)
          .then((link) => {
            if (link && anchor.isConnected && anchor.href === short) show(anchor, link);
          })
          .finally(() => inProgress.delete(short));
      }
      if (cache.size > 800) cache.delete(cache.keys().next().value);
      if (failures.size > 500) failures.delete(failures.keys().next().value);
    }
    return Object.freeze({
      scan,
    });
  })();
}
