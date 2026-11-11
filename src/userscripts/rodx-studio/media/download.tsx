import { mountView } from "../ui/solid-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import DownloadSVGIcon from "../../../assets/icons/download.svg?component";
import { DOM_SELECTORS, NATIVE_X_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-media-download-1.css?inline";
export let ImmersiveDownload;

export function initializeDeckImmersiveDownload() {
  ImmersiveDownload = (() => {
    const TWR = "https://api.twirrl.app/video";
    const TWR_VERSION = "ab8222fb13a47e82c36032c4ddcc622dc0d33f0e8f852b5b420085b9fd32c94e";
    let button = null;
    let activeKey = "";
    let busy = false;
    let lastScan = 0;
    let styleAdded = false;
    const cache = new Map<any, any>();
    function request(args) {
      const gm =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
            ? GM.xmlHttpRequest.bind(GM)
            : null;
      if (!gm) return Promise.reject(new Error("Seu gerenciador não permite downloads HTTP via GM."));
      return new Promise<any>((resolve, reject) => {
        let complete = false;
        const success = (data) => {
          if (!complete) {
            complete = true;
            resolve(data);
          }
        };
        const fail = (why) => {
          if (!complete) {
            complete = true;
            reject(new Error(why));
          }
        };
        try {
          gm({
            ...args,
            onload: (response) =>
              Number(response.status) >= 200 && Number(response.status) < 300
                ? success(response)
                : fail(`Download HTTP ${response.status}.`),
            onerror: () => fail("A mídia não pôde ser baixada pela rede."),
            ontimeout: () => fail("Tempo de download excedido."),
            onabort: () => fail("Download cancelado."),
          });
        } catch (error) {
          fail(error.message || String(error));
        }
      });
    }
    function mediaUrl(value) {
      try {
        const url = new URL(String(value || "").replaceAll("&amp;", "&"));
        // The resolver is not trusted to return arbitrary off-domain URLs.
        if (url.protocol !== "https:" || !/^(?:video|pbs)\.twimg\.com$/i.test(url.hostname)) return "";
        if (!/\.mp4(?:$|\?)/i.test(url.href) && !/\/video\//i.test(url.pathname)) return "";
        return url.href;
      } catch {
        return "";
      }
    }
    function locate() {
      const layer = document.getElementById("layers");
      if (!layer) return null;
      const videos = [...layer.querySelectorAll<HTMLVideoElement>(DOM_SELECTORS.videos)];
      const visible = videos.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 100 &&
          rect.height > 90 &&
          style.visibility !== "hidden" &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          rect.left < innerWidth &&
          rect.right > 0
        );
      });
      if (!visible.length) return null;
      const isViewer = Boolean(layer.querySelector<HTMLElement>(NATIVE_X_SELECTORS.mediaViewerRoots()));
      const route = location.pathname.match(/\/status\/(\d{8,25})(?:\/|$)/);
      const isVideoRoute = /\/status\/\d+\/video\/\d+/.test(location.pathname);
      const nativePlayerInStatus = Boolean(
        route && layer.querySelector<HTMLVideoElement>(NATIVE_X_SELECTORS.playableVideoContainers()),
      );
      if (!isViewer && !isVideoRoute && !nativePlayerInStatus) return null;
      const video = visible.sort((a, b) => {
        const ra = a.getBoundingClientRect(),
          rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      })[0];
      const related = video.closest(NATIVE_X_SELECTORS.tweetOrDialogContainers) || layer;
      const link =
        related.querySelector<HTMLElement>(NATIVE_X_SELECTORS.statusLinks) ||
        layer.querySelector<HTMLElement>(NATIVE_X_SELECTORS.statusLinks);
      const id = route?.[1] || link?.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1] || "";
      if (!id) return null;
      const owner =
        link?.getAttribute("href")?.match(/^\/([a-zA-Z0-9_]{1,15})\/status\//)?.[1] ||
        location.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\//)?.[1];
      const author = owner && !["i", "web"].includes(owner) ? owner : "i";
      const url = `https://x.com/${author === "i" ? "i" : author}/status/${id}`;
      const videoIndex = Math.max(0, Number(location.pathname.match(/\/video\/(\d+)/)?.[1] || 1) - 1);
      return {
        layer,
        video,
        id,
        url,
        videoIndex,
        key: `${id}:${videoIndex}`,
      };
    }
    function setLabel(title) {
      if (!button) return;
      mountView(button, () => (
        <>
          {<DownloadSVGIcon />}
          <span>{title}</span>
        </>
      ));
      button.title = title;
      button.setAttribute("aria-label", title);
      button.disabled = busy;
    }
    function style() {
      if (styleAdded) return;
      const css = (<style />) as HTMLStyleElement;
      css.id = "rodx-immersive-download-css";
      css.textContent = extractedCSS1;
      (document.head || document.documentElement).append(css);
      styleAdded = true;
    }
    async function resolveMP4(viewer) {
      const current = mediaUrl(viewer.video.currentSrc || viewer.video.src);
      if (current) return current;
      const cached = cache.get(viewer.key);
      if (cached && Date.now() - cached.at < 600_000) return cached.url;
      setLabel("Obtendo vídeo…");
      // Same public Twitter resolver contract used by AIO Downloader v4.3.9.
      const response = await request({
        url: TWR,
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
      let data;
      try {
        data = JSON.parse(String(response.responseText || response.response || "{}"));
      } catch {
        throw new Error("Resolver retornou resposta inválida.");
      }
      const groups = Array.isArray(data?.d?.i) ? data.d.i : [];
      const candidates = groups.map((group, index) => ({
        index,
        links: Object.values(group || {})
          .map((item) => mediaUrl((item as { u?: string })?.u || ""))
          .filter(Boolean)
          .filter((url) => /\.mp4(?:$|\?)/i.test(url)),
      }));
      let item = candidates.find((x) => x.index === viewer.videoIndex && x.links.length);
      if (!item && viewer.videoIndex === 0) item = candidates.find((x) => x.links.length);
      if (!item) throw new Error("Não encontrei um MP4 que corresponda ao vídeo selecionado.");
      const rank = (url) => {
        const match = url.match(/\/vid\/(\d+)x(\d+)\//i);
        return match ? Number(match[1]) * Number(match[2]) : 0;
      };
      const best = item.links.sort((a, b) => rank(b) - rank(a))[0];
      cache.set(viewer.key, {
        url: best,
        at: Date.now(),
      });
      if (cache.size > 100) cache.delete(cache.keys().next().value);
      return best;
    }
    async function download(url, filename) {
      const gmd =
        typeof GM_download === "function"
          ? GM_download
          : typeof GM !== "undefined" && typeof GM.download === "function"
            ? GM.download.bind(GM)
            : null;
      if (gmd) {
        try {
          await new Promise<any>((resolve, reject) => {
            let settled = false;
            const okay = () => {
              if (!settled) {
                settled = true;
                resolve(undefined);
              }
            };
            const fail = (error) => {
              if (!settled) {
                settled = true;
                reject(new Error(error?.error || error?.message || "GM_download não disponível."));
              }
            };
            const value = gmd({
              url,
              name: filename,
              saveAs: false,
              onload: okay,
              onerror: fail,
              ontimeout: fail,
            });
            if (value && typeof value.then === "function") value.then(okay, fail);
          });
          return;
        } catch (error) {
          console.warn("[RodX Download] GM_download falhou. Tentando blob:", error);
        }
      }
      // Browser-compatible fallback. Mobile Safari may open a video preview
      // instead of Files; use the Share sheet to save it when that happens.
      setLabel("Baixando…");
      try {
        const response = await request({
          url,
          method: "GET",
          responseType: "blob",
          timeout: RUNTIME_LIMITS.mediaDownload.downloadTimeout,
          onprogress: (e) => {
            if (e.lengthComputable && e.total) {
              setLabel(`${Math.max(1, Math.min(99, Math.round((e.loaded / e.total) * 100)))}%`);
            }
          },
        });
        let blob = response.response;
        if (!(blob instanceof Blob) && response.response instanceof ArrayBuffer) {
          blob = new Blob([response.response], {
            type: "video/mp4",
          });
        }
        if (!(blob instanceof Blob) || !blob.size) throw new Error("Resposta de mídia vazia.");
        const objectUrl = URL.createObjectURL(blob);
        const anchor = (<a />) as HTMLAnchorElement;
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.setProperty("display", "none", "important");
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), RUNTIME_LIMITS.mediaDownload.downloadDelayMs);
      } catch (error) {
        // A visible link lets Safari users save through the iOS Share menu,
        // rather than pretending the content was downloaded.
        const choice = window.confirm(`${error.message}\nAbrir MP4 em uma aba para salvar pelo Safari?`);
        if (choice) {
          const tab = window.open(url, "_blank", "noopener,noreferrer");
          if (!tab) throw new Error("Safari bloqueou a nova aba. Abra o link MP4 a partir do X.");
          return "opened";
        }
        throw error;
      }
    }
    async function click(event) {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      const current = locate();
      if (!current) return;
      busy = true;
      setLabel("Preparando…");
      try {
        const url = await resolveMP4(current);
        const now = locate();
        if (!now || now.key !== current.key) throw new Error("O vídeo aberto mudou durante a preparação.");
        const outcome = await download(url, `X-${current.id}-${current.videoIndex + 1}.mp4`);
        setLabel(outcome === "opened" ? "MP4 aberto" : "Baixado ✓");
        await new Promise<any>((resolve) => setTimeout(resolve, RUNTIME_LIMITS.mediaDownload.resolveDelayMs));
      } catch (error) {
        console.warn("[RodX Download]", error);
        setLabel("Não baixou");
        window.alert(`RodX Download: ${error.message || error}`);
      } finally {
        busy = false;
        setLabel("Download");
      }
    }
    function scan(force = false) {
      const now = Date.now();
      if (!force && now - lastScan < 500) return;
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
      style();
      if (!button || !button.isConnected || button.parentElement !== viewer.layer) {
        button?.remove();
        button = (<button />) as HTMLButtonElement;
        button.type = "button";
        button.id = "rodx-immersive-download";
        button.addEventListener("click", (event) => {
          void click(event);
        });
        viewer.layer.append(button);
        setLabel("Download");
      }
      if (activeKey !== viewer.key) {
        activeKey = viewer.key;
        if (!busy) setLabel("Download");
      }
    }
    return Object.freeze({
      scan,
      current: locate,
    });
  })();
}
