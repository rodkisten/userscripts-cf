import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-layout-hygiene-1.css?inline";
import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";
import { showRodxToast } from "../ui/toast.js";

export let XInterfaceHygiene;

export function initializeDeckXInterfaceHygiene() {
  XInterfaceHygiene = (() => {
    // X frequently changes Grok action testids; its accessible name is
    // more stable than the generated CSS class and works in other locales.
    const grokSelectors = [
      'a[href="/i/grok"]',
      'a[href^="/i/grok/"]',
      'a[href*="grok.com"]',
      'a[href*="/i/grok-redirect"]',
      '[data-testid="AppTabBar_Grok_Link"]',
      '[data-testid="SideNav_Grok_Link"]',
      '[data-testid="GrokDrawer"]',
      '[data-testid="grokButton"]',
      '[data-testid="grok"]',
      'button[data-testid*="grok" i]',
      'button[aria-label*="grok" i]',
      '[role="button"][aria-label*="grok" i]',
    ].join(",");
    const grokText = /\bgrok\b/i;
    const inlineMore =
      /^(?:show more|read more|mostrar mais|ver mais|ler mais|mostra mais|afficher plus|voir plus)$/i;
    const expanded = new WeakSet();
    function openTweet(article, event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Use React's existing click handler on the status permalink.
      const anchor =
        article.querySelector(CSS_SELECTORS.timestamps)?.closest(CSS_SELECTORS.statusLinks) ||
        article.querySelector(CSS_SELECTORS.statusLinks);
      if (!anchor) {
        showRodxToast("Link nativo do tweet não encontrado.", "error");
        return;
      }
      anchor.click();
    }
    function createOpenButton(article) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rodx-grok-replacement";
      button.title = "Abrir tweet";
      button.setAttribute("aria-label", "Abrir tweet");
      button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19"
        fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
          <path d="M13.5 5H19v5.5"/>
          <path d="M19 5 10 14"/>
          <path d="M18 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5"/>
        </svg>`;
      button.addEventListener("click", (event) => openTweet(article, event));
      // Pointerup and touchend must not trigger the article's open handler.
      for (const type of ["pointerup", "touchend"]) {
        button.addEventListener(type, (event) => event.stopPropagation(), {
          passive: true,
        });
      }
      return button;
    }
    function replaceTweetGrok(article) {
      const controls = [...article.querySelectorAll(CSS_SELECTORS.grokActionCandidates())].filter(
        (el) => !el.closest(CSS_SELECTORS.tweetTextOrReplacement),
      );
      let replacement = article.querySelector(CSS_SELECTORS.grokReplacement);
      if (controls.length) {
        const original = controls[0];
        if (!replacement) replacement = createOpenButton(article);
        if (replacement.previousElementSibling !== original) original.after(replacement);
        for (const control of controls) control.classList.add("rodx-native-grok-hidden");
      } else if (replacement) {
        replacement.remove();
      }
      const oldOpen = article.querySelector(CSS_SELECTORS.expandResultAction);
      if (oldOpen) oldOpen.hidden = Boolean(controls.length);
    }
    function hideGrok(root = document) {
      for (const article of root.querySelectorAll(XDOM.tweet)) {
        replaceTweetGrok(article);
      }
      for (const el of root.querySelectorAll(grokSelectors)) {
        if (el.closest(CSS_SELECTORS.grokReplacement)) continue;
        el.classList.add("rodx-native-grok-hidden");
      }
      for (const element of root.querySelectorAll(CSS_SELECTORS.dropdownOptions)) {
        if (
          grokText.test(element.innerText || element.textContent || "") ||
          grokText.test(element.getAttribute("aria-label") || "")
        ) {
          element.classList.add("rodx-native-grok-hidden");
        }
      }
    }
    function expandInlineMore(root = document) {
      const selectors = [
        ':is(article,[role="article"])[data-testid="tweet"] [data-testid="tweet-text-show-more-link"]',
        ':is(article,[role="article"])[data-testid="tweet"] button',
        ':is(article,[role="article"])[data-testid="tweet"] [data-testid="tweetText"] [role="button"]',
        ':is(article,[role="article"])[data-testid="tweet"] [data-testid="tweetText"] a',
      ].join(",");
      for (const control of root.querySelectorAll(selectors)) {
        if (expanded.has(control)) continue;
        if (!inlineMore.test((control.textContent || "").trim())) continue;
        const link = control.closest(CSS_SELECTORS.linksWithHref);
        if (link && !/^#?$/.test(link.getAttribute("href") || "")) continue;
        if (control.closest(CSS_SELECTORS.tweetActionMenuItems)) continue;
        expanded.add(control);
        control.click();
      }
    }
    let scheduled = false;
    function scan() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        hideGrok();
        expandInlineMore();
      });
    }
    function install() {
      const style = document.createElement("style");
      style.id = "rodx-x-hygiene-css";
      style.textContent = extractedCSS1;
      (document.head || document.documentElement).append(style);
      Studio.register("interface.hygiene", scan, {
        group: "hygiene",
        minMs: 250,
      });
      scan();
    }
    return Object.freeze({
      install,
      scan,
    });
  })();
}
