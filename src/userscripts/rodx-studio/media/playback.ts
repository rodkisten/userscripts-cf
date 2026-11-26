import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio-runtime.js";
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

// Consolidated ViewportPlayback

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
      if (rect.width < 1 || rect.height < 1) {
return 0;
}
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
      if (document.visibilityState !== "visible") {
return;
}
      const start = state.visual.autoPlayEnterPercent / 100;
      const exit = Math.min(start - 0.05, Math.max(0, 1 - state.visual.autoPauseExitPercent / 100));
      const now = performance.now();
      for (const video of Studio.dom.nodes('main :is(article,[role="article"])[data-testid="tweet"] video')) {
        if (!(video instanceof HTMLVideoElement) || !isFeed(video) || !video.isConnected) {
continue;
}
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
          if (state.visual.videoMute && !video.dataset.rodxUserUnmuted) {
video.muted = true;
}
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
        if (item.lowSince === null) {
item.lowSince = now;
}
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
      if (!raf) {
raf = requestAnimationFrame(update);
}
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
            const button = event.target instanceof Element ? event.target.closest(DOM_SELECTORS.interactiveButtons) : null;
            if (
              !button ||
              !/^(?:play|pause|reproduzir|pausar)$/i.test(
                String(button.getAttribute("aria-label") || "").trim(),
              )
            )
              {
return;
}
            const card = button.closest(NATIVE_X_SELECTORS.nativeTweets);
            const video = card?.querySelector(DOM_SELECTORS.videos);
            const item = video && info.get(video);
            if (item && !video.paused)
              {
item.manuallyPausedUntil =
                performance.now() + RUNTIME_LIMITS.videoPlayback.manualPauseDurationMs;
}
          },
          true,
        );
        document.addEventListener("visibilitychange", () => {
          // Safari and X decide whether background video can play. Do not
          // issue extra pause() calls as the app enters the background.
          if (document.visibilityState === "visible") {
request();
}
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
