import { CSS_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { state } from "../state/deck.js";

export let VideoExperience;

export function initializeDeckVideoExperience() {
  VideoExperience = (() => {
    const initialized = new WeakSet();
    const soundEnabled = new WeakSet();
    const MUTE_LABEL =
      /(?:^|\W)(?:mute|unmute|volume|sound|som|áudio|audio|silenciar|ativar som|desativar som)(?:\W|$)/i;
    function allowNativeVolume(event) {
      const control = event.target?.closest?.(CSS_SELECTORS.volumeControlCandidates);
      if (!control) return;
      const label = [
        control.getAttribute("aria-label"),
        control.getAttribute("title"),
        control.dataset.testid,
      ]
        .filter(Boolean)
        .join(" ");
      if (!MUTE_LABEL.test(label)) return;
      const video = control
        .closest(CSS_SELECTORS.videoOverlayContainers)
        ?.querySelector(CSS_SELECTORS.videos);
      if (video && !control.closest(CSS_SELECTORS.videoTransport)) {
        soundEnabled.add(video);
        video.dataset.rodxUserUnmuted = "1";
      }
    }
    document.addEventListener("pointerdown", allowNativeVolume, true);
    document.addEventListener("click", allowNativeVolume, true);
    function scan() {
      // Quality UI intentionally disabled: the X-managed HLS/MSE player must
      // own its adaptive resolution and progress timeline.
      document.querySelectorAll(CSS_SELECTORS.videoQualityControl).forEach((select) => select.remove());
      for (const video of Studio.dom.nodes("video")) {
        if (state.visual.videoMute && !soundEnabled.has(video) && !video.muted) video.muted = true;
        if (initialized.has(video)) continue;
        initialized.add(video);
        video.addEventListener("play", () => {
          if (state.visual.videoMute && !soundEnabled.has(video)) video.muted = true;
        });
        video.addEventListener("volumechange", () => {
          if (state.visual.videoMute && !soundEnabled.has(video) && !video.muted) video.muted = true;
        });
        video.addEventListener("loadstart", () => {
          if (!video.dataset.rodxUserUnmuted) soundEnabled.delete(video);
          if (state.visual.videoMute && !soundEnabled.has(video)) video.muted = true;
        });
      }
    }
    function enableAudio(video, audible) {
      if (audible) {
        soundEnabled.add(video);
        video.dataset.rodxUserUnmuted = "1";
        video.defaultMuted = false;
        video.removeAttribute("muted");
        if (video.volume === 0) video.volume = 1;
      } else {
        soundEnabled.delete(video);
        delete video.dataset.rodxUserUnmuted;
      }
      video.muted = !audible;
    }
    return Object.freeze({
      scan,
      enableAudio,
    });
  })();
}
