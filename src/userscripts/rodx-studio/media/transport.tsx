import { createSignal, createStore, onSettled } from "solid-js";
import { mountView } from "../ui/solid-mount.tsx";
import VolumeMutedIcon from "../../../assets/icons/volume-muted.svg?component";
import VolumeOnIcon from "../../../assets/icons/volume-on.svg?component";
import { NATIVE_X_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import transportCSS from "../../../styles/extracted/userscripts-rodx-studio-media-transport-1.css?inline";
import styles, { css } from "./Transport.module.css";
import { VideoExperience } from "./experience.js";

const formatTime = (value: number) => {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
function seekableDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  try {
    if (video.seekable.length) return video.seekable.end(video.seekable.length - 1);
  } catch {}
  return 0;
}
export function VideoControls(props: { video: HTMLVideoElement }) {
  const [playback, setPlayback] = createStore({ duration: 0, time: 0, paused: true, muted: true });
  const [scrubbing, setScrubbing] = createSignal(false);
  const [position, setPosition] = createSignal(0);
  const sync = () => {
    const video = props.video;
    const duration = seekableDuration(video);
    const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    setPlayback((draft) => {
      draft.duration = duration;
      draft.time = time;
      draft.paused = video.paused;
      draft.muted = video.muted || video.volume === 0;
    });
    if (!scrubbing()) setPosition(duration ? Math.round((time / duration) * 1000) : 0);
  };
  onSettled(() => {
    const events = [
      "timeupdate",
      "durationchange",
      "loadedmetadata",
      "play",
      "pause",
      "volumechange",
      "seeking",
      "seeked",
    ];
    events.forEach((name) => props.video.addEventListener(name, sync));
    sync();
    return () => events.forEach((name) => props.video.removeEventListener(name, sync));
  });
  const seek = (value: number) => {
    const duration = seekableDuration(props.video);
    setPosition(value);
    if (!duration) return;
    try {
      props.video.currentTime = (duration * value) / 1000;
    } catch {}
  };
  const finishSeek = () => {
    setScrubbing(false);
    sync();
  };
  const stop = (event: Event) => event.stopPropagation();
  return (
    <>
      <style textContent={transportCSS + css} />
      <div
        class={`rodx-video-transport ${styles.transport}`}
        data-rodx-player-control="1"
        aria-label="Controles de reprodução RodX"
        onClick={stop}
        onDblClick={stop}
        onTouchEnd={stop}
        onPointerUp={stop}
      >
        <button
          type="button"
          title="Reproduzir / pausar"
          aria-label="Reproduzir / pausar"
          onClick={(event) => {
            event.preventDefault();
            try {
              props.video.paused ? Promise.resolve(props.video.play()).catch(() => {}) : props.video.pause();
            } catch {}
            sync();
          }}
        >
          {playback.paused ? "▶" : "Ⅱ"}
        </button>
        <input
          class={`rodx-transport-seek ${styles.seek}`}
          type="range"
          min="0"
          max="1000"
          step="1"
          value={position()}
          disabled={!playback.duration}
          aria-label="Posição do vídeo"
          data-rodx-player-control="1"
          onPointerDown={() => setScrubbing(true)}
          onTouchStart={() => setScrubbing(true)}
          onInput={(event) => seek(Number(event.currentTarget.value))}
          onPointerUp={finishSeek}
          onTouchEnd={finishSeek}
          onChange={finishSeek}
          onBlur={finishSeek}
        />
        <time class={styles.clock}>
          {formatTime(scrubbing() ? (playback.duration * position()) / 1000 : playback.time)} /{" "}
          {formatTime(playback.duration)}
        </time>
        <button
          type="button"
          title={playback.muted ? "Ativar som" : "Silenciar vídeo"}
          aria-label={playback.muted ? "Ativar som" : "Silenciar vídeo"}
          aria-pressed={!playback.muted ? "true" : "false"}
          onClick={(event) => {
            event.preventDefault();
            VideoExperience.enableAudio(props.video, props.video.muted || props.video.volume === 0);
            sync();
          }}
        >
          {playback.muted ? <VolumeMutedIcon /> : <VolumeOnIcon />}
        </button>
      </div>
    </>
  );
}

export let VideoTransport: { scan: () => void };
export function initializeDeckVideoTransport() {
  const installed = new WeakMap<HTMLVideoElement, HTMLElement>();
  VideoTransport = {
    scan() {
      for (const video of document.querySelectorAll<HTMLVideoElement>(NATIVE_X_SELECTORS.visiblePageVideos)) {
        if (installed.get(video)?.isConnected || video.closest(RODX_SELECTORS.videoTransport)) continue;
        const wrapper =
          video.closest<HTMLElement>(NATIVE_X_SELECTORS.legacyVideoPlayerWrappers) || video.parentElement;
        if (!wrapper || wrapper.querySelector(RODX_SELECTORS.directVideoTransport)) continue;
        const rect = wrapper.getBoundingClientRect();
        if (rect.width && (rect.width < 135 || rect.height < 90)) continue;
        if (getComputedStyle(wrapper).position === "static")
          wrapper.style.setProperty("position", "relative", "important");
        const host = (<div data-rodx-transport-mount="" />) as HTMLElement;
        wrapper.append(host);
        installed.set(video, host);
        mountView(host, () => <VideoControls video={video} />);
      }
    },
  };
}
