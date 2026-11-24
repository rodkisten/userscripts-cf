import { mountView } from "../ui/react-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import GrokReplacementSVGIcon from "../../../assets/icons/grok-replacement.svg?component";
import {
  DOM_SELECTORS,
  NATIVE_X_SELECTORS,
  COMPOSITE_SELECTORS,
  RODX_SELECTORS,
} from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-layout-hygiene-1.css?inline";
import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";
import { showRodxToast } from "../ui/toast.tsx";

// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const ELEMENT_IDS = {
  hygieneStyle: "rodx-x-hygiene-css",
} as const;

const CSS_CLASSES = {
  grokReplacement: "rodx-grok-replacement",
  nativeGrokHidden: "rodx-native-grok-hidden",
} as const;

const UI_TEXTS = {
  openTweetTitle: "Abrir tweet",
  nativeTweetNotFound: "Link nativo do tweet não encontrado.",
} as const;

const EVENT_TYPES = {
  pointerUp: "pointerup",
  touchEnd: "touchend",
} as const;

const REGEX_PATTERNS = {
  grokText: /\bgrok\b/i,
  inlineMore: /^(?:show more|read more|mostrar mais|ver mais|ler mais|mostra mais|afficher plus|voir plus)$/i,
  emptyHref: /^#?$/,
} as const;

const GROK_SELECTORS = [
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

const INLINE_MORE_SELECTORS = [
  ':is(article,[role="article"])[data-testid="tweet"] [data-testid="tweet-text-show-more-link"]',
  ':is(article,[role="article"])[data-testid="tweet"] button',
  ':is(article,[role="article"])[data-testid="tweet"] [data-testid="tweetText"] [role="button"]',
  ':is(article,[role="article"])[data-testid="tweet"] [data-testid="tweetText"] a',
].join(",");

export interface XInterfaceHygieneAPI {
  install(): void;
  scan(): void;
}

export type XInterfaceHygieneController = XInterfaceHygieneAPI | undefined;

export let XInterfaceHygiene: XInterfaceHygieneController;

export function initializeDeckXInterfaceHygiene(): void {
  XInterfaceHygiene = (() => {
    // X frequently changes Grok action testids; its accessible name is
    // more stable than the generated CSS class and works in other locales.
    const expanded = new WeakSet<HTMLElement>();

    function openTweet(article: HTMLElement, event: MouseEvent): void {
      event.preventDefault();
      event.stopImmediatePropagation();

      // Use React's existing click handler on the status permalink.
      const anchor =
        article
          .querySelector<HTMLAnchorElement>(DOM_SELECTORS.timestamps)
          ?.closest<HTMLAnchorElement>(NATIVE_X_SELECTORS.statusLinks) ||
        article.querySelector<HTMLAnchorElement>(NATIVE_X_SELECTORS.statusLinks);

      if (!anchor) {
        showRodxToast(UI_TEXTS.nativeTweetNotFound, "error");
        return;
      }
      anchor.click();
    }

    function createOpenButton(article: HTMLElement): HTMLButtonElement {
      const button = document.createElement("button");
      button.type = "button";
      button.className = CSS_CLASSES.grokReplacement;
      button.title = UI_TEXTS.openTweetTitle;
      button.setAttribute("aria-label", UI_TEXTS.openTweetTitle);
      button.addEventListener("click", (event: MouseEvent) => openTweet(article, event));

      mountView(button, () => <GrokReplacementSVGIcon />);

      // Pointerup and touchend must not trigger the article's open handler.
      for (const type of [EVENT_TYPES.pointerUp, EVENT_TYPES.touchEnd]) {
        button.addEventListener(type, (event: Event) => event.stopPropagation(), {
          passive: true,
        });
      }
      return button;
    }

    function replaceTweetGrok(article: HTMLElement): void {
      const controls = Array.from(
        article.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.grokActionCandidates()),
      ).filter((el) => !el.closest(COMPOSITE_SELECTORS.tweetTextOrReplacement));

      let replacement = article.querySelector<HTMLElement>(RODX_SELECTORS.grokReplacement);
      if (controls.length) {
        const original = controls[0];
        if (!replacement) {
replacement = createOpenButton(article);
}
        if (replacement.previousElementSibling !== original) {
original.after(replacement);
}
        for (const control of controls) {
control.classList.add(CSS_CLASSES.nativeGrokHidden);
}
      } else if (replacement) {
        replacement.remove();
      }

      const oldOpen = article.querySelector<HTMLElement>(RODX_SELECTORS.expandResultAction);
      if (oldOpen) {
oldOpen.hidden = Boolean(controls.length);
}
    }

    function hideGrok(root: ParentNode = document): void {
      for (const article of root.querySelectorAll<HTMLElement>(XDOM.tweet)) {
        replaceTweetGrok(article);
      }
      for (const el of root.querySelectorAll<HTMLElement>(GROK_SELECTORS)) {
        if (el.closest(RODX_SELECTORS.grokReplacement)) {
continue;
}
        el.classList.add(CSS_CLASSES.nativeGrokHidden);
      }
      for (const element of root.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.dropdownOptions)) {
        if (
          REGEX_PATTERNS.grokText.test(element.innerText || element.textContent || "") ||
          REGEX_PATTERNS.grokText.test(element.getAttribute("aria-label") || "")
        ) {
          element.classList.add(CSS_CLASSES.nativeGrokHidden);
        }
      }
    }

    function expandInlineMore(root: ParentNode = document): void {
      for (const control of root.querySelectorAll<HTMLElement>(INLINE_MORE_SELECTORS)) {
        if (expanded.has(control)) {
continue;
}
        if (!REGEX_PATTERNS.inlineMore.test((control.textContent || "").trim())) {
continue;
}

        const link = control.closest<HTMLAnchorElement>(DOM_SELECTORS.linksWithHref);
        if (link && !REGEX_PATTERNS.emptyHref.test(link.getAttribute("href") || "")) {
continue;
}
        if (control.closest(NATIVE_X_SELECTORS.tweetActionMenuItems)) {
continue;
}

        expanded.add(control);
        control.click();
      }
    }

    let scheduled = false;

    function scan(): void {
      if (scheduled) {
return;
}
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        hideGrok();
        expandInlineMore();
      });
    }

    function install(): void {
      const style = document.createElement("style");
      style.id = ELEMENT_IDS.hygieneStyle;
      style.textContent = extractedCSS1;
      (document.head || document.documentElement).append(style);

      Studio.register("interface.hygiene", scan, {
        group: "hygiene",
        minMs: RUNTIME_LIMITS.layoutHygiene.installMinMs,
      });
      scan();
    }

    return Object.freeze({
      install,
      scan,
    });
  })();
}
