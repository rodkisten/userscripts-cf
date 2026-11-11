import { mountView } from "../ui/solid-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { applyComponentStyle } from "../../../core/css.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";
import { state } from "../state/deck.js";
import { studioContextLabel } from "../ui/context-label.js";

export let ScrollChrome;

export function initializeDeckScrollChrome() {
  ScrollChrome = (() => {
    let portal,
      active,
      previousY = 0,
      direction = 0,
      travel = 0,
      hidden = false,
      raf = 0,
      lastScan = 0;
    const chrome = new Set<any>();
    function setHidden(value) {
      if (hidden === value) return;
      hidden = value;
      document.documentElement.classList.toggle("rodx-chrome-hidden", value);
    }
    function discover() {
      const main =
        document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) ||
        document.querySelector<HTMLElement>(DOM_SELECTORS.mainContent);
      if (!main) return;
      for (const seed of main.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.stickyChromeCandidates)) {
        if (seed.closest(DOM_SELECTORS.articles)) continue;
        if (seed.matches(NATIVE_X_SELECTORS.topNavigationBars)) chrome.add(seed);
        let node = seed;
        while (node && node !== main) {
          const pos = getComputedStyle(node).position;
          if (pos === "sticky" || pos === "fixed") {
            chrome.add(node);
            break;
          }
          node = node.parentElement;
        }
      }
      for (const node of document.querySelectorAll<HTMLElement>(RODX_SELECTORS.studioNavigationRoots))
        chrome.add(node);
      // Mobile X sometimes places its main toolbar outside the primary column.
      for (const node of document.querySelectorAll<HTMLElement>(DOM_SELECTORS.bannerHeader)) {
        const r = node.getBoundingClientRect();
        if (innerWidth < 800 && r.width > innerWidth * 0.7 && r.height < 180) chrome.add(node);
      }
      for (const node of chrome) {
        if (!node.isConnected) {
          chrome.delete(node);
          continue;
        }
        if (node.id?.startsWith("rodx-")) node.dataset.rodxChrome = "1";
        else delete node.dataset.rodxChrome;
        // Keep geometry stable: translate instead of collapsing layout height.
        if (!hidden) {
          const r = node.getBoundingClientRect();
          node.style.setProperty("--rodx-chrome-rise", Math.max(220, r.bottom + 20) + "px", "important");
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
    function offset() {
      let bottom = 0;
      const nodes = [...chrome]
        .filter((node) => node.isConnected && !(hidden && node.id?.startsWith("rodx-")))
        .map((node) => node.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.bottom > 0 && r.top < 180)
        .sort((a, b) => a.top - b.top);
      for (const r of nodes) if (r.top <= bottom + 10) bottom = Math.max(bottom, r.bottom);
      return Math.min(180, bottom);
    }
    function clearActive() {
      active?.classList.remove("rodx-topbar-floating-source");
      active = null;
      if (portal) portal.hidden = true;
    }
    function pin(top) {
      let candidate;
      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        if (article.hidden || getComputedStyle(article).display === "none") continue;
        const r = article.getBoundingClientRect();
        if (r.top <= top + 2 && r.bottom > top + 44) {
          candidate = article.querySelector(RODX_SELECTORS.tweetTopbar);
          if (candidate) break;
        }
      }
      if (!candidate) {
        clearActive();
        return;
      }
      if (!portal) {
        portal = (<div />) as HTMLDivElement;
        portal.id = "rodx-active-tweetbar";
        portal.className = "rodx-tweet-topbar";
        portal.setAttribute("aria-label", "Autor e ações do tweet atual");
        portal.addEventListener("click", (event) => {
          const target = event.target.closest(RODX_SELECTORS.tweetTopbarControls);
          if (!target || !active) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const selector = target.hasAttribute("data-rodx-add-list")
            ? "[data-rodx-add-list]"
            : target.dataset.proxy
              ? '[data-proxy="' + target.dataset.proxy + '"]'
              : target.classList.contains("rodx-mini-avatar")
                ? ".rodx-mini-avatar"
                : ".rodx-topbar-author";
          active.querySelector(selector)?.click();
        });
        document.body.append(portal);
      }
      if (active !== candidate) {
        active?.classList.remove("rodx-topbar-floating-source");
        active = candidate;
      }
      const contextLabel = studioContextLabel(Studio);
      if (portal.dataset.sourceText !== candidate.textContent || active !== candidate) {
        portal.replaceChildren(...[...candidate.childNodes].map((node) => node.cloneNode(true)));
        portal.dataset.sourceText = candidate.textContent;
      }
      let context = portal.querySelector(RODX_SELECTORS.tweetContextLabel);
      if (!context) {
        context = (<small />) as HTMLElement;
        context.dataset.rodxContext = "1";
        applyComponentStyle(context, "rx-chrome-context", false);
        portal.prepend(context);
      }
      context.textContent = contextLabel;
      context.hidden = !contextLabel;
      portal.style.setProperty("height", contextLabel ? "54px" : "40px", "important");
      portal.style.setProperty("max-height", contextLabel ? "54px" : "40px", "important");
      portal.style.setProperty("padding-top", contextLabel ? "15px" : "3px", "important");
      candidate.classList.add("rodx-topbar-floating-source");
      portal.hidden = false;
      const rect = candidate.closest(DOM_SELECTORS.articles).getBoundingClientRect();
      portal.style.setProperty("left", Math.max(0, rect.left) + "px", "important");
      portal.style.setProperty(
        "width",
        Math.min(innerWidth - Math.max(0, rect.left), rect.width) + "px",
        "important",
      );
      portal.style.setProperty("top", top + "px", "important");
    }
    function update() {
      raf = 0;
      const y = Math.max(0, scrollY),
        delta = y - previousY;
      previousY = y;
      const editing = document.activeElement?.matches(DOM_SELECTORS.editableFields);
      if (y < 30 || editing) setHidden(false);
      else if (Math.abs(delta) > 0.5) {
        const next = delta > 0 ? 1 : -1;
        if (next !== direction) {
          direction = next;
          travel = 0;
        }
        travel += Math.abs(delta);
        if (travel > 18) setHidden(direction === 1);
      }
      const top = offset();
      document.documentElement.style.setProperty("--rodx-chrome-offset", top + "px", "important");
      pin(top);
    }
    let settleTimer;
    function settle() {
      if (
        !state.visual.snap ||
        document.visibilityState !== "visible" ||
        window.getSelection()?.toString() ||
        document.activeElement?.matches(DOM_SELECTORS.editableFields)
      )
        return;
      const top = offset();
      let distance = 45;
      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        if (article.hidden || getComputedStyle(article).display === "none") continue;
        const r = article.getBoundingClientRect();
        const delta = r.top - top;
        if (r.height > innerHeight * 0.9 || Math.abs(delta) >= Math.abs(distance)) continue;
        distance = delta;
      }
      if (Math.abs(distance) > 2 && Math.abs(distance) < 45)
        window.scrollBy({
          top: distance,
          left: 0,
          behavior: "smooth",
        });
    }
    function request() {
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
    function scan() {
      if (Date.now() - lastScan > 600) {
        lastScan = Date.now();
        discover();
      }
      request();
    }
    return {
      scan,
    };
  })();
}
