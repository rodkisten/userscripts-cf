import React, { useCallback, useEffect, useRef, useState } from "react";
import { mountView } from "../ui/runtime.tsx";
import VolumeMutedIcon from "../../../assets/icons/volume-muted.svg?component";
import VolumeOnIcon from "../../../assets/icons/volume-on.svg?component";
import { NATIVE_X_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import transportCSS from "../../../styles/extracted/userscripts-rodx-studio-media-transport-1.css?inline";
import styles, { css } from "../ui/components.module.css";
import { VideoExperience } from "./experience.js";

// TODO: extract to types/video-transport.ts
export interface VideoControlsProps {
  video: HTMLVideoElement;
}

// TODO: extract to types/video-transport.ts
export interface VideoTransportController {
  scan: () => void;
}

interface PlaybackSnapshot {
  duration: number;
  time: number;
  paused: boolean;
  muted: boolean;
}

// TODO: extract to constants/video-transport.ts
const TRANSPORT_STYLE_ID = "rodx-video-transport-css";
const SEEK_RESOLUTION = 1000;
const MIN_WRAPPER_WIDTH = 135;
const MIN_WRAPPER_HEIGHT = 90;

const VIDEO_SYNC_EVENTS = [
  "timeupdate",
  "durationchange",
  "loadedmetadata",
  "play",
  "pause",
  "volumechange",
  "seeking",
  "seeked",
] as const;

// TODO: extract to utils/time-format.ts
function formatTime(value: number): string {
  const totalSeconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// TODO: extract to utils/media-duration.ts
function getSeekableDuration(video: HTMLVideoElement): number {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }
  try {
    if (video.seekable.length > 0) {
      return video.seekable.end(video.seekable.length - 1);
    }
  } catch {
    // Ignora IndexSizeError em streams MSE ainda não inicializados
  }
  return 0;
}

function ensureTransportStyles(): void {
  if (document.getElementById(TRANSPORT_STYLE_ID)) {
    return;
  }
  const styleEl = document.createElement("style");
  styleEl.id = TRANSPORT_STYLE_ID;
  styleEl.textContent = `${transportCSS}\n${css}`;
  (document.head || document.documentElement).append(styleEl);
}

// TODO: extract to components/VideoControls.tsx
export const VideoControls: React.FC<VideoControlsProps> = ({ video }) => {
  const [playback, setPlayback] = useState<PlaybackSnapshot>(() => ({
    duration: 0,
    time: 0,
    paused: video.paused,
    muted: video.muted || video.volume === 0,
  }));
  const [scrubbing, setScrubbing] = useState(false);
  const [position, setPosition] = useState(0);
  const scrubbingRef = useRef(false);

  const sync = useCallback(() => {
    const duration = getSeekableDuration(video);
    const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const muted = video.muted || video.volume === 0;

    setPlayback((prev) => {
      if (
        prev.duration === duration &&
        prev.time === time &&
        prev.paused === video.paused &&
        prev.muted === muted
      ) {
        return prev;
      }
      return { duration, time, paused: video.paused, muted };
    });

    if (!scrubbingRef.current) {
      setPosition(duration > 0 ? Math.round((time / duration) * SEEK_RESOLUTION) : 0);
    }
  }, [video]);

  useEffect(() => {
    ensureTransportStyles();
    const controller = new AbortController();

    for (const eventName of VIDEO_SYNC_EVENTS) {
      video.addEventListener(eventName, sync, { signal: controller.signal });
    }
    sync();

    return () => {
      controller.abort();
    };
  }, [video, sync]);

  const startSeek = useCallback(() => {
    scrubbingRef.current = true;
    setScrubbing(true);
  }, []);

  const seek = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(SEEK_RESOLUTION, value));
      setPosition(clamped);

      const duration = getSeekableDuration(video);
      if (duration <= 0) {
        return;
      }
      try {
        video.currentTime = (duration * clamped) / SEEK_RESOLUTION;
      } catch {
        // Ignora erro caso o buffer ainda não permita seek nesse offset
      }
    },
    [video],
  );

  const finishSeek = useCallback(() => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubbingRef.current = false;
    setScrubbing(false);
    sync();
  }, [sync]);

  const handleTogglePlay = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      try {
        if (video.paused) {
          void Promise.resolve(video.play()).catch(() => {});
        } else {
          video.pause();
        }
      } catch {
        // Ignora bloqueio de autoplay
      }
      sync();
    },
    [video, sync],
  );

  const handleToggleAudio = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const shouldEnable = video.muted || video.volume === 0;
      VideoExperience.enableAudio(video, shouldEnable);
      sync();
    },
    [video, sync],
  );

  const stopPropagation = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const displayedTime = scrubbing
    ? (playback.duration * position) / SEEK_RESOLUTION
    : playback.time;

  return (
    <div
      className={`rodx-video-transport ${styles.transport}`}
      data-rodx-player-control="1"
      aria-label="Controles de reprodução RodX"
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      onTouchEnd={stopPropagation}
      onPointerUp={stopPropagation}
    >
      <button
        type="button"
        title={playback.paused ? "Reproduzir" : "Pausar"}
        aria-label={playback.paused ? "Reproduzir" : "Pausar"}
        onClick={handleTogglePlay}
      >
        {playback.paused ? "▶" : "Ⅱ"}
      </button>

      <input
        className={`rodx-transport-seek ${styles.seek}`}
        type="range"
        min={0}
        max={SEEK_RESOLUTION}
        step={1}
        value={position}
        disabled={playback.duration <= 0}
        aria-label="Posição do vídeo"
        aria-valuetext={`${formatTime(displayedTime)} de ${formatTime(playback.duration)}`}
        data-rodx-player-control="1"
        onPointerDown={startSeek}
        onTouchStart={startSeek}
        onChange={(event) => seek(Number(event.currentTarget.value))}
        onPointerUp={finishSeek}
        onPointerCancel={finishSeek}
        onTouchEnd={finishSeek}
        onBlur={finishSeek}
      />

      <time className={styles.clock}>
        {formatTime(displayedTime)} / {formatTime(playback.duration)}
      </time>

      <button
        type="button"
        title={playback.muted ? "Ativar som" : "Silenciar vídeo"}
        aria-label={playback.muted ? "Ativar som" : "Silenciar vídeo"}
        aria-pressed={!playback.muted}
        onClick={handleToggleAudio}
      >
        {playback.muted ? <VolumeMutedIcon /> : <VolumeOnIcon />}
      </button>
    </div>
  );
};

// TODO: extract to state/video-transport-singleton.ts
export let VideoTransport: VideoTransportController;

export function initializeDeckVideoTransport(): VideoTransportController {
  const installed = new WeakMap<HTMLVideoElement, HTMLElement>();

  VideoTransport = Object.freeze({
    scan(): void {
      ensureTransportStyles();

      const videos = document.querySelectorAll<HTMLVideoElement>(
        NATIVE_X_SELECTORS.visiblePageVideos,
      );

      for (const video of videos) {
        if (
          installed.get(video)?.isConnected ||
          video.closest(RODX_SELECTORS.videoTransport)
        ) {
          continue;
        }

        const wrapper =
          video.closest<HTMLElement>(NATIVE_X_SELECTORS.legacyVideoPlayerWrappers) ||
          video.parentElement;

        if (!wrapper || wrapper.querySelector(RODX_SELECTORS.directVideoTransport)) {
          continue;
        }

        const rect = wrapper.getBoundingClientRect();
        if (
          rect.width > 0 &&
          (rect.width < MIN_WRAPPER_WIDTH || rect.height < MIN_WRAPPER_HEIGHT)
        ) {
          continue;
        }

        if (getComputedStyle(wrapper).position === "static") {
          wrapper.style.setProperty("position", "relative", "important");
        }

        const host = document.createElement("div");
        host.dataset.rodxTransportMount = "";
        wrapper.append(host);
        installed.set(video, host);

        mountView(host, () => <VideoControls video={video} />);
      }
    },
  });

  return VideoTransport;
}
