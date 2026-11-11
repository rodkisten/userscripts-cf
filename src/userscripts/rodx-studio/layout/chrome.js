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
    const chrome = new Set();
    function setHidden(value) {
      if (hidden === value) return;
      hidden = value;
      document.documentElement.classList.toggle("rodx-chrome-hidden", value);
    }
    function discover() {
      const main =
        document.querySelector('[data-testid="primaryColumn"]') ||
        document.querySelector('main,[role="main"]');
      if (!main) return;
      for (const seed of main.querySelectorAll(
        'h2,[role="tablist"],[role="tab"],[data-testid="ScrollSnap-List"],[data-testid="TopNavBar"],input[data-testid="SearchBox_Search_Input"]',
      )) {
        if (seed.closest("article")) continue;
        if (seed.matches('[data-testid="ScrollSnap-List"],[data-testid="TopNavBar"]')) chrome.add(seed);
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
      for (const node of document.querySelectorAll(
        "#rodx-search-deck-dock,#rodx-feed-filters,#rodx-search-anchors",
      ))
        chrome.add(node);
      // Mobile X sometimes places its main toolbar outside the primary column.
      for (const node of document.querySelectorAll('header[role="banner"]')) {
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
          node.style.setProperty("--rodx-chrome-rise", Math.max(220, r.bottom + 20) + "px");
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
      document.documentElement.style.setProperty("--rodx-bar-bg", background);
      document.documentElement.style.setProperty("--rodx-bar-fg", foreground);
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
          candidate = article.querySelector(".rodx-tweet-topbar");
          if (candidate) break;
        }
      }
      if (!candidate) {
        clearActive();
        return;
      }
      if (!portal) {
        portal = document.createElement("div");
        portal.id = "rodx-active-tweetbar";
        portal.className = "rodx-tweet-topbar";
        portal.setAttribute("aria-label", "Autor e ações do tweet atual");
        portal.addEventListener("click", (event) => {
          const target = event.target.closest(
            "[data-rodx-add-list],[data-proxy],.rodx-mini-avatar,.rodx-topbar-author",
          );
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
      const markup = candidate.innerHTML;
      if (portal.dataset.markup !== markup) {
        portal.innerHTML = markup;
        portal.dataset.markup = markup;
      }
      let context = portal.querySelector("[data-rodx-context]");
      if (!context) {
        context = document.createElement("small");
        context.dataset.rodxContext = "1";
        context.style.cssText =
          "display:block;position:absolute;left:6px;right:6px;top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:10px Arial;opacity:.75;pointer-events:none";
        portal.prepend(context);
      }
      context.textContent = contextLabel;
      context.hidden = !contextLabel;
      portal.style.setProperty("height", contextLabel ? "54px" : "40px", "important");
      portal.style.setProperty("max-height", contextLabel ? "54px" : "40px", "important");
      portal.style.setProperty("padding-top", contextLabel ? "15px" : "3px", "important");
      candidate.classList.add("rodx-topbar-floating-source");
      portal.hidden = false;
      const rect = candidate.closest("article").getBoundingClientRect();
      portal.style.left = Math.max(0, rect.left) + "px";
      portal.style.width = Math.min(innerWidth - Math.max(0, rect.left), rect.width) + "px";
      portal.style.top = top + "px";
    }
    function update() {
      raf = 0;
      const y = Math.max(0, scrollY),
        delta = y - previousY;
      previousY = y;
      const editing = document.activeElement?.matches('input,textarea,[contenteditable="true"]');
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
      document.documentElement.style.setProperty("--rodx-chrome-offset", top + "px");
      pin(top);
    }
    let settleTimer;
    function settle() {
      if (
        !state.visual.snap ||
        document.visibilityState !== "visible" ||
        window.getSelection()?.toString() ||
        document.activeElement?.matches('input,textarea,[contenteditable="true"]')
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
        settleTimer = setTimeout(settle, 180);
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
