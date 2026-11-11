import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-media-seek-preview-1.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-media-seek-preview-1.css?inline";
export function createSeekPreviews(Studio, getOptions) {
  const entries = new Map(),
    sources = Studio.state.mediaSources || (Studio.state.mediaSources = new Map());
  let active = null,
    controller = null,
    decoder = null,
    serial = 0,
    timer = 0;
  const frameOrder = [];
  Studio.on("network:media", ({ items }) => {
    for (const item of items || []) {
      sources.set(item.id, item.media);
      if (sources.size > 160) sources.delete(sources.keys().next().value);
    }
  });
  function release() {
    serial++;
    controller?.abort();
    controller = null;
    clearTimeout(timer);
    if (decoder) {
      decoder.pause();
      decoder.removeAttribute("src");
      decoder.load();
      decoder.remove();
      decoder = null;
    }
    active = null;
  }
  function cleanup(video) {
    const item = entries.get(video);
    if (!item) return;
    item.abort.abort();
    for (const frame of item.frames.values()) URL.revokeObjectURL(frame.url);
    entries.delete(video);
    if (active === item) release();
  }
  function source(item) {
    const video = item.video,
      article = video.closest(CSS_SELECTORS.articles);
    const id = [...(article?.querySelectorAll(CSS_SELECTORS.statusLinks) || [])]
      .map((a) => a.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1])
      .find(Boolean);
    const index = article ? [...article.querySelectorAll(CSS_SELECTORS.videos)].indexOf(video) : 0;
    const media = sources.get(id)?.[index] || sources.get(id)?.[0];
    return (
      media?.url ||
      [
        /\.mp4(?:\?|$)/.test(video.currentSrc || "") ? video.currentSrc : "",
        video.querySelector(CSS_SELECTORS.mp4Sources)?.src,
      ].find(Boolean) ||
      ""
    );
  }
  function wait(target, type, signal, timeout = 6000) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Abortado", "AbortError"));
        return;
      }
      const end = (error) => {
        clearTimeout(t);
        target.removeEventListener(type, done);
        target.removeEventListener("error", fail);
        signal.removeEventListener("abort", abort);
        error ? reject(error) : resolve();
      };
      const done = () => end(),
        fail = () => end(Error("Prévia indisponível")),
        abort = () => end(new DOMException("Abortado", "AbortError"));
      const t = setTimeout(fail, timeout);
      target.addEventListener(type, done, {
        once: true,
      });
      target.addEventListener("error", fail, {
        once: true,
      });
      signal.addEventListener("abort", abort, {
        once: true,
      });
    });
  }
  function publish(item) {
    const list = [...item.frames.values()].sort((a, b) => a.startTime - b.startTime);
    item.thumbnail.thumbnails = list;
    item.thumbnail.requestUpdate?.();
    item.thumbnail.dataset.rodxPreview = list.length ? "frame" : "unavailable";
  }
  async function capture(item, time) {
    if (!getOptions().seekPreviews || !Number.isFinite(time) || item.failed) return;
    const step = Math.max(1, Number(getOptions().previewStepSeconds) || 5),
      bucket = Math.floor(time / step) * step;
    if (item.frames.has(bucket)) {
      publish(item);
      return;
    }
    const url = source(item);
    if (!url) {
      item.thumbnail.dataset.rodxPreview = "unavailable";
      item.thumbnail.title = "O X não forneceu uma fonte MP4 ou storyboard para a prévia.";
      return;
    }
    if (active !== item) {
      release();
      active = item;
      controller = new AbortController();
      decoder = document.createElement("video");
      decoder.crossOrigin = "anonymous";
      decoder.muted = true;
      decoder.playsInline = true;
      decoder.preload = "metadata";
      decoder.setAttribute("aria-hidden", "true");
      decoder.tabIndex = -1;
      decoder.style.cssText = cssDeclarations(inlineCSS1);
      decoder.src = url;
      document.body.append(decoder);
    }
    const sequence = ++serial,
      video = decoder,
      signal = controller.signal;
    try {
      item.thumbnail.dataset.rodxPreview = "loading";
      if (video.readyState < 1) {
        const ready = wait(video, "loadedmetadata", signal);
        video.load();
        await ready;
      }
      if (sequence !== serial || signal.aborted) return;
      const target = Math.max(0.01, Math.min(bucket, Math.max(0.01, video.duration - 0.1)));
      if (Math.abs(video.currentTime - target) > 0.05 || video.readyState < 2) {
        const seeked = wait(video, "seeked", signal);
        video.currentTime = target;
        await seeked;
      }
      if (sequence !== serial || signal.aborted) return;
      const width = 240,
        height = Math.max(1, Math.round((width * (video.videoHeight || 9)) / (video.videoWidth || 16)));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(video, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.65));
      if (!blob || sequence !== serial || signal.aborted) return;
      const frame = {
        startTime: bucket,
        endTime: bucket + step,
        url: URL.createObjectURL(blob),
        width,
        height,
      };
      item.frames.set(bucket, frame);
      frameOrder.push([item, bucket, frame.url]);
      while (frameOrder.length > 64) {
        const [owner, key, url] = frameOrder.shift();
        if (owner.frames.get(key)?.url === url) {
          owner.frames.delete(key);
          URL.revokeObjectURL(url);
          publish(owner);
        }
      }
      while (item.frames.size > 24) {
        const key = item.frames.keys().next().value;
        URL.revokeObjectURL(item.frames.get(key).url);
        item.frames.delete(key);
      }
      publish(item);
    } catch (error) {
      if (error.name !== "AbortError") {
        item.failed = true;
        item.thumbnail.dataset.rodxPreview = "unavailable";
        item.thumbnail.title = "Prévia indisponível: a fonte não permite decodificação/CORS.";
        release();
      }
    }
  }
  function attach(video, entry) {
    const skin = entry.skin,
      root = skin.shadowRoot;
    if (!root) return;
    let item = entries.get(video);
    if (item?.skin === skin) return;
    if (item) cleanup(video);
    const slider = root.querySelector(CSS_SELECTORS.mediaTimeSlider),
      thumbnail = root.querySelector(CSS_SELECTORS.mediaSliderThumbnail);
    if (!slider || !thumbnail) return;
    const style = document.createElement("style");
    style.dataset.rodxPlaybackStyle = "1";
    style.textContent = extractedCSS1;
    skin.toggleAttribute("data-rodx-no-dim", getOptions().videoPauseDim !== true);
    root.append(style);
    const abort = new AbortController();
    item = {
      video,
      skin,
      thumbnail,
      frames: new Map(),
      abort,
      failed: false,
    };
    entries.set(video, item);
    const schedule = (event) => {
      if (!getOptions().seekPreviews) return;
      const rect = slider.getBoundingClientRect();
      if (!rect.width || !Number.isFinite(video.duration)) return;
      const x = event.clientX ?? event.touches?.[0]?.clientX;
      if (!Number.isFinite(x)) return;
      const time = Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * video.duration;
      clearTimeout(timer);
      timer = setTimeout(() => void capture(item, time), 120);
    };
    slider.addEventListener("pointerdown", schedule, {
      passive: true,
      signal: abort.signal,
    });
    slider.addEventListener("pointermove", schedule, {
      passive: true,
      signal: abort.signal,
    });
    slider.addEventListener("touchmove", schedule, {
      passive: true,
      signal: abort.signal,
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave", "touchend"])
      slider.addEventListener(
        type,
        () => {
          clearTimeout(timer);
          if (active === item) release();
        },
        {
          passive: true,
          signal: abort.signal,
        },
      );
  }
  function scan() {
    for (const [video, item] of entries) {
      if (!video.isConnected) {
        cleanup(video);
        continue;
      }
      item.skin.toggleAttribute("data-rodx-no-dim", getOptions().videoPauseDim !== true);
      if (!getOptions().seekPreviews) {
        item.thumbnail.dataset.rodxPreview = "unavailable";
        if (active === item) release();
      }
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) release();
  });
  return {
    attach,
    cleanup,
    scan,
  };
}
