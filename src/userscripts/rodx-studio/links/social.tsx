import TelegramIcon from "../../../assets/icons/social-telegram.svg?component";
import WhatsappIcon from "../../../assets/icons/social-whatsapp.svg?component";
import InstagramIcon from "../../../assets/icons/social-instagram.svg?component";
import { mountView } from "../ui/solid-mount.tsx";
import { RODX_SELECTORS, COMPOSITE_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-links-social-1.css?inline";
export let SocialAppLinks;

export function initializeDeckSocialAppLinks() {
  SocialAppLinks = (() => {
    let styled = false;
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
      const style = (<style />) as HTMLStyleElement;
      style.id = "rodx-social-app-links-css";
      style.textContent = extractedCSS1;
      (document.head || document.documentElement).append(style);
    }
    function decorate(anchor, app) {
      if (!app) return;
      if (anchor.dataset.rodxApp !== app.name || !anchor.querySelector(RODX_SELECTORS.appLinkIcon)) {
        anchor.querySelector(RODX_SELECTORS.appLinkIcon)?.remove();
        const icon = (
          <span class="rodx-app-icon" aria-hidden="true">
            {app.name === "telegram" ? (
              <TelegramIcon />
            ) : app.name === "whatsapp" ? (
              <WhatsappIcon />
            ) : (
              <InstagramIcon />
            )}
          </span>
        ) as HTMLSpanElement;
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
      for (const anchor of document.querySelectorAll<HTMLElement>(COMPOSITE_SELECTORS.tweetSocialLinks)) {
        if (++inspected > 320) break;
        let app = identify(
          anchor.dataset.rodxExpanded ||
            anchor.getAttribute("data-expanded-url") ||
            (anchor as HTMLAnchorElement).href,
        );
        if (
          !app &&
          /(?:^|\.)t\.co$/i.test(new URL((anchor as HTMLAnchorElement).href, "https://x.com").hostname)
        ) {
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
