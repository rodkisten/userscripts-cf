import React from "react";
import { mountView } from "../ui/runtime.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import DownloadSVGIcon from "../../../assets/icons/download.svg?component";
import { DOM_SELECTORS, NATIVE_X_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-media-download-1.css?inline";

// TODO: extract to types/immersive-download.ts
export interface LocatedVideoViewer {
  layer: HTMLElement;
  video: HTMLVideoElement;
  id: string;
  url: string;
  videoIndex: number;
  key: string;
}

// TODO: extract to types/immersive-download.ts
export interface ImmersiveDownloadController {
  scan: (force?: boolean) => void;
  current: () => LocatedVideoViewer | null;
}

interface CacheEntry {
  url: string;
  at: number;
}

interface TwirrlMediaVariant {
  u?: string;
}

interface TwirrlResponse {
  d?: {
    i?: Array<Record<string, TwirrlMediaVariant>>;
  };
}

// TODO: extract to constants/media-download.ts
const TWR_ENDPOINT = "https://api.twirrl.app/video";
const TWR_VERSION = "ab8222fb13a47e82c36032c4ddcc622dc0d33f0e8f852b5b420085b9fd32c94e";
const STYLE_ELEMENT_ID = "rodx-immersive-download-css";
const BUTTON_ELEMENT_ID = "rodx-immersive-download";
const CACHE_TTL_MS = 600_000;
const CACHE_MAX_ENTRIES = 100;
const SCAN_THROTTLE_MS = 500;

declare const GM_xmlhttpRequest:
  | ((details: Record<string, unknown>) => unknown)
  | undefined;
declare const GM_download:
  | ((details: Record<string, unknown>) => Promise<void> | void)
  | undefined;
declare const GM:
  | {
      xmlHttpRequest?: (details: Record<string, unknown>) => unknown;
      download?: (details: Record<string, unknown>) => Promise<void> | void;
    }
  | undefined;

// TODO: extract to utils/errors.ts
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

// TODO: extract to utils/gm-network.ts
function gmRequest<T = unknown>(args: {
  url: string;
  method: "GET" | "POST";
  timeout?: number;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "text" | "blob" | "arraybuffer" | "json";
  onprogress?: (event: ProgressEvent) => void;
}): Promise<{ status: number; response: T; responseText?: string }> {
  const gm =
    typeof GM_xmlhttpRequest === "function"
      ? GM_xmlhttpRequest
      : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
        ? GM.xmlHttpRequest.bind(GM)
        : null;

  if (!gm) {
    return Promise.reject(new Error("Seu gerenciador não permite downloads HTTP via GM."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const finishSuccess = (data: { status: number; response: T; responseText?: string }) => {
      if (!settled) {
        settled = true;
        resolve(data);
      }
    };

    const finishError = (reason: string) => {
      if (!settled) {
        settled = true;
        reject(new Error(reason));
      }
    };

    try {
      gm({
        ...args,
        onload: (response: { status?: number; response: T; responseText?: string }) => {
          const status = Number(response.status);
          if (status >= 200 && status < 300) {
            finishSuccess({
              status,
              response: response.response,
              responseText: response.responseText,
            });
          } else {
            finishError(`Download HTTP ${status}.`);
          }
        },
        onerror: () => finishError("A mídia não pôde ser baixada pela rede."),
        ontimeout: () => finishError("Tempo de download excedido."),
        onabort: () => finishError("Download cancelado."),
      });
    } catch (error) {
      finishError(getErrorMessage(error));
    }
  });
}

// TODO: extract to utils/media-url.ts
function sanitizeMediaUrl(value: unknown): string {
  try {
    const url = new URL(String(value || "").replaceAll("&amp;", "&"));
    // The resolver is not trusted to return arbitrary off-domain URLs.
    if (url.protocol !== "https:" || !/^(?:video|pbs)\.twimg\.com$/i.test(url.hostname)) {
      return "";
    }
    if (!/\.mp4(?:$|\?)/i.test(url.href) && !/\/video\//i.test(url.pathname)) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function rankResolution(url: string): number {
  const match = url.match(/\/vid\/(\d+)x(\d+)\//i);
  return match ? Number(match[1]) * Number(match[2]) : 0;
}

// TODO: extract to components/DownloadButtonContent.tsx
const DownloadButtonContent: React.FC<{ label: string }> = ({ label }) => (
  <>
    <DownloadSVGIcon />
    <span>{label}</span>
  </>
);

export let ImmersiveDownload: ImmersiveDownloadController;

export function initializeDeckImmersiveDownload(): ImmersiveDownloadController {
  ImmersiveDownload = (() => {
    let button: HTMLButtonElement | null = null;
    let activeKey = "";
    let busy = false;
    let lastScan = 0;
    const cache = new Map<string, CacheEntry>();

    function ensureStyle(): void {
      if (document.getElementById(STYLE_ELEMENT_ID)) {
        return;
      }
      const css = document.createElement("style");
      css.id = STYLE_ELEMENT_ID;
      css.textContent = extractedCSS1;
      (document.head || document.documentElement).append(css);
    }

    function setLabel(title: string): void {
      if (!button) {
        return;
      }
      mountView(button, () => <DownloadButtonContent label={title} />);
      button.title = title;
      button.setAttribute("aria-label", title);
      button.disabled = busy;
    }

    function locate(): LocatedVideoViewer | null {
      const layer = document.getElementById("layers");
      if (!layer) {
        return null;
      }

      const videos = Array.from(layer.querySelectorAll<HTMLVideoElement>(DOM_SELECTORS.videos));
      const visible = videos.filter((element) => {
        const rect = element.getBoundingClientRect();
        const computed = getComputedStyle(element);
        return (
          rect.width > 100 &&
          rect.height > 90 &&
          computed.visibility !== "hidden" &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          rect.left < innerWidth &&
          rect.right > 0
        );
      });

      if (!visible.length) {
        return null;
      }

      const isViewer = Boolean(
        layer.querySelector<HTMLElement>(NATIVE_X_SELECTORS.mediaViewerRoots()),
      );
      const route = location.pathname.match(/\/status\/(\d{8,25})(?:\/|$)/);
      const isVideoRoute = /\/status\/\d+\/video\/\d+/.test(location.pathname);
      const nativePlayerInStatus = Boolean(
        route && layer.querySelector<HTMLVideoElement>(NATIVE_X_SELECTORS.playableVideoContainers()),
      );

      if (!isViewer && !isVideoRoute && !nativePlayerInStatus) {
        return null;
      }

      const video = visible.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      })[0];

      const related = video.closest(NATIVE_X_SELECTORS.tweetOrDialogContainers) || layer;
      const link =
        related.querySelector<HTMLElement>(NATIVE_X_SELECTORS.statusLinks) ||
        layer.querySelector<HTMLElement>(NATIVE_X_SELECTORS.statusLinks);

      const id =
        route?.[1] || link?.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1] || "";
      if (!id) {
        return null;
      }

      const owner =
        link?.getAttribute("href")?.match(/^\/([a-zA-Z0-9_]{1,15})\/status\//)?.[1] ||
        location.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\//)?.[1];
      const author = owner && !["i", "web"].includes(owner) ? owner : "i";
      const url = `https://x.com/${author}/status/${id}`;
      const videoIndex = Math.max(
        0,
        Number(location.pathname.match(/\/video\/(\d+)/)?.[1] || 1) - 1,
      );

      return {
        layer,
        video,
        id,
        url,
        videoIndex,
        key: `${id}:${videoIndex}`,
      };
    }

    function readCache(key: string): string | null {
      const cached = cache.get(key);
      if (!cached) return null;

      if (Date.now() - cached.at >= CACHE_TTL_MS) {
        cache.delete(key);
        return null;
      }

      // Promove item acessado recentemente (LRU)
      cache.delete(key);
      cache.set(key, cached);
      return cached.url;
    }

    function writeCache(key: string, url: string): void {
      cache.delete(key);
      cache.set(key, { url, at: Date.now() });

      if (cache.size > CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
          cache.delete(oldestKey);
        }
      }
    }

    async function resolveMP4(viewer: LocatedVideoViewer): Promise<string> {
      const directUrl = sanitizeMediaUrl(viewer.video.currentSrc || viewer.video.src);
      if (directUrl) {
        return directUrl;
      }

      const cachedUrl = readCache(viewer.key);
      if (cachedUrl) {
        return cachedUrl;
      }

      setLabel("Obtendo vídeo…");

      // Same public Twitter resolver contract used by AIO Downloader v4.3.9.
      const response = await gmRequest<string>({
        url: TWR_ENDPOINT,
        method: "POST",
        timeout: RUNTIME_LIMITS.mediaDownload.resolveMP4Timeout,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        data: JSON.stringify({
          u: viewer.url,
          o: "iOS",
          v: TWR_VERSION,
        }),
        responseType: "text",
      });

      let data: TwirrlResponse;
      try {
        data = JSON.parse(String(response.responseText || response.response || "{}"));
      } catch {
        throw new Error("Resolver retornou resposta inválida.");
      }

      const groups = Array.isArray(data?.d?.i) ? data.d.i : [];
      const candidates = groups.map((group, index) => ({
        index,
        links: Object.values(group || {})
          .map((item) => sanitizeMediaUrl(item?.u || ""))
          .filter((url) => Boolean(url) && /\.mp4(?:$|\?)/i.test(url)),
      }));

      let matched = candidates.find((x) => x.index === viewer.videoIndex && x.links.length > 0);
      if (!matched && viewer.videoIndex === 0) {
        matched = candidates.find((x) => x.links.length > 0);
      }

      if (!matched) {
        throw new Error("Não encontrei um MP4 que corresponda ao vídeo selecionado.");
      }

      const bestUrl = matched.links.sort((a, b) => rankResolution(b) - rankResolution(a))[0];
      writeCache(viewer.key, bestUrl);
      return bestUrl;
    }

    async function downloadViaGM(url: string, filename: string): Promise<boolean> {
      const gmd =
        typeof GM_download === "function"
          ? GM_download
          : typeof GM !== "undefined" && typeof GM.download === "function"
            ? GM.download.bind(GM)
            : null;

      if (!gmd) {
        return false;
      }

      try {
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const onSuccess = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };
          const onFail = (error: unknown) => {
            if (!settled) {
              settled = true;
              const reason =
                error && typeof error === "object" && "error" in error
                  ? String((error as { error: unknown }).error)
                  : getErrorMessage(error) || "GM_download não disponível.";
              reject(new Error(reason));
            }
          };

          const result = gmd({
            url,
            name: filename,
            saveAs: false,
            onload: onSuccess,
            onerror: onFail,
            ontimeout: onFail,
          });

          if (result && typeof result.then === "function") {
            result.then(onSuccess, onFail);
          }
        });
        return true;
      } catch (error) {
        console.warn("[RodX Download] GM_download falhou. Tentando blob:", error);
        return false;
      }
    }

    async function downloadMedia(url: string, filename: string): Promise<"downloaded" | "opened"> {
      if (await downloadViaGM(url, filename)) {
        return "downloaded";
      }

      // Browser-compatible fallback. Mobile Safari may open a video preview
      // instead of Files; use the Share sheet to save it when that happens.
      setLabel("Baixando…");

      try {
        const response = await gmRequest<Blob | ArrayBuffer>({
          url,
          method: "GET",
          responseType: "blob",
          timeout: RUNTIME_LIMITS.mediaDownload.downloadTimeout,
          onprogress: (e) => {
            if (e.lengthComputable && e.total > 0) {
              const pct = Math.max(1, Math.min(99, Math.round((e.loaded / e.total) * 100)));
              setLabel(`${pct}%`);
            }
          },
        });

        let blob = response.response;
        if (!(blob instanceof Blob) && blob instanceof ArrayBuffer) {
          blob = new Blob([blob], { type: "video/mp4" });
        }

        if (!(blob instanceof Blob) || blob.size === 0) {
          throw new Error("Resposta de mídia vazia.");
        }

        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.setProperty("display", "none", "important");
        document.body.append(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, RUNTIME_LIMITS.mediaDownload.downloadDelayMs);

        return "downloaded";
      } catch (error) {
        // A visible link lets Safari users save through the iOS Share menu,
        // rather than pretending the content was downloaded.
        const message = getErrorMessage(error);
        const shouldOpen = window.confirm(
          `${message}\nAbrir MP4 em uma aba para salvar pelo Safari?`,
        );

        if (shouldOpen) {
          const tab = window.open(url, "_blank", "noopener,noreferrer");
          if (!tab) {
            throw new Error("Safari bloqueou a nova aba. Abra o link MP4 a partir do X.");
          }
          return "opened";
        }

        throw error;
      }
    }

    async function handleButtonClick(event: MouseEvent): Promise<void> {
      event.preventDefault();
      event.stopPropagation();

      if (busy) {
        return;
      }

      const current = locate();
      if (!current) {
        return;
      }

      busy = true;
      setLabel("Preparando…");

      try {
        const mp4Url = await resolveMP4(current);
        const stillSameViewer = locate();
        if (!stillSameViewer || stillSameViewer.key !== current.key) {
          throw new Error("O vídeo aberto mudou durante a preparação.");
        }

        const outcome = await downloadMedia(
          mp4Url,
          `X-${current.id}-${current.videoIndex + 1}.mp4`,
        );
        setLabel(outcome === "opened" ? "MP4 aberto" : "Baixado ✓");

        await new Promise<void>((resolve) =>
          setTimeout(resolve, RUNTIME_LIMITS.mediaDownload.resolveDelayMs),
        );
      } catch (error) {
        console.warn("[RodX Download]", error);
        setLabel("Não baixou");
        window.alert(`RodX Download: ${getErrorMessage(error)}`);
      } finally {
        busy = false;
        setLabel("Download");
      }
    }

    function scan(force = false): void {
      const now = Date.now();
      if (!force && now - lastScan < SCAN_THROTTLE_MS) {
        return;
      }
      lastScan = now;

      const viewer = locate();
      if (!viewer) {
        if (button) {
          button.remove();
          button = null;
        }
        activeKey = "";
        return;
      }

      ensureStyle();

      if (!button || !button.isConnected || button.parentElement !== viewer.layer) {
        button?.remove();
        button = document.createElement("button");
        button.type = "button";
        button.id = BUTTON_ELEMENT_ID;
        button.addEventListener("click", (event) => {
          void handleButtonClick(event);
        });
        viewer.layer.append(button);
        setLabel("Download");
      }

      if (activeKey !== viewer.key) {
        activeKey = viewer.key;
        if (!busy) {
          setLabel("Download");
        }
      }
    }

    return Object.freeze({
      scan,
      current: locate,
    });
  })();

  return ImmersiveDownload;
}
