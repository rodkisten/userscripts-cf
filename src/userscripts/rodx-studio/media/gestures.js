import { COMPOSITE_SELECTORS, NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-media-gestures-1.css?inline";
export let VideoTapGuard;

export function initializeDeckVideoTapGuard() {
  VideoTapGuard = (() => {
    const DOUBLE_TAP_MS = 420;
    const TOUCH_CLICK_MS = 900;
    const MOVE_LIMIT = 16;
    const SAME_SPOT_PX = 90;
    const PLAYER = [
      '[data-testid="videoPlayerContainer"]',
      '[data-testid="videoPlayer"]',
      '[data-testid="videoComponent"]',
      '[data-testid="videoPlayerDiv"]',
      '[data-testid="video-player"]',
      "video",
      '[data-testid="tweetPhoto"]',
    ].join(",");
    const VIDEO = [
      "video",
      '[data-testid="videoPlayer"]',
      '[data-testid="videoComponent"]',
      '[data-testid="videoPlayerContainer"]',
      '[data-testid="videoPlayerDiv"]',
      '[data-testid="video-player"]',
    ].join(",");
    const CONTROL_LABEL =
      /(?:^|\W)(?:play|pause|resume|reproduzir|pausar|retomar|mute|unmute|silenciar|som|volume|audio|áudio|fullscreen|full screen|tela cheia|captions|legendas|subtitles|speed|velocidade|settings|configurações|pip|picture.in.picture|seek|scrub|timeline|progress|duration|current time|tempo|progresso|avançar|retroceder)(?:\W|$)/i;
    // Video scrubbers are often ordinary divs with no role or aria-label.
    // Treat all player controls and the lower scrubber strip as native X UI.
    const CONTROL = [
      "button",
      "input",
      "select",
      "label",
      "a[href]",
      '[role="button"]',
      '[role="slider"]',
      '[role="progressbar"]',
      "[aria-valuenow]",
      "[aria-valuemin]",
      "[aria-valuemax]",
      '[data-testid*="seek" i]',
      '[data-testid*="scrub" i]',
      '[data-testid*="progress" i]',
      '[data-testid*="control" i]',
      '[data-testid*="playpause" i]',
      '[class*="seek" i]',
      '[class*="scrub" i]',
      '[class*="progressbar" i]',
      "[data-rodx-player-control]",
      ".rodx-quality",
    ].join(",");
    let recent = null;
    let touch = null;
    let syntheticClick = null;
    const identities = new WeakMap();
    let nextId = 0;
    function identity(article) {
      if (!identities.has(article)) identities.set(article, `article-${++nextId}`);
      return identities.get(article);
    }
    function mediaContext(target) {
      const el = target?.nodeType === 1 ? target : target?.parentElement;
      if (!el?.closest || el.closest(COMPOSITE_SELECTORS.immersiveActionRoots)) return null;
      const article = el.closest(NATIVE_X_SELECTORS.tweetArticleContainers);
      if (!article) return null;
      const hit = el.closest(PLAYER);
      if (!hit || !article.contains(hit)) return null;
      // tweetPhoto can wrap an image: never intercept images just because the
      // article also contains a video somewhere else (e.g. a media carousel).
      if (!hit.matches(VIDEO) && !hit.querySelector(VIDEO)) return null;
      // Sliders can be wrapped in divs rather than actual input elements.
      // Ignore the entire control hitbox, not just the slider thumb.
      const control = el.closest(CONTROL);
      if (control) {
        const isPlayerSurface =
          control.matches(DOM_SELECTORS.buttonRolesOrButtons) &&
          (control.matches(VIDEO) || Boolean(control.querySelector(VIDEO)));
        const label = [
          control.getAttribute("aria-label"),
          control.getAttribute("title"),
          control.getAttribute("data-testid"),
        ]
          .filter(Boolean)
          .join(" ");
        if (!isPlayerSurface || CONTROL_LABEL.test(label)) return null;
      }
      // The player can expose an unlabelled draggable timeline. Do not
      // interpret horizontal scrubbing as a request to open the viewer.
      const named = el.closest(NATIVE_X_SELECTORS.accessibleLabelCandidates);
      if (
        named &&
        CONTROL_LABEL.test(
          [named.getAttribute("aria-label"), named.getAttribute("title"), named.getAttribute("data-testid")]
            .filter(Boolean)
            .join(" "),
        )
      )
        return null;
      const player =
        el.closest(NATIVE_X_SELECTORS.videoPlayerWrappers) ||
        (hit.matches(DOM_SELECTORS.videos) ? hit : hit.querySelector(DOM_SELECTORS.videos)) ||
        hit;
      const status = article
        .querySelector(NATIVE_X_SELECTORS.statusLinks)
        ?.getAttribute("href")
        ?.match(/\/status\/(\d{6,25})/)?.[1];
      const key = `${status || identity(article)}:${identity(player)}`;
      return {
        key,
        article,
        player,
      };
    }
    function point(event) {
      const t = event.changedTouches?.[0] || event.touches?.[0];
      return {
        x: Number(t?.clientX ?? event.clientX ?? 0),
        y: Number(t?.clientY ?? event.clientY ?? 0),
      };
    }
    function onSeekStrip(event, context) {
      if (!context || !event) return false;
      const video = context.player.matches?.(DOM_SELECTORS.videos)
        ? context.player
        : context.player.querySelector?.(DOM_SELECTORS.videos);
      if (!video) return false;
      const rect = video.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const p = point(event);
      // An X player may only expose its progress bar when tapped. The final
      // 54px (max. 32% of a short video) must be free for native seek actions.
      const reserved = Math.min(54, rect.height * 0.32);
      return (
        p.x >= rect.left && p.x <= rect.right && p.y >= rect.bottom - reserved && p.y <= rect.bottom + 14
      );
    }
    function near(a, b, at) {
      return Boolean(
        a &&
        b &&
        a.key === b.key &&
        at - a.at < DOUBLE_TAP_MS &&
        at >= a.at &&
        Math.abs(a.x - b.x) <= SAME_SPOT_PX &&
        Math.abs(a.y - b.y) <= SAME_SPOT_PX,
      );
    }
    function cancel(event) {
      // Prevent link navigation as well as React's delegated onClick.
      // Does not alter playback state or call preventDefault on touchend.
      if (event.cancelable && event.type === "click") event.preventDefault();
      event.stopImmediatePropagation();
    }
    function onTouchStart(event) {
      if (event.touches?.length !== 1) {
        touch = null;
        return;
      }
      const ctx = mediaContext(event.target);
      if (!ctx || onSeekStrip(event, ctx)) {
        touch = null;
        recent = null;
        return;
      }
      const p = point(event);
      touch = {
        ...p,
        key: ctx.key,
        double: near(
          recent,
          {
            ...p,
            key: ctx.key,
          },
          Date.now(),
        ),
        moved: false,
      };
    }
    function onTouchMove(event) {
      if (!touch) return;
      const p = point(event);
      if (Math.abs(touch.x - p.x) > MOVE_LIMIT || Math.abs(touch.y - p.y) > MOVE_LIMIT) touch.moved = true;
    }
    function onPointerUp(event) {
      // Some X player implementations listen to pointerup in addition to click.
      // Only guard a genuine touch gesture; mouse clicks go through onClick.
      if (event.pointerType !== "touch" || !touch || touch.double || touch.moved) return;
      const ctx = mediaContext(event.target);
      if (ctx?.key === touch.key && !onSeekStrip(event, ctx)) event.stopImmediatePropagation();
    }
    function onTouchEnd(event) {
      if (!touch) return;
      const gesture = touch;
      touch = null;
      if (gesture.moved || event.changedTouches?.length !== 1) return;
      const ctx = mediaContext(event.target);
      if (!ctx || ctx.key !== gesture.key || onSeekStrip(event, ctx)) return;
      const p = point(event),
        now = Date.now();
      const double =
        gesture.double &&
        near(
          recent,
          {
            ...p,
            key: ctx.key,
          },
          now,
        );
      if (double) recent = null;
      else
        recent = {
          key: ctx.key,
          x: p.x,
          y: p.y,
          at: now,
        };
      // The synthetic click follows touchend. Use this verdict for that click,
      // rather than incorrectly counting it as a new tap.
      syntheticClick = {
        key: ctx.key,
        x: p.x,
        y: p.y,
        at: now,
        allow: double,
      };
      if (!double) event.stopImmediatePropagation();
    }
    function onClick(event) {
      const ctx = mediaContext(event.target);
      if (!ctx || onSeekStrip(event, ctx)) {
        recent = null;
        syntheticClick = null;
        return;
      }
      const p = point(event),
        now = Date.now();
      if (
        syntheticClick &&
        now - syntheticClick.at <= TOUCH_CLICK_MS &&
        syntheticClick.key === ctx.key &&
        Math.abs(p.x - syntheticClick.x) < SAME_SPOT_PX &&
        Math.abs(p.y - syntheticClick.y) < SAME_SPOT_PX
      ) {
        const allow = syntheticClick.allow;
        syntheticClick = null;
        if (!allow) cancel(event);
        return;
      }
      syntheticClick = null;
      const tap = {
        key: ctx.key,
        x: p.x,
        y: p.y,
        at: now,
      };
      if (near(recent, tap, now)) {
        recent = null;
        return;
      }
      recent = tap;
      cancel(event);
    }
    function install() {
      // manipulation disables Safari's double-tap zoom on the video itself,
      // but preserves pinch-to-zoom and vertical scrolling elsewhere.
      const css = document.createElement("style");
      css.id = "rodx-video-tap-guard-css";
      css.textContent = extractedCSS1;
      (document.head || document.documentElement).append(css);
      document.addEventListener("touchstart", onTouchStart, {
        capture: true,
        passive: true,
      });
      document.addEventListener("touchmove", onTouchMove, {
        capture: true,
        passive: true,
      });
      document.addEventListener("pointerup", onPointerUp, true);
      document.addEventListener("touchend", onTouchEnd, {
        capture: true,
        passive: true,
      });
      document.addEventListener(
        "touchcancel",
        () => {
          touch = null;
          syntheticClick = null;
        },
        true,
      );
      document.addEventListener("click", onClick, true);
      window.addEventListener("blur", () => {
        recent = null;
        touch = null;
        syntheticClick = null;
      });
    }
    install();
    return Object.freeze({});
  })();
}
