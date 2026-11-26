import { NATIVE_X_SELECTORS, DOM_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { state } from "../state/deck.js";

// TODO: extract to types/video-experience.ts
export interface VideoExperienceController {
  scan: () => void;
  enableAudio: (video: HTMLVideoElement, audible: boolean) => void;
}

// TODO: extract to constants/audio-labels.ts
const MUTE_LABEL_PATTERN =
  /(?:^|\W)(?:mute|unmute|volume|sound|som|áudio|audio|silenciar|ativar som|desativar som)(?:\W|$)/i;

let globalListenersController: AbortController | null = null;

export let VideoExperience: VideoExperienceController;

export function initializeDeckVideoExperience(): VideoExperienceController {
  // Evita listeners globais duplicados caso initialize seja chamado novamente
  globalListenersController?.abort();
  globalListenersController = new AbortController();
  const { signal } = globalListenersController;

  const initialized = new WeakSet<HTMLVideoElement>();
  const soundEnabled = new WeakSet<HTMLVideoElement>();

  function isUserAllowedAudio(video: HTMLVideoElement): boolean {
    return soundEnabled.has(video) || video.dataset.rodxUserUnmuted === "1";
  }

  function enforceMutePolicy(video: HTMLVideoElement): void {
    if (state.visual.videoMute && !isUserAllowedAudio(video) && !video.muted) {
      video.muted = true;
    }
  }

  function setAudioPreference(video: HTMLVideoElement, audible: boolean): void {
    if (audible) {
      soundEnabled.add(video);
      video.dataset.rodxUserUnmuted = "1";
    } else {
      soundEnabled.delete(video);
      delete video.dataset.rodxUserUnmuted;
    }
  }

  function resolveVolumeControl(event: Event): HTMLElement | null {
    const path = event.composedPath();
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      const candidate = node.closest<HTMLElement>(NATIVE_X_SELECTORS.volumeControlCandidates);
      if (candidate) return candidate;
    }
    return null;
  }

  function hasAudioLabel(control: HTMLElement): boolean {
    const label = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.dataset.testid,
    ]
      .filter(Boolean)
      .join(" ");

    return MUTE_LABEL_PATTERN.test(label);
  }

  function allowNativeVolume(event: Event): void {
    const control = resolveVolumeControl(event);
    if (!control || control.closest(RODX_SELECTORS.videoTransport)) {
      return;
    }

    if (!hasAudioLabel(control)) {
      return;
    }

    const video = control
      .closest(NATIVE_X_SELECTORS.videoOverlayContainers)
      ?.querySelector<HTMLVideoElement>(DOM_SELECTORS.videos);

    if (!video) {
      return;
    }

    // No evento de click (pós-ação nativa), sincroniza se o usuário mutou ou desmutou
    if (event.type === "click") {
      queueMicrotask(() => {
        setAudioPreference(video, !video.muted && video.volume > 0);
      });
    } else {
      setAudioPreference(video, true);
    }
  }

  document.addEventListener("pointerdown", allowNativeVolume, { capture: true, signal });
  document.addEventListener("click", allowNativeVolume, { capture: true, signal });

  function bindVideoListeners(video: HTMLVideoElement): void {
    if (initialized.has(video)) return;
    initialized.add(video);

    video.addEventListener("play", () => enforceMutePolicy(video));
    video.addEventListener("volumechange", () => enforceMutePolicy(video));
    video.addEventListener("loadstart", () => {
      if (video.dataset.rodxUserUnmuted !== "1") {
        soundEnabled.delete(video);
      }
      enforceMutePolicy(video);
    });
  }

  function scan(): void {
    // Quality UI intentionally disabled: the X-managed HLS/MSE player must
    // own its adaptive resolution and progress timeline.
    document.querySelectorAll(RODX_SELECTORS.videoQualityControl).forEach((el) => el.remove());

    const videos = Studio.dom.nodes("video") as Iterable<HTMLVideoElement>;
    for (const video of videos) {
      enforceMutePolicy(video);
      bindVideoListeners(video);
    }
  }

  function enableAudio(video: HTMLVideoElement, audible: boolean): void {
    setAudioPreference(video, audible);

    if (audible) {
      video.defaultMuted = false;
      video.removeAttribute("muted");
      if (video.volume === 0) {
        video.volume = 1;
      }
    }

    video.muted = !audible;
  }

  VideoExperience = Object.freeze({
    scan,
    enableAudio,
  });

  return VideoExperience;
}
