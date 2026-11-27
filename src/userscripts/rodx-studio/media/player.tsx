import { NATIVE_X_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import { state } from "../state/deck.js";

export interface PlayerPreferenceController {
  scan: () => void;
  needsRodX: () => boolean;
}

export let PlayerPreference: PlayerPreferenceController;

// Keep native video ownership until the installed VideoJS API has a verified
// adapter for existing X media elements. The RodX transport is the fallback.
export function initializeDeckPlayerPreference(): PlayerPreferenceController {
  const needsRodX = () => state.visual.playerMode === "rodx" || state.visual.playerMode === "videojs";
  PlayerPreference = {
    needsRodX,
    scan() {
      for (const video of document.querySelectorAll<HTMLVideoElement>(NATIVE_X_SELECTORS.visiblePageVideos)) {
        const wrapper = video.closest(NATIVE_X_SELECTORS.videoComponentWrappers) || video.parentElement;
        wrapper?.querySelectorAll<HTMLElement>(RODX_SELECTORS.videoTransport).forEach((bar) => {
          bar.hidden = !needsRodX();
        });
      }
    },
  };
  return PlayerPreference;
}
