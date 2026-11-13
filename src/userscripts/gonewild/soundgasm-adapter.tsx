import { createStore, Errored } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import { SoundgasmApp, StudioFailure, type SoundgasmData } from "./components/SoundgasmApp.tsx";
import { readNativeMedia, readRecordings } from "./services.ts";
import { safeURL } from "./domain.ts";
import styles, { css } from "./Soundgasm.module.css";
export async function mountSoundgasm(ctx: any, bridge: any) {
  const context = await bridge.readLocation();
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
  const [data, setData] = createStore<SoundgasmData>({
    title,
    description,
    author: decodeURIComponent(parts[1] || ""),
    subreddit: context?.subreddit || "",
    permalink: bridge.safeReddit(context?.permalink),
    source: readNativeMedia(),
    profile: parts.length === 2,
    recordings,
  });
  if (data.profile && !data.recordings.length) return; // Keep native empty/unknown profiles usable.
  ctx.pageStyle(css);
  const native = (show: boolean) => document.body.classList.toggle(styles["gws-sg-enhanced"], !show);
  let failed = false;
  const mount = mountPoint(
    document.body,
    () => (
      <Errored
        fallback={(_error, reset) => {
          failed = true;
          native(true);
          return (
            <StudioFailure
              retry={() => {
                failed = false;
                native(false);
                reset();
              }}
            />
          );
        }}
      >
        <SoundgasmApp data={data} bridge={bridge} onNative={native} />
      </Errored>
    ),
    { id: "gws-sg-root" },
  );
  // FIXME(SOUNDGASM-BLANK): Safari/Tampermonkey can mount an empty Solid host
  // without throwing. Never hide the native player until replacement content
  // exists. TODO: Add integration tests for recordings, profiles, delayed
  // jPlayer hydration and SPA navigation before removing this safeguard.
  const revealIfReady = () => {
    const rendered = mount.host.querySelector("#gws-sg-title, #gws-sg-profile-name, [role=alert]");
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
    if (!context?.title && nextTitle && nextTitle !== data.title)
      setData((draft) => {
        draft.title = nextTitle;
      });
    if (!context?.description && nextDescription && nextDescription !== data.description)
      setData((draft) => {
        draft.description = nextDescription;
      });
    if (source && source !== data.source)
      setData((draft) => {
        draft.source = source;
      });
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
            "[data-solid-mount]",
          ),
      )
    )
      refresh();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  const interval = setInterval(() => { refresh(); revealIfReady(); }, 500);
  const titleBefore = document.title;
  document.title = `${data.title} · GoneWildStudio`;
  ctx.onDispose(() => {
    observer.disconnect();
    clearInterval(interval);
    mount.dispose();
    native(true);
    document.title = titleBefore;
  });
}
