import React, { useEffect, useRef, useState } from "react";
import { mountView, disposeView } from "../ui/runtime.tsx";
// TODO: verify exact subpaths/exports against installed @videojs/react v10+ package
import {
  VideoPlayer,
  VideoSkin,
  MediaGesture,
  type MediaGestureProps,
} from "@videojs/react";

import { applyComponentStyle, clearComponentStyle } from "../../../core/css.js";
import {
  MEDIA_COMPONENT_SELECTORS,
  DOM_SELECTORS,
  NATIVE_X_SELECTORS,
  RODX_SELECTORS,
} from "../../../selectors.js";
import { Studio } from "../core/studio-runtime.js";
import { VideoExperience } from "./playback.js";
import { SeekPreviews } from "./seek-preview.tsx";
import { state } from "../state/deck.js";

// TODO: extract to types/player-preference.ts
export interface PlayerPreferenceController {
  scan: () => void;
  needsRodX: () => boolean;
}

// TODO: extract to types/player-preference.ts
interface MountedVideoEntry {
  video: HTMLVideoElement;
  host: HTMLDivElement;
  controls: boolean;
  style: string;
  cleanupGestures?: () => void;
}

// TODO: extract to config/gestures.ts
const GESTURE_SPECS: ReadonlyArray<
  Pick<MediaGestureProps, "type" | "action" | "value" | "pointer" | "region">
> = [
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

// TODO: extract to hooks/useRespectGesturePause.ts
function attachRespectGesturePause(
  video: HTMLVideoElement,
  root: HTMLElement,
): () => void {
  let armedUntil = 0;
  let intent: "play" | "pause" | "" = "";
  let press: { id: number; x: number; y: number; at: number } | null = null;
  const lifecycle = new AbortController();

  const arm = (event: PointerEvent) => {
    const down = press;
    press = null;
    if (
      !down ||
      down.id !== event.pointerId ||
      performance.now() - down.at > 250 ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12
    ) {
      return;
    }

    const path = event.composedPath() as Element[];
    const play = path.some((el) =>
      el?.matches?.(MEDIA_COMPONENT_SELECTORS.mediaPlayButton),
    );
    const interactive = path.some((el) =>
      el?.matches?.(DOM_SELECTORS.playerInteractiveControls),
    );

    if (!play) {
      if (interactive || event.pointerType !== "mouse") {
        return;
      }
      const rect = video.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        event.clientX < rect.left + rect.width / 3 ||
        event.clientX > rect.right - rect.width / 3
      ) {
        return;
      }
    }

    intent = video.paused ? "play" : "pause";
    armedUntil = performance.now() + 650;
    if (intent === "play") {
      delete video.dataset.rodxGesturePaused;
    }
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
    { capture: true, signal: lifecycle.signal },
  );

  root.addEventListener(
    "pointercancel",
    () => {
      press = null;
    },
    { capture: true, signal: lifecycle.signal },
  );

  root.addEventListener("pointerup", arm, {
    capture: true,
    signal: lifecycle.signal,
  });

  video.addEventListener(
    "pause",
    () => {
      if (performance.now() <= armedUntil && intent === "pause") {
        video.dataset.rodxGesturePaused = "1";
      }
    },
    { signal: lifecycle.signal },
  );

  video.addEventListener(
    "loadstart",
    () => {
      delete video.dataset.rodxGesturePaused;
    },
    { signal: lifecycle.signal },
  );

  video.addEventListener(
    "play",
    () => {
      if (video.dataset.rodxGesturePaused) {
        if (performance.now() <= armedUntil && intent === "play") {
          delete video.dataset.rodxGesturePaused;
        } else {
          video.pause();
        }
      }
    },
    { signal: lifecycle.signal },
  );

  return () => lifecycle.abort();
}

// TODO: extract to components/RodXVideoPlayerShell.tsx
interface RodXVideoPlayerShellProps {
  video: HTMLVideoElement;
  entry: MountedVideoEntry;
  onCleanupReady: (cleanup: () => void) => void;
}

const RodXVideoPlayerShell: React.FC<RodXVideoPlayerShellProps> = ({
  video,
  entry,
  onCleanupReady,
}) => {
  const playerRef = useRef<HTMLElement | null>(null);
  const skinRef = useRef<HTMLElement | null>(null);
  const requestedAudioRef = useRef<boolean | undefined>(undefined);

  const [aspectRatio, setAspectRatio] = useState<string>(() => {
    const rect = video.getBoundingClientRect();
    const ratio =
      video.videoWidth && video.videoHeight
        ? video.videoWidth / video.videoHeight
        : rect.width && rect.height
          ? rect.width / rect.height
          : 16 / 9;
    return String(ratio);
  });

  // Reparent existing native <video> element into <VideoSkin> & sync styles
  useEffect(() => {
    const rootEl = playerRef.current;
    const skinEl = skinRef.current;
    if (!rootEl || !skinEl) return;

    rootEl.dataset.rodxPlayerControl = "1";
    applyComponentStyle(rootEl, "rx-player-root", false);
    applyComponentStyle(skinEl, "rx-player-skin", false);
    skinEl.style.setProperty("aspect-ratio", aspectRatio, "important");

    if (!skinEl.contains(video)) {
      skinEl.append(video);
    }

    video.controls = false;
    applyComponentStyle(video, "rx-player-video", true);
    SeekPreviews.attach(video, entry);

    const cleanup = attachRespectGesturePause(video, rootEl);
    onCleanupReady(cleanup);

    return () => {
      cleanup();
    };
  }, [video, entry, aspectRatio, onCleanupReady]);

  // Update aspect-ratio dynamically on metadata load
  useEffect(() => {
    const handleLoadedMetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        const nextRatio = String(video.videoWidth / video.videoHeight);
        setAspectRatio(nextRatio);
        skinRef.current?.style.setProperty("aspect-ratio", nextRatio, "important");
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [video]);

  // Capture-phase audio unlock handler matching original root listener
  useEffect(() => {
    const rootEl = playerRef.current;
    if (!rootEl) return;

    const handlePointerDownCapture = (event: PointerEvent) => {
      const path = event.composedPath() as Element[];
      if (
        path.some((el) =>
          el?.matches?.(MEDIA_COMPONENT_SELECTORS.mediaAudioControls),
        )
      ) {
        requestedAudioRef.current = video.muted || video.volume === 0;
        if (requestedAudioRef.current) {
          VideoExperience.enableAudio(video, true);
        }
      }
    };

    rootEl.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => {
      rootEl.removeEventListener("pointerdown", handlePointerDownCapture, true);
    };
  }, [video]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    const path = event.nativeEvent.composedPath() as Element[];
    const control = path.find((el) =>
      el?.matches?.(MEDIA_COMPONENT_SELECTORS.mediaAudioControls),
    );
    if (control) {
      const audible =
        requestedAudioRef.current ?? (video.muted || video.volume === 0);
      requestedAudioRef.current = undefined;
      VideoExperience.enableAudio(video, audible);
      queueMicrotask(() => VideoExperience.enableAudio(video, audible));
    }
    event.stopPropagation();
  };

  return (
    <VideoPlayer ref={playerRef as React.Ref<any>} onClick={handleClick}>
      <VideoSkin
        ref={skinRef as React.Ref<any>}
        style={{ aspectRatio }}
      >
        {/* TODO: verify if @videojs/react slots <MediaGesture> inside <VideoSkin> or <MediaContainer> */}
        {GESTURE_SPECS.map((spec) => (
          <MediaGesture
            key={`${spec.type}-${spec.region}-${spec.pointer ?? "any"}`}
            type={spec.type}
            action={spec.action}
            value={spec.value}
            pointer={spec.pointer}
            region={spec.region}
          />
        ))}
      </VideoSkin>
    </VideoPlayer>
  );
};

// TODO: extract to state/player-preference-singleton.ts
export let PlayerPreference: PlayerPreferenceController;

export function initializeDeckPlayerPreference(): PlayerPreferenceController {
  PlayerPreference = (() => {
    const mounted = new Map<HTMLVideoElement, MountedVideoEntry>();
    let loading = false;
    let failed = false;

    function load(): void {
      if (loading || !failed) {
        if (loading) return;
      }
      loading = true;
      try {
        // @videojs/react registers custom elements upon module evaluation
        failed = !VideoPlayer || !VideoSkin;
      } catch (error) {
        failed = true;
        console.error("[RodX] Falha ao inicializar @videojs/react:", error);
      }
      if (failed) {
        console.warn("[RodX] Video.js indisponível; controles RodX ativos.");
      }
    }

    function restore(video: HTMLVideoElement, entry: MountedVideoEntry): void {
      SeekPreviews.cleanup(video);
      entry.cleanupGestures?.();

      if (entry.host.contains(video)) {
        entry.host.before(video);
      }

      disposeView(entry.host);
      entry.host.remove();

      video.controls = entry.controls;
      clearComponentStyle(video);
      video.style.cssText = entry.style;
      delete video.dataset.rodxGesturePaused;
      mounted.delete(video);
    }

    function scan(): void {
      const mode = state.visual.playerMode;

      if (mode === "videojs" && Studio.dom.nodes("video").length) {
        load();
      }

      for (const [video, entry] of mounted) {
        if (!video.isConnected || mode !== "videojs") {
          restore(video, entry);
        } else {
          // Keep seek preview attachment idempotent on rescans
          SeekPreviews.attach(video, entry);
        }
      }

      const videos = document.querySelectorAll<HTMLVideoElement>(
        NATIVE_X_SELECTORS.visiblePageVideos,
      );

      for (const video of videos) {
        const wrapper =
          video.closest(NATIVE_X_SELECTORS.videoComponentWrappers) ||
          video.parentElement;
        if (!wrapper) {
          continue;
        }

        wrapper
          .querySelectorAll<HTMLElement>(RODX_SELECTORS.videoTransport)
          .forEach((bar) => {
            bar.hidden = mode !== "rodx" && !(mode === "videojs" && failed);
          });

        if (mode !== "videojs" || failed || mounted.has(video)) {
          continue;
        }

        const host = document.createElement("div");
        host.style.display = "contents";
        video.before(host);

        const entry: MountedVideoEntry = {
          video,
          host,
          controls: video.controls,
          style: video.style.cssText,
        };

        mounted.set(video, entry);

        mountView(host, () => (
          <RodXVideoPlayerShell
            video={video}
            entry={entry}
            onCleanupReady={(cleanup) => {
              entry.cleanupGestures = cleanup;
            }}
          />
        ));
      }
    }

    return {
      scan,
      needsRodX: () =>
        state.visual.playerMode === "rodx" ||
        (state.visual.playerMode === "videojs" && failed),
    };
  })();

  return PlayerPreference;
}
