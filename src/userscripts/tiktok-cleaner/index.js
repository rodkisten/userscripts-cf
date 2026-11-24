// TikTok Safari Cleaner: remove app-install prompts and sponsored feed items.
// This module runs in page world so fetch/XHR wrappers can observe page traffic.
const AD_KEYS = new Set(["is_ad", "is_ads", "is_sponsored", "is_advertisement"]);
const AD_VALUES = new Set(["ad", "ads", "advertisement", "sponsored"]);
const APP_URL =
  /^(?:itms-apps:|market:|https?:\/\/(?:apps\.apple\.com|itunes\.apple\.com|play\.google\.com)\/)/i;
const PROMPT =
  /(?:download|install|open|baixar|instalar|abrir).{0,30}(?:app|aplicativo|tiktok)|(?:app|aplicativo).{0,30}(?:download|install|baixar|instalar)/i;
const BLOCKED = "[data-rod-tiktok-hidden]";
function isAd(item) {
  if (!item || typeof item !== "object") {
return false;
}
  for (const [key, value] of Object.entries(item)) {
    if (AD_KEYS.has(key.toLowerCase()) && (value === true || value === 1 || value === "1")) {
return true;
}
    if (
      ["type", "content_type", "item_type"].includes(key.toLowerCase()) &&
      typeof value === "string" &&
      AD_VALUES.has(value.toLowerCase())
    )
      {
return true;
}
    if (key.toLowerCase() === "ad_info" && value && typeof value === "object") {
return true;
}
  }
  return false;
}

function filterFeed(value, depth = 0) {
  if (depth > 12 || !value || typeof value !== "object") {
return value;
}
  if (Array.isArray(value))
    {
return value.filter((item) => !isAd(item)).map((item) => filterFeed(item, depth + 1));
}
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") {
value[key] = filterFeed(child, depth + 1);
}
  }
  return value;
}

function isFeed(url) {
  try {
    const path = new URL(String(url), location.href).pathname;
    return /\/(?:api\/)?(?:recommend|feed|item_list|post\/item_list|related\/item_list)(?:\/|$)/i.test(path);
  } catch {
    return false;
  }
}

function clean(root = document) {
  const nodes =
    root.querySelectorAll?.(
      'a[href],button,[role="button"],[class*="banner" i],[class*="modal" i],[class*="popup" i]',
    ) || [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || node.closest(BLOCKED)) {
continue;
}
    const href = node instanceof HTMLAnchorElement ? node.href : "";
    const text = (node.innerText || node.getAttribute("aria-label") || "").trim().slice(0, 180);
    if (APP_URL.test(href) || (PROMPT.test(text) && text.length < 120)) {
      node.setAttribute("data-rod-tiktok-hidden", "");
      node.style.setProperty("display", "none", "important");
    }
  }
  for (const node of root.querySelectorAll?.(
    '[data-e2e*="ad-"],[data-e2e*="sponsored"],[class*="sponsored" i]',
  ) || []) {
    const card = node.closest('[data-e2e="recommend-list-item-container"],article') || node;
    if (card instanceof HTMLElement) {
      card.setAttribute("data-rod-tiktok-hidden", "");
      card.style.setProperty("display", "none", "important");
    }
  }
}

export default {
  init(ctx) {
    const win = window;
    const nativeFetch = win.fetch;
    const nativeOpen = win.open;
    const nativePush = history.pushState;
    const nativeReplace = history.replaceState;
    const xhrOpen = XMLHttpRequest.prototype.open;
    const xhrSend = XMLHttpRequest.prototype.send;
    const urls = new WeakMap();
    const onClick = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (anchor && APP_URL.test(anchor.href)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    win.open = function (url, ...args) {
      if (APP_URL.test(String(url))) {
return null;
}
      return nativeOpen.call(this, url, ...args);
    };
    win.fetch = async function (...args) {
      const response = await nativeFetch.apply(this, args);
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      if (!isFeed(url) || !response.ok || !/json/i.test(response.headers.get("content-type") || ""))
        {
return response;
}
      try {
        const data = filterFeed(await response.clone().json());
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return response;
      }
    };
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      urls.set(this, url);
      return xhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (isFeed(urls.get(this))) {
        this.addEventListener("load", () => {
          try {
            if (this.responseType && this.responseType !== "text" && this.responseType !== "json") {
return;
}
            const original = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            const cleaned = filterFeed(structuredClone(original));
            Object.defineProperty(this, "response", {
              configurable: true,
              get: () => (this.responseType === "json" ? cleaned : JSON.stringify(cleaned)),
            });
            if (!this.responseType || this.responseType === "text")
              {
Object.defineProperty(this, "responseText", {
                configurable: true,
                get: () => JSON.stringify(cleaned),
              });
}
          } catch {
            /* Non-configurable native response: DOM filtering remains active. */
          }
        });
      }
      return xhrSend.apply(this, args);
    };
    const observer = new MutationObserver((records) => {
      for (const record of records)
        {
for (const node of record.addedNodes) {
          if (node instanceof Element) {
            clean(node);
            if (node.matches('a,button,[role="button"]')) {
clean(node.parentElement || document);
}
          }
        }
}
    });
    const refresh = () => queueMicrotask(() => clean());
    history.pushState = function (...args) {
      const result = nativePush.apply(this, args);
      refresh();
      return result;
    };
    history.replaceState = function (...args) {
      const result = nativeReplace.apply(this, args);
      refresh();
      return result;
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", refresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    clean();
    const dispose = () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", refresh);
      if (win.fetch === wrappedFetch) {
win.fetch = nativeFetch;
}
      if (win.open !== nativeOpen) {
win.open = nativeOpen;
}
      history.pushState = nativePush;
      history.replaceState = nativeReplace;
      XMLHttpRequest.prototype.open = xhrOpen;
      XMLHttpRequest.prototype.send = xhrSend;
      document.querySelectorAll(BLOCKED).forEach((el) => {
        el.style.removeProperty("display");
        el.removeAttribute("data-rod-tiktok-hidden");
      });
    };
    const wrappedFetch = win.fetch;
    ctx?.onDispose?.(dispose);
    return dispose;
  },
};
