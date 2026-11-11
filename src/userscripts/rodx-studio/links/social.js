import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-links-social-1.css?inline";
export let SocialAppLinks;

export function initializeDeckSocialAppLinks() {
  SocialAppLinks = (() => {
    let styled = false;
    const icons = {
      telegram:
        '<path d="m21.7 3.1-3.2 17.3c-.2.9-.8 1.2-1.6.8l-5-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18.4 6.6c.4-.4-.1-.6-.6-.3L6 13.9l-5-1.5c-1.1-.3-1.1-1.1.2-1.6L20.4 3c.9-.3 1.6.2 1.3 1.1Z"/>',
      whatsapp:
        '<path d="M20.5 11.9A8.5 8.5 0 0 1 8.2 19.4L3 21l1.7-5.1A8.5 8.5 0 1 1 20.5 11.9Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 7.7c-.5-.8-.9-.7-1.3-.4-1.1 1-.9 3.1.6 5.2 1.7 2.4 4.1 3.7 6 4.1 1.8.4 3.2-.3 3.5-1.3.1-.4 0-.6-.4-.8l-2.5-1.1c-.4-.2-.5 0-.8.4l-.9 1c-.3.3-.5.3-1 0a8.3 8.3 0 0 1-3.4-3.1c-.3-.5 0-.7.3-.9l.7-.9c.2-.2.3-.5.2-.8Z"/>',
      instagram:
        '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.6" r="1.1"/>',
    };
    function identify(raw) {
      try {
        const url = new URL(raw);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
        const host = url.hostname.toLowerCase();
        const path = url.pathname;
        if (["t.me", "telegram.me", "telegram.dog"].includes(host) && path.length > 1) {
          return {
            name: "telegram",
            url: "https://t.me" + path + url.search + url.hash,
          };
        }
        if (
          (host === "chat.whatsapp.com" && path.length > 1) ||
          (["whatsapp.com", "www.whatsapp.com"].includes(host) && /^\/channel\/[\w-]+/i.test(path))
        ) {
          return {
            name: "whatsapp",
            url: "https://" + host + path + url.search + url.hash,
          };
        }
        if (
          ["instagram.com", "www.instagram.com"].includes(host) &&
          /^\/(?:[\w.]+|p\/[\w-]+|reel\/[\w-]+)\/?/i.test(path)
        ) {
          return {
            name: "instagram",
            url: "https://www.instagram.com" + path + url.search + url.hash,
          };
        }
      } catch (_) {
        /* Do not infer incomplete/unsafe URLs. */
      }
      return null;
    }
    function ensureStyle() {
      if (styled) return;
      styled = true;
      const style = document.createElement("style");
      style.id = "rodx-social-app-links-css";
      style.textContent = extractedCSS1;
      (document.head || document.documentElement).append(style);
    }
    function decorate(anchor, app) {
      if (!app) return;
      if (anchor.dataset.rodxApp !== app.name || !anchor.querySelector(CSS_SELECTORS.appLinkIcon)) {
        anchor.querySelector(CSS_SELECTORS.appLinkIcon)?.remove();
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("aria-hidden", "true");
        icon.classList.add("rodx-app-icon");
        icon.innerHTML = icons[app.name];
        anchor.insertBefore(icon, anchor.firstChild);
      }
      anchor.dataset.rodxApp = app.name;
      anchor.classList.add("rodx-app-link");
      anchor.title =
        "Abrir no " +
        {
          telegram: "Telegram",
          whatsapp: "WhatsApp",
          instagram: "Instagram",
        }[app.name];
      // These official HTTPS addresses are registered as universal links by
      // their respective apps. On devices without the app they remain usable.
      if (!/^(?:t\.co|www\.t\.co)$/i.test(new URL(anchor.href, "https://x.com").hostname))
        anchor.href = app.url;
      anchor.target = "_self";
      if (!anchor.dataset.rodxAppHandler) {
        anchor.dataset.rodxAppHandler = "1";
        anchor.addEventListener("click", (event) => event.stopPropagation());
      }
    }
    function scan() {
      if (!document.body) return;
      ensureStyle();
      let inspected = 0;
      for (const anchor of document.querySelectorAll(CSS_SELECTORS.tweetSocialLinks)) {
        if (++inspected > 320) break;
        let app = identify(
          anchor.dataset.rodxExpanded || anchor.getAttribute("data-expanded-url") || anchor.href,
        );
        if (!app && /(?:^|\.)t\.co$/i.test(new URL(anchor.href, "https://x.com").hostname)) {
          // A visibly shortened link is not enough to construct an app URL.
          // Still provide the brand hint, while waiting for DirectLinks to resolve it.
          const visible = (anchor.textContent || "").trim();
          app = identify(/^https?:\/\//.test(visible) ? visible : "https://" + visible);
        }
        if (app) decorate(anchor, app);
      }
    }
    return Object.freeze({
      scan,
      identify,
    });
  })();
}
