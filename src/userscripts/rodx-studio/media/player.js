import { applyComponentStyle, clearComponentStyle } from "../../../core/css.js";
import {
  MEDIA_COMPONENT_SELECTORS,
  DOM_SELECTORS,
  NATIVE_X_SELECTORS,
  RODX_SELECTORS,
} from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { VideoExperience } from "./experience.js";
import { SeekPreviews } from "./previews.js";
import { state } from "../state/deck.js";

export let PlayerPreference;

export function initializeDeckPlayerPreference() {
  PlayerPreference = (() => {
    const mounted = new Map();
    let loading = false,
      failed = false;
    function load() {
      if (loading || customElements.get("video-skin")) return;
      loading = true;
      try {
        // The userscript manager evaluates the external @require before this script.
        failed = !customElements.get("video-skin") || !customElements.get("video-player");
      } catch (error) {
        failed = true;
        console.error("[RodX] Falha ao inicializar Video.js 10.3.0:", error);
      }
      if (failed) console.warn("[RodX] Video.js indisponível; controles RodX ativos.");
    }
    function configureGestures(entry) {
      const container =
        entry.skin.shadowRoot?.querySelector(MEDIA_COMPONENT_SELECTORS.mediaContainer) ||
        entry.skin.querySelector(MEDIA_COMPONENT_SELECTORS.mediaContainer);
      SeekPreviews.attach(entry.video, entry);
      if (!container || entry.gestureContainer === container) return;
      const specs = [
        {
          type: "tap",
          action: "togglePaused",
          pointer: "mouse",
          region: "center",
        },
        {
          type: "doubletap",
          action: "seekStep",
          value: "-5",
          region: "left",
        },
        {
          type: "doubletap",
          action: "toggleFullscreen",
          region: "center",
        },
        {
          type: "doubletap",
          action: "seekStep",
          value: "5",
          region: "right",
        },
      ];
      for (const spec of specs) {
        const matches = [...container.querySelectorAll(MEDIA_COMPONENT_SELECTORS.mediaGesture)].filter(
          (el) =>
            el.getAttribute("type") === spec.type &&
            el.getAttribute("region") === spec.region &&
            (spec.type === "doubletap" || el.getAttribute("pointer") === spec.pointer),
        );
        const gesture = matches.shift() || document.createElement("media-gesture");
        matches.forEach((el) => el.remove());
        for (const key of ["type", "action", "value", "pointer", "region"]) {
          if (spec[key] === undefined) gesture.removeAttribute(key);
          else gesture.setAttribute(key, spec[key]);
        }
        gesture.removeAttribute("disabled");
        if (!gesture.isConnected) container.append(gesture);
      }
      entry.gestureContainer = container;
    }
    function respectGesturePause(video, root) {
      let armedUntil = 0,
        intent = "",
        press = null;
      const lifecycle = new AbortController();
      const arm = (event) => {
        const down = press;
        press = null;
        if (
          !down ||
          down.id !== event.pointerId ||
          performance.now() - down.at > 250 ||
          Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12
        )
          return;
        const path = event.composedPath();
        const play = path.some((el) => el?.matches?.(MEDIA_COMPONENT_SELECTORS.mediaPlayButton));
        const interactive = path.some((el) => el?.matches?.(DOM_SELECTORS.playerInteractiveControls));
        if (!play) {
          if (interactive || event.pointerType !== "mouse") return;
          const rect = video.getBoundingClientRect();
          if (
            !rect.width ||
            !rect.height ||
            event.clientX < rect.left + rect.width / 3 ||
            event.clientX > rect.right - rect.width / 3
          )
            return;
        }
        intent = video.paused ? "play" : "pause";
        armedUntil = performance.now() + 650;
        if (intent === "play") delete video.dataset.rodxGesturePaused;
      };
      root.addEventListener(
        "pointerdown",
        (event) => {
          press = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            at: performance.now(),
          };
        },
        {
          capture: true,
          signal: lifecycle.signal,
        },
      );
      root.addEventListener(
        "pointercancel",
        () => {
          press = null;
        },
        {
          capture: true,
          signal: lifecycle.signal,
        },
      );
      root.addEventListener("pointerup", arm, {
        capture: true,
        signal: lifecycle.signal,
      });
      video.addEventListener(
        "pause",
        () => {
          if (performance.now() <= armedUntil && intent === "pause") video.dataset.rodxGesturePaused = "1";
        },
        {
          signal: lifecycle.signal,
        },
      );
      video.addEventListener("loadstart", () => delete video.dataset.rodxGesturePaused, {
        signal: lifecycle.signal,
      });
      video.addEventListener(
        "play",
        () => {
          if (video.dataset.rodxGesturePaused) {
            if (performance.now() <= armedUntil && intent === "play") delete video.dataset.rodxGesturePaused;
            else video.pause();
          }
        },
        {
          signal: lifecycle.signal,
        },
      );
      return () => lifecycle.abort();
    }
    function restore(video, entry) {
      SeekPreviews.cleanup(video);
      entry.cleanupGestures?.();
      if (entry.skin.contains(video)) entry.root.before(video);
      entry.root.remove();
      video.controls = entry.controls;
      clearComponentStyle(video);
      video.style.cssText = entry.style;
      delete video.dataset.rodxGesturePaused;
      mounted.delete(video);
    }
    function scan() {
      const mode = state.visual.playerMode;
      if (mode === "videojs" && Studio.dom.nodes("video").length) load();
      for (const [video, entry] of mounted) {
        if (!video.isConnected || mode !== "videojs") restore(video, entry);
        else configureGestures(entry);
      }
      for (const video of document.querySelectorAll(NATIVE_X_SELECTORS.visiblePageVideos)) {
        const wrapper = video.closest(NATIVE_X_SELECTORS.videoComponentWrappers) || video.parentElement;
        if (!wrapper) continue;
        wrapper.querySelectorAll(RODX_SELECTORS.videoTransport).forEach((bar) => {
          bar.hidden = mode !== "rodx" && !(mode === "videojs" && failed);
        });
        if (mode !== "videojs" || !customElements.get("video-skin") || mounted.has(video)) continue;
        const root = document.createElement("video-player");
        const skin = document.createElement("video-skin");
        root.dataset.rodxPlayerControl = "1";
        applyComponentStyle(root, "rx-player-root", false);
        const rect = video.getBoundingClientRect();
        const ratio =
          video.videoWidth && video.videoHeight
            ? video.videoWidth / video.videoHeight
            : rect.width && rect.height
              ? rect.width / rect.height
              : 16 / 9;
        applyComponentStyle(skin, "rx-player-skin", false);
        skin.style.setProperty("aspect-ratio", String(ratio), "important");
        video.addEventListener("loadedmetadata", () => {
          if (video.videoWidth && video.videoHeight)
            skin.style.setProperty("aspect-ratio", String(video.videoWidth / video.videoHeight), "important");
        });
        const entry = {
          video,
          root,
          skin,
          controls: video.controls,
          style: video.style.cssText,
        };
        video.before(root);
        root.append(skin);
        skin.append(video);
        video.controls = false;
        applyComponentStyle(video, "rx-player-video", true);
        mounted.set(video, entry);
        configureGestures(entry);
        void Promise.resolve(skin.updateComplete).then(() => {
          if (root.isConnected) configureGestures(entry);
        });
        entry.cleanupGestures = respectGesturePause(video, root);
        let requestedAudio;
        root.addEventListener(
          "pointerdown",
          (event) => {
            if (
              event.composedPath().some((el) => el?.matches?.(MEDIA_COMPONENT_SELECTORS.mediaAudioControls))
            ) {
              requestedAudio = video.muted || video.volume === 0;
              if (requestedAudio) VideoExperience.enableAudio(video, true);
            }
          },
          true,
        );
        root.addEventListener("click", (event) => {
          const control = event
            .composedPath()
            .find((el) => el?.matches?.(MEDIA_COMPONENT_SELECTORS.mediaAudioControls));
          if (control) {
            const audible = requestedAudio ?? (video.muted || video.volume === 0);
            requestedAudio = undefined;
            VideoExperience.enableAudio(video, audible);
            queueMicrotask(() => VideoExperience.enableAudio(video, audible));
          }
          event.stopPropagation();
        });
      }
    }
    return {
      scan,
      needsRodX: () =>
        state.visual.playerMode === "rodx" || (state.visual.playerMode === "videojs" && failed),
    };
  })();
}
