import { mountView } from "../ui/solid-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { applyComponentStyle } from "../../../core/css.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";
import { state } from "../state/deck.js";
import { studioContextLabel } from "../ui/context-label.js";

// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const ELEMENT_IDS = {
  activeTweetBar: "rodx-active-tweetbar",
} as const;

const CSS_CLASSES = {
  chromeHidden: "rodx-chrome-hidden",
  topbarFloatingSource: "rodx-topbar-floating-source",
  tweetTopbar: "rodx-tweet-topbar",
  miniAvatar: "rodx-mini-avatar",
  topbarAuthor: "rodx-topbar-author",
  rxChromeContext: "rx-chrome-context",
} as const;

const DATA_ATTRS = {
  rodxChrome: "rodxChrome",
  rodxContext: "rodxContext",
  addList: "data-rodx-add-list",
  proxy: "data-proxy",
} as const;

const UI_TEXTS = {
  tweetBarAriaLabel: "Autor e ações do tweet atual",
} as const;

const CHROME_METRICS = {
  minRiseHeight: 220,
  maxOffsetLimit: 180,
  scanThrottleMs: 600,
  mobileWidthThreshold: 800,
  mobileBannerMaxHeight: 180,
  mobileBannerWidthRatio: 0.7,
  scrollDeltaThreshold: 0.5,
  travelDistanceThreshold: 18,
  stickyTopOffset: 10,
  pinTopBuffer: 2,
  pinBottomBuffer: 44,
  contextBarHeightWithContext: "54px",
  contextBarHeightWithoutContext: "40px",
  contextBarPaddingWithContext: "15px",
  contextBarPaddingWithoutContext: "3px",
  snapMinDistance: 2,
  snapMaxDistance: 45,
  snapScreenRatio: 0.9,
  scrollYThreshold: 30,
} as const;

export interface ScrollChromeAPI {
  scan(): void;
}

export type ScrollChromeController = ScrollChromeAPI | undefined;

export let ScrollChrome: ScrollChromeController;

export function initializeDeckScrollChrome(): void {
  ScrollChrome = (() => {
    let portal: HTMLDivElement | undefined;
    let active: HTMLElement | null = null;
    let previousY = 0;
    let direction = 0;
    let travel = 0;
    let hidden = false;
    let raf = 0;
    let lastScan = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const chrome = new Set<HTMLElement>();

    function setHidden(value: boolean): void {
      if (hidden === value) return;
      hidden = value;
      document.documentElement.classList.toggle(CSS_CLASSES.chromeHidden, value);
    }

    function discover(): void {
      const main =
        document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) ||
        document.querySelector<HTMLElement>(DOM_SELECTORS.mainContent);
      if (!main) return;

      for (const seed of main.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.stickyChromeCandidates)) {
        if (seed.closest(DOM_SELECTORS.articles)) continue;
        if (seed.matches(NATIVE_X_SELECTORS.topNavigationBars)) chrome.add(seed);
        let node: HTMLElement | null = seed;
        while (node && node !== main) {
          const pos = getComputedStyle(node).position;
          if (pos === "sticky" || pos === "fixed") {
            chrome.add(node);
            break;
          }
          node = node.parentElement;
        }
      }

      for (const node of document.querySelectorAll<HTMLElement>(RODX_SELECTORS.studioNavigationRoots)) {
        chrome.add(node);
      }

      // Mobile X sometimes places its main toolbar outside the primary column.
      for (const node of document.querySelectorAll<HTMLElement>(DOM_SELECTORS.bannerHeader)) {
        const r = node.getBoundingClientRect();
        if (
          innerWidth < CHROME_METRICS.mobileWidthThreshold &&
          r.width > innerWidth * CHROME_METRICS.mobileBannerWidthRatio &&
          r.height < CHROME_METRICS.mobileBannerMaxHeight
        ) {
          chrome.add(node);
        }
      }

      for (const node of chrome) {
        if (!node.isConnected) {
          chrome.delete(node);
          continue;
        }
        if (node.id?.startsWith("rodx-")) {
          node.dataset[DATA_ATTRS.rodxChrome] = "1";
        } else {
          delete node.dataset[DATA_ATTRS.rodxChrome];
        }

        // Keep geometry stable: translate instead of collapsing layout height.
        if (!hidden) {
          const r = node.getBoundingClientRect();
          node.style.setProperty(
            "--rodx-chrome-rise",
            Math.max(CHROME_METRICS.minRiseHeight, r.bottom + 20) + "px",
            "important",
          );
        }
      }

      const colors = [
        getComputedStyle(main).backgroundColor,
        getComputedStyle(document.body).backgroundColor,
        getComputedStyle(document.documentElement).backgroundColor,
      ];
      const foreground = getComputedStyle(main).color;
      const rgb = foreground.match(/[\d.]+/g) || [];
      const light =
        Number(rgb[0] || 0) * 0.21 + Number(rgb[1] || 0) * 0.72 + Number(rgb[2] || 0) * 0.07 > 140;
      const background =
        colors.find((c) => c && c !== "transparent" && !/rgba\([^)]*,\s*0\s*\)$/.test(c)) ||
        (light ? "#000" : "#fff");

      document.documentElement.style.setProperty("--rodx-bar-bg", background, "important");
      document.documentElement.style.setProperty("--rodx-bar-fg", foreground, "important");
    }

    function offset(): number {
      let bottom = 0;
      const nodes = Array.from(chrome)
        .filter((node) => node.isConnected && !(hidden && node.id?.startsWith("rodx-")))
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => rect.height > 0 && rect.bottom > 0 && rect.top < CHROME_METRICS.maxOffsetLimit)
        .sort((a, b) => a.rect.top - b.rect.top);

      for (const { rect } of nodes) {
        if (rect.top <= bottom + CHROME_METRICS.stickyTopOffset) {
          bottom = Math.max(bottom, rect.bottom);
        }
      }
      return Math.min(CHROME_METRICS.maxOffsetLimit, bottom);
    }

    function clearActive(): void {
      active?.classList.remove(CSS_CLASSES.topbarFloatingSource);
      active = null;
      if (portal) portal.hidden = true;
    }

    function pin(top: number): void {
      let candidate: HTMLElement | undefined;
      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        if (article.hidden || getComputedStyle(article).display === "none") continue;
        const r = article.getBoundingClientRect();
        if (r.top <= top + CHROME_METRICS.pinTopBuffer && r.bottom > top + CHROME_METRICS.pinBottomBuffer) {
          candidate = (article as ParentNode).querySelector<HTMLElement>(RODX_SELECTORS.tweetTopbar);
          if (candidate) break;
        }
      }

      if (!candidate) {
        clearActive();
        return;
      }

      if (!portal) {
        portal = (
          <div
            id={ELEMENT_IDS.activeTweetBar}
            class={CSS_CLASSES.tweetTopbar}
            aria-label={UI_TEXTS.tweetBarAriaLabel}
            onClick={(event: MouseEvent) => {
              const target = (event.target as HTMLElement)?.closest<HTMLElement>(
                RODX_SELECTORS.tweetTopbarControls,
              );
              if (!target || !active) return;
              event.preventDefault();
              event.stopImmediatePropagation();

              const selector = target.hasAttribute(DATA_ATTRS.addList)
                ? `[${DATA_ATTRS.addList}]`
                : target.dataset.proxy
                  ? `[${DATA_ATTRS.proxy}="${target.dataset.proxy}"]`
                  : target.classList.contains(CSS_CLASSES.miniAvatar)
                    ? `.${CSS_CLASSES.miniAvatar}`
                    : `.${CSS_CLASSES.topbarAuthor}`;

              active.querySelector<HTMLElement>(selector)?.click();
            }}
          />
        ) as HTMLDivElement;

        document.body.append(portal);
      }

      if (active !== candidate) {
        active?.classList.remove(CSS_CLASSES.topbarFloatingSource);
        active = candidate;
      }

      const contextLabel = studioContextLabel(Studio);
      if (portal.dataset.sourceText !== candidate.textContent || active !== candidate) {
        portal.replaceChildren(...Array.from(candidate.childNodes).map((node) => node.cloneNode(true)));
        portal.dataset.sourceText = candidate.textContent || "";
      }

      let context = portal.querySelector<HTMLElement>(RODX_SELECTORS.tweetContextLabel);
      if (!context) {
        context = document.createElement("small");
        context.dataset[DATA_ATTRS.rodxContext] = "1";
        applyComponentStyle(context, CSS_CLASSES.rxChromeContext, false);
        portal.prepend(context);
      }

      context.textContent = contextLabel;
      context.hidden = !contextLabel;

      portal.style.setProperty(
        "height",
        contextLabel
          ? CHROME_METRICS.contextBarHeightWithContext
          : CHROME_METRICS.contextBarHeightWithoutContext,
        "important",
      );
      portal.style.setProperty(
        "max-height",
        contextLabel
          ? CHROME_METRICS.contextBarHeightWithContext
          : CHROME_METRICS.contextBarHeightWithoutContext,
        "important",
      );
      portal.style.setProperty(
        "padding-top",
        contextLabel
          ? CHROME_METRICS.contextBarPaddingWithContext
          : CHROME_METRICS.contextBarPaddingWithoutContext,
        "important",
      );

      candidate.classList.add(CSS_CLASSES.topbarFloatingSource);
      portal.hidden = false;

      const articlesContainer = candidate.closest<HTMLElement>(DOM_SELECTORS.articles);
      const rect = articlesContainer
        ? articlesContainer.getBoundingClientRect()
        : { left: 0, width: innerWidth };

      portal.style.setProperty("left", Math.max(0, rect.left) + "px", "important");
      portal.style.setProperty(
        "width",
        Math.min(innerWidth - Math.max(0, rect.left), rect.width) + "px",
        "important",
      );
      portal.style.setProperty("top", top + "px", "important");
    }

    function update(): void {
      raf = 0;
      const y = Math.max(0, scrollY);
      const delta = y - previousY;
      previousY = y;

      const activeEl = document.activeElement;
      const editing = activeEl?.matches(DOM_SELECTORS.editableFields);

      if (y < CHROME_METRICS.scrollYThreshold || editing) {
        setHidden(false);
      } else if (Math.abs(delta) > CHROME_METRICS.scrollDeltaThreshold) {
        const next = delta > 0 ? 1 : -1;
        if (next !== direction) {
          direction = next;
          travel = 0;
        }
        travel += Math.abs(delta);
        if (travel > CHROME_METRICS.travelDistanceThreshold) {
          setHidden(direction === 1);
        }
      }

      const top = offset();
      document.documentElement.style.setProperty("--rodx-chrome-offset", top + "px", "important");
      pin(top);
    }

    function settle(): void {
      const activeEl = document.activeElement;
      if (
        !state.visual.snap ||
        document.visibilityState !== "visible" ||
        window.getSelection()?.toString() ||
        (activeEl && activeEl.matches(DOM_SELECTORS.editableFields))
      )
        return;

      const top = offset();
      let distance: number = Number(CHROME_METRICS.snapMaxDistance);

      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        if (article.hidden || getComputedStyle(article).display === "none") continue;
        const r = article.getBoundingClientRect();
        const delta = r.top - top;
        if (r.height > innerHeight * CHROME_METRICS.snapScreenRatio || Math.abs(delta) >= Math.abs(distance))
          continue;
        distance = delta;
      }

      if (
        Math.abs(distance) > CHROME_METRICS.snapMinDistance &&
        Math.abs(distance) < CHROME_METRICS.snapMaxDistance
      ) {
        window.scrollBy({
          top: distance,
          left: 0,
          behavior: "smooth",
        });
      }
    }

    function request(): void {
      if (!raf) raf = requestAnimationFrame(update);
    }

    window.addEventListener(
      "scroll",
      () => {
        request();
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, RUNTIME_LIMITS.layoutChrome.settleDelayMs);
      },
      {
        passive: true,
      },
    );

    window.addEventListener("resize", request, {
      passive: true,
    });

    document.addEventListener("focusin", () => {
      setHidden(false);
      request();
    });

    function scan(): void {
      const now = Date.now();
      if (now - lastScan > CHROME_METRICS.scanThrottleMs) {
        lastScan = now;
        discover();
      }
      request();
    }

    return Object.freeze({
      scan,
    });
  })();
}
