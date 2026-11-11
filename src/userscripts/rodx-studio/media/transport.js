import { NATIVE_X_SELECTORS, RODX_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-media-transport-1.css?inline";
import { VideoExperience } from "./experience.js";

export let VideoTransport;

export function initializeDeckVideoTransport() {
  VideoTransport = (() => {
    const installed = new WeakSet();
    const clocks = new WeakMap();
    let styled = false;
    function styleOnce() {
      if (styled) return;
      styled = true;
      const css = document.createElement("style");
      css.id = "rodx-video-transport-css";
      css.textContent = extractedCSS1;
      (document.head || document.documentElement).append(css);
    }
    const format = (n) => {
      if (!Number.isFinite(n)) return "0:00";
      const total = Math.max(0, Math.floor(n));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    };
    function attach(video) {
      if (installed.has(video)) return;
      const wrapper = video.closest(NATIVE_X_SELECTORS.legacyVideoPlayerWrappers) || video.parentElement;
      if (
        !wrapper ||
        wrapper.closest(RODX_SELECTORS.videoTransport) ||
        wrapper.querySelector(RODX_SELECTORS.directVideoTransport)
      )
        return;
      const parentRect = wrapper.getBoundingClientRect();
      if (parentRect.width && (parentRect.width < 135 || parentRect.height < 90)) return;
      styleOnce();
      installed.add(video);
      if (getComputedStyle(wrapper).position === "static")
        wrapper.style.setProperty("position", "relative", "important");
      const bar = document.createElement("div");
      bar.className = "rodx-video-transport";
      bar.setAttribute("data-rodx-player-control", "1");
      bar.setAttribute("aria-label", "Controles de reprodução RodX");
      const play = document.createElement("button");
      play.type = "button";
      play.textContent = "▶";
      play.title = "Reproduzir / pausar";
      play.setAttribute("aria-label", "Reproduzir / pausar");
      const scrub = document.createElement("input");
      scrub.type = "range";
      scrub.min = "0";
      scrub.max = "1000";
      scrub.step = "1";
      scrub.value = "0";
      scrub.className = "rodx-transport-seek";
      scrub.setAttribute("aria-label", "Posição do vídeo");
      scrub.setAttribute("data-rodx-player-control", "1");
      const clock = document.createElement("time");
      clock.textContent = "0:00";
      const volume = document.createElement("button");
      volume.type = "button";
      const soundIcon = (muted) =>
        muted
          ? '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>'
          : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
      volume.innerHTML = soundIcon(true);
      volume.title = "Ativar / desativar som";
      volume.setAttribute("aria-label", "Ativar / desativar volume");
      bar.append(play, scrub, clock, volume);
      // Prevent X's delegated tweet/video click from opening the immersive view.
      for (const name of ["click", "dblclick", "touchend", "pointerup"]) {
        bar.addEventListener(name, (event) => event.stopPropagation());
      }
      let scrubbing = false;
      const duration = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
        try {
          if (video.seekable.length) return video.seekable.end(video.seekable.length - 1);
        } catch (_) {
          /* Stream may not expose seekable yet. */
        }
        return 0;
      };
      const update = () => {
        if (!bar.isConnected) return;
        const d = duration(),
          t = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        if (!scrubbing) scrub.value = d ? String(Math.round((t / d) * 1000)) : "0";
        scrub.disabled = !d;
        clock.textContent = `${format(t)} / ${format(d)}`;
        play.textContent = video.paused ? "▶" : "Ⅱ";
        const muted = video.muted || video.volume === 0;
        volume.innerHTML = soundIcon(muted);
        volume.title = muted ? "Ativar som" : "Silenciar vídeo";
        volume.setAttribute("aria-label", volume.title);
        volume.setAttribute("aria-pressed", String(!muted));
      };
      const seek = () => {
        const d = duration();
        if (!d) return;
        const desired = (d * Number(scrub.value)) / 1000;
        try {
          video.currentTime = desired;
        } catch (_) {
          /* Unseekable stream. */
        }
        clock.textContent = `${format(desired)} / ${format(d)}`;
      };
      play.addEventListener("click", (event) => {
        event.preventDefault();
        try {
          video.paused ? Promise.resolve(video.play()).catch(() => {}) : video.pause();
        } catch (_) {
          /* Browser autoplay policy. */
        }
        update();
      });
      volume.addEventListener("click", (event) => {
        event.preventDefault();
        VideoExperience.enableAudio(video, video.muted || video.volume === 0);
        update();
      });
      scrub.addEventListener("pointerdown", () => {
        scrubbing = true;
      });
      scrub.addEventListener(
        "touchstart",
        () => {
          scrubbing = true;
        },
        {
          passive: true,
        },
      );
      scrub.addEventListener("input", seek);
      for (const name of ["pointerup", "touchend", "change", "blur"]) {
        scrub.addEventListener(name, () => {
          seek();
          scrubbing = false;
          update();
        });
      }
      for (const name of [
        "timeupdate",
        "durationchange",
        "loadedmetadata",
        "play",
        "pause",
        "volumechange",
        "seeking",
        "seeked",
      ]) {
        video.addEventListener(name, update);
      }
      clocks.set(video, update);
      wrapper.append(bar);
      update();
    }
    function scan() {
      for (const video of document.querySelectorAll(NATIVE_X_SELECTORS.visiblePageVideos)) {
        if (video.closest(RODX_SELECTORS.videoTransport)) continue;
        attach(video);
        clocks.get(video)?.();
      }
    }
    return {
      scan,
    };
  })();
}
