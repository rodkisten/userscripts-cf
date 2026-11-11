import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { state } from "../state/deck.js";

export let ViewportPlayback;

export function initializeDeckViewportPlayback() {
  ViewportPlayback = (() => {
    const info = new WeakMap();
    let raf = 0,
      installed = false;
    const RESUME_COOLDOWN_MS = RUNTIME_LIMITS.mediaViewport.resumeCooldownMs;
    const EXIT_GRACE_MS = RUNTIME_LIMITS.mediaViewport.exitGraceMs;
    function ratio(video) {
      const rect = video.getBoundingClientRect();
      const width = window.visualViewport?.width || innerWidth;
      const height = window.visualViewport?.height || innerHeight;
      const top = document.getElementById("rodx-active-tweetbar")?.hidden === false ? 40 : 0;
      if (rect.width < 1 || rect.height < 1) return 0;
      const x = Math.max(0, Math.min(rect.right, width) - Math.max(rect.left, 0));
      const y = Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, top));
      const possible = Math.min(rect.width, width) * Math.min(rect.height, height - top);
      return possible ? Math.min(1, (x * y) / possible) : 0;
    }
    function isFeed(video) {
      return (
        Boolean(video.closest(NATIVE_X_SELECTORS.mainTweets)) &&
        !video.closest(NATIVE_X_SELECTORS.xOverlayLayers)
      );
    }
    function update() {
      raf = 0;
      if (document.visibilityState !== "visible") return;
      const start = state.visual.autoPlayEnterPercent / 100;
      const exit = Math.min(start - 0.05, Math.max(0, 1 - state.visual.autoPauseExitPercent / 100));
      const now = performance.now();
      for (const video of Studio.dom.nodes('main :is(article,[role="article"])[data-testid="tweet"] video')) {
        if (!isFeed(video) || !video.isConnected) continue;
        let item = info.get(video);
        if (!item) {
          item = {
            lastPlayAttempt: -Infinity,
            lowSince: null,
            manuallyPausedUntil: 0,
            running: false,
          };
          info.set(video, item);
        }
        const visible = ratio(video);
        if (visible === 0) {
          delete video.dataset.rodxGesturePaused;
          item.manuallyPausedUntil = 0;
        }
        // Playback wins while the video is meaningfully visible. Native X
        // auto-pause events are corrected on the next interval where allowed.
        if (visible >= start) {
          item.lowSince = null;
          if (state.visual.videoMute && !video.dataset.rodxUserUnmuted) video.muted = true;
          if (
            video.paused &&
            !video.dataset.rodxGesturePaused &&
            !item.running &&
            now >= item.manuallyPausedUntil &&
            now - item.lastPlayAttempt >= RESUME_COOLDOWN_MS
          ) {
            item.lastPlayAttempt = now;
            item.running = true;
            try {
              Promise.resolve(video.play())
                .catch(() => {})
                .finally(() => {
                  item.running = false;
                });
            } catch (_) {
              item.running = false;
            }
          }
          continue;
        }
        // A few dropped pixels, resize, mobile toolbar animations and fast
        // scroll bounce must NEVER pause the player immediately.
        if (visible > 0) {
          item.lowSince = null;
          continue;
        }
        if (item.lowSince === null) item.lowSince = now;
        if (now - item.lowSince >= EXIT_GRACE_MS && !video.paused) {
          try {
            video.pause();
          } catch (_) {
            /* native player has control */
          }
        }
      }
    }
    function request() {
      if (!raf) raf = requestAnimationFrame(update);
    }
    function scan() {
      if (!installed) {
        installed = true;
        window.addEventListener("scroll", request, {
          passive: true,
          capture: true,
        });
        window.visualViewport?.addEventListener("scroll", request, {
          passive: true,
        });
        window.visualViewport?.addEventListener("resize", request, {
          passive: true,
        });
        window.addEventListener("resize", request, {
          passive: true,
        });
        // A deliberate click on a native pause/play control temporarily
        // suppresses RodX resume attempts for that particular video.
        document.addEventListener(
          "click",
          (event) => {
            const button = event.target.closest?.(DOM_SELECTORS.interactiveButtons);
            if (
              !button ||
              !/^(?:play|pause|reproduzir|pausar)$/i.test(
                String(button.getAttribute("aria-label") || "").trim(),
              )
            )
              return;
            const card = button.closest(NATIVE_X_SELECTORS.nativeTweets);
            const video = card?.querySelector(DOM_SELECTORS.videos);
            const item = video && info.get(video);
            if (item && !video.paused) item.manuallyPausedUntil = performance.now() + 30000;
          },
          true,
        );
        document.addEventListener("visibilitychange", () => {
          // Safari and X decide whether background video can play. Do not
          // issue extra pause() calls as the app enters the background.
          if (document.visibilityState === "visible") request();
        });
      }
      request();
    }
    Studio.register("media.playback-clock", request, {
      group: "media",
      events: ["media"],
      minMs: RUNTIME_LIMITS.mediaViewport.initializeDeckViewportPlaybackMinMs,
    });
    return {
      scan,
    };
  })();
}
