import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { SoundgasmApp, StudioFailure, type SoundgasmData } from "./components/SoundgasmApp.tsx";
import { readNativeMedia, readRecordings } from "./services.ts";
import { safeURL } from "./domain.ts";
import styles, { css } from "./Soundgasm.module.css";
class SoundgasmBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("[GoneWildStudio] React render failed", error);
    this.props.onFailure();
  }
  render() {
    if (this.state.failed) return <StudioFailure retry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
export async function mountSoundgasm(ctx: any, bridge: any) {
  // External bridge data is optional. Never block the Soundgasm UI indefinitely.
  // Bound the wait and continue using native page metadata on failure.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const context = await Promise.race([
    Promise.resolve()
      .then(() => (typeof bridge?.readLocation === "function" ? bridge.readLocation() : null))
      .catch((error: unknown) => {
        console.warn("[GoneWildStudio] Optional Soundgasm context unavailable", error);
        return null;
      }),
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), 1500);
    }),
  ]).finally(() => clearTimeout(timeout));
  if (ctx.signal.aborted) return;
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "u") return;
  if (parts.length === 2 && !readRecordings().length) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        observer.disconnect();
        clearTimeout(timer);
        ctx.signal.removeEventListener("abort", finish);
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (readRecordings().length) finish();
      });
      const timer = setTimeout(finish, 6000);
      observer.observe(document.body, { childList: true, subtree: true });
      ctx.signal.addEventListener("abort", finish, { once: true });
    });
    if (ctx.signal.aborted) return;
  }
  const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() || "";
  // Snapshot native metadata before hiding the site's layout; never query our own h1/audio.
  const title =
    context?.title ||
    text(".jp-audio .jp-title li, .jp-audio .jp-title, .jp-title, h1") ||
    decodeURIComponent(parts.at(-1) || "");
  const description = context?.description || text(".jp-audio .jp-description, .jp-description");
  const author = decodeURIComponent(parts[1] || "");
  let originalLink: { path: string; href: string; at: number } | null = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(`gws:source:${author.toLowerCase()}`) || "null");
    if (saved && Date.now() - saved.at < 86400000) originalLink = saved;
  } catch {}
  const recordings = readRecordings().map((recording) => {
    const url = new URL(recording.href);
    if (context?.subreddit) url.searchParams.set("subreddit", context.subreddit);
    const saved = safeURL(originalLink?.href || "");
    return {
      ...recording,
      href: originalLink?.path === url.pathname && saved?.origin === location.origin ? saved.href : url.href,
    };
  });
  if (parts.length > 2)
    try {
      sessionStorage.setItem(
        `gws:source:${author.toLowerCase()}`,
        JSON.stringify({ path: location.pathname, href: location.href, at: Date.now() }),
      );
    } catch {}
  let data: SoundgasmData = {
    title,
    description,
    author: decodeURIComponent(parts[1] || ""),
    subreddit: context?.subreddit || "",
    permalink: bridge.safeReddit(context?.permalink),
    source: readNativeMedia(),
    profile: parts.length === 2,
    recordings,
  };
  if (data.profile && !data.recordings.length) return; // Keep native empty/unknown profiles usable.
  ctx.pageStyle(css);
  // Never blank the host page while Safari hydrates jPlayer or Solid.
  // The native Soundgasm player remains available as a guaranteed fallback.
  const native = (show: boolean) => {
    // Keep the original jPlayer available until the enhanced view has rendered
    // AND the media URL is known. Switch only after both conditions hold.
    document.body.classList.toggle(styles["gws-sg-enhanced"], !show);
  };
  let failed = false;
  const host = document.createElement("div");
  host.id = "gws-sg-root";
  host.dataset.reactMount = "true";
  document.body.append(host);
  const root = createRoot(host);
  const render = () =>
    root.render(
      <SoundgasmBoundary
        onFailure={() => {
          failed = true;
          native(true);
        }}
      >
        <SoundgasmApp data={data} bridge={bridge} onNative={native} />
      </SoundgasmBoundary>,
    );
  render();
  // FIXME(SOUNDGASM-BLANK): Safari/Tampermonkey can mount an empty React root
  // without throwing. Never hide the native player until replacement content
  // exists. TODO: Add integration tests for recordings, profiles, delayed
  // jPlayer hydration and SPA navigation before removing this safeguard.
  const revealIfReady = () => {
    const rendered = host.querySelector("#gws-sg-title, #gws-sg-profile-name");
    // A title alone does not prove that the replacement audio player is usable.
    // Preserve the native player while jPlayer is still hydrating its source.
    // FIXME(SOUNDGASM-SAFARI): Validate native and enhanced playback on iOS,
    // including late media hydration, errors and navigation to another recording.
    native(failed || !rendered || (!data.profile && !data.source));
  };
  revealIfReady();
  queueMicrotask(revealIfReady);
  // jPlayer can set its URL after DOMContentLoaded. Detect late source/script
  // changes instead of committing a permanently empty player on first render.
  const refresh = () => {
    if (ctx.signal.aborted) return;
    const source = readNativeMedia();
    const nextTitle = text(".jp-audio .jp-title li, .jp-audio .jp-title, .jp-title");
    const nextDescription = text(".jp-audio .jp-description, .jp-description");
    const patch: Partial<SoundgasmData> = {};
    if (!context?.title && nextTitle && nextTitle !== data.title) patch.title = nextTitle;
    if (!context?.description && nextDescription && nextDescription !== data.description)
      patch.description = nextDescription;
    if (source && source !== data.source) patch.source = source;
    if (Object.keys(patch).length) {
      data = { ...data, ...patch };
      render();
    }
  };
  ctx.observe(
    document.documentElement,
    (records: MutationRecord[]) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
              "[data-react-mount]",
            ),
        )
      )
        refresh();
    },
    {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    },
  );
  ctx.interval(() => {
    refresh();
    revealIfReady();
  }, 500);
  const titleBefore = document.title;
  document.title = `${data.title} · GoneWildStudio`;
  ctx.onDispose(() => {
    root.unmount();
    host.remove();
    native(true);
    document.title = titleBefore;
  });
}
