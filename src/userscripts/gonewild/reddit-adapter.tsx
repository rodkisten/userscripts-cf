import { createEffect, createSignal, createRoot, flush } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import { createStudioStore } from "./store.ts";
import { FeedRoot, PostCard, SettingsShell, type FeedController } from "./components/Feed.tsx";
import { normalize, KEYS } from "./domain.ts";
import { POST_SELECTOR, searchPosts } from "./services.ts";
import { readPost } from "./native.ts";
import { installNetwork } from "./network.js";
import styles, { css } from "./Feed.module.css";
export function mountReddit(ctx: any, bridge: any) {
  const store = createStudioStore();
  const { state, setState, actions } = store;
  const [open, setOpen] = createSignal(false),
    [tag, setTag] = createSignal("");
  const sub = () => decodeURIComponent(location.pathname.match(/\/r\/([^/]+)/i)?.[1] || "");
  const enabled = () => state.settings.subreddits.some((name) => normalize(name) === normalize(sub()));
  let searchRequest: AbortController | undefined,
    returnURL = "",
    serial = 0,
    scanTimer: ReturnType<typeof setTimeout> | undefined;
  const mounts = new Map<
    Element,
    { dispose: () => void; title: Element | null; post: ReturnType<typeof readPost> }
  >();
  const hidden = new Set<Element>();
  const sourceLinks = new Map<HTMLAnchorElement, { original: string; rewritten: string }>();
  const query = () =>
    [
      state.search.text,
      ...state.search.include.map((value) => `title:"${value.replace(/["\\]/g, " ")}"`),
      ...state.search.exclude.map((value) => `-title:"${value.replace(/["\\]/g, " ")}"`),
    ]
      .filter(Boolean)
      .join(" ");
  const search = async (more = false) => {
    // Read the selection committed by this same click before building the query.
    flush();
    if (!enabled()) return;
    searchRequest?.abort();
    searchRequest = new AbortController();
    const request = searchRequest,
      current = ++serial;
    if (!state.search.active) returnURL = location.href;
    const q = query();
    const url = new URL(`/r/${encodeURIComponent(sub())}/search/`, location.origin);
    url.searchParams.set("q", q);
    url.searchParams.set("restrict_sr", "1");
    url.searchParams.set("gws", "1");
    if (!more) history.pushState({ gws: true }, "", url);
    setState((draft) => {
      draft.search.active = true;
      draft.search.loading = true;
      draft.search.error = "";
      if (!more) {
        draft.search.results = [];
        draft.search.after = "";
      }
    });
    schedule();
    try {
      const page = await searchPosts(sub(), q, more ? state.search.after : "", request.signal);
      if (request.signal.aborted || current !== serial) return;
      setState((draft) => {
        const ids = new Set(draft.search.results.map((post) => post.id));
        draft.search.results.push(...page.posts.filter((post) => !ids.has(post.id)));
        draft.search.after = page.after;
      });
    } catch (error) {
      if (!request.signal.aborted)
        setState((draft) => {
          draft.search.error = (error as Error).message;
        });
    } finally {
      if (!request.signal.aborted && current === serial)
        setState((draft) => {
          draft.search.loading = false;
        });
    }
  };
  const clear = () => {
    searchRequest?.abort();
    serial++;
    actions.clearSearch();
    if (returnURL) {
      history.pushState({}, "", returnURL);
      returnURL = "";
    }
    schedule();
  };
  const controller: FeedController = {
    store,
    bridge,
    search,
    clear,
    settings: () => setOpen(true),
    tagMenu: setTag,
  };
  ctx.pageStyle(css);
  const shell = mountPoint(
    document.body,
    () => (
      <SettingsShell
        store={store}
        open={open()}
        tag={tag()}
        close={() => setOpen(false)}
        closeTag={() => setTag("")}
        chooseTag={(value, kind) => {
          actions.tag(value, kind);
          void search();
        }}
        clear={clear}
      />
    ),
    { id: "gws-shell", shadow: true, styles: [css] },
  );
  let root: ReturnType<typeof mountPoint> | undefined;
  const setHidden = (node: Element, wanted: boolean) => {
    node.classList.toggle(styles["gws-hidden"], wanted);
    if (wanted) hidden.add(node);
    else hidden.delete(node);
  };
  const remove = (node: Element) => {
    for (const [anchor, link] of sourceLinks)
      if (node.contains(anchor)) {
        if (anchor.href === link.rewritten) anchor.href = link.original;
        sourceLinks.delete(anchor);
      }
    const record = mounts.get(node);
    record?.dispose();
    record?.title?.classList.remove(styles["gws-native-title"]);
    node.classList.remove(styles["gws-hidden"]);
    mounts.delete(node);
    hidden.delete(node);
  };
  const scan = () => {
    if (ctx.signal.aborted) return;
    for (const [node] of mounts) if (!node.isConnected || !enabled()) remove(node);
    const main = document.querySelector("main") || document.body;
    if (enabled()) {
      if (!root?.host.isConnected) {
        root?.dispose();
        root = mountPoint(main, () => <FeedRoot controller={controller} />, { before: main.firstChild });
      }
      for (const node of document.querySelectorAll(POST_SELECTOR)) {
        if (
          node.closest("[data-solid-mount]") ||
          mounts.has(node) ||
          [...mounts.keys()].some((known) => known.contains(node) || node.contains(known))
        )
          continue;
        const post = readPost(node, sub());
        if (!post || !state.settings.subreddits.some((name) => normalize(name) === normalize(post.sub)))
          continue;
        const title = node.querySelector(
          '[data-testid="post-title-text"], [slot="title"], h3, a.title, a[id^="post-title"]',
        );
        const mount = mountPoint(node, () => (
          <PostCard
            post={post}
            controller={controller}
            native
            onAudio={(items) => {
              // Rewriting native source links is an adapter responsibility; the
              // component only publishes resolved media, never queries site DOM.
              for (const anchor of node.querySelectorAll<HTMLAnchorElement>("a[href]")) {
                if (anchor.closest("[data-solid-mount]")) continue;
                const item = items.find((item) => {
                  try {
                    const source = new URL(item.external),
                      target = new URL(anchor.href);
                    return source.origin + source.pathname === target.origin + target.pathname;
                  } catch {
                    return false;
                  }
                });
                if (item?.studioHref) {
                  const original = sourceLinks.get(anchor)?.original || anchor.href;
                  sourceLinks.set(anchor, { original, rewritten: item.studioHref });
                  anchor.href = item.studioHref;
                }
              }
            }}
          />
        ));
        mounts.set(node, { dispose: mount.dispose, title, post });
      }
      for (const [node, record] of mounts) {
        const post = record.post!;
        record.title?.classList.toggle(styles["gws-native-title"], state.settings.showTags);
        const title = normalize(post.title);
        setHidden(
          node,
          state.search.active ||
            (state.settings.onlyAudio &&
              state.resolved[post.id]?.checked &&
              !state.resolved[post.id]?.count) ||
            (state.settings.hideSeen && !!state.seen[post.id]) ||
            state.search.include.some((value) => !title.includes(normalize(value))) ||
            state.search.exclude.some((value) => title.includes(normalize(value))),
        );
      }
    } else {
      root?.dispose();
      root = undefined;
    }
    for (const node of document.querySelectorAll(
      'shreddit-ad-post, shreddit-ad, reddit-ad, ad-unit, [data-promoted="true"], shreddit-post[promoted], shreddit-post[is-promoted], shreddit-post[ad-type]',
    ))
      setHidden(node, state.settings.removeAds);
    if (state.postCount !== mounts.size)
      setState((draft) => {
        draft.postCount = mounts.size;
      });
  };
  function schedule() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 50);
  }
  // Only this adapter touches native Reddit nodes. Every script-owned view is
  // rendered and updated by Solid; page observers never build UI children.
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
            "[data-solid-mount]",
          ),
      )
    )
      schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  const disposeEffects = createRoot((dispose) => {
    createEffect(
      () => ({
        settings: { ...state.settings },
        seen: { ...state.seen },
        resolved: { ...state.resolved },
        active: state.search.active,
        include: [...state.search.include],
        exclude: [...state.search.exclude],
      }),
      schedule,
    );
    return dispose;
  });
  const route = () => {
    if (!new URL(location.href).searchParams.has("gws") && state.search.active) {
      searchRequest?.abort();
      actions.clearSearch();
    }
    schedule();
  };
  ctx.listen(window, "popstate", route);
  ctx.listen(window, "pageshow", schedule);
  const interval = setInterval(route, 1000);
  const disposeNetwork = installNetwork(KEYS.config, KEYS.seen);
  const params = new URL(location.href).searchParams;
  if (params.has("gws")) {
    const tags = params.getAll("gwsTag");
    let text = params.get("q") || "";
    for (const tag of tags) {
      actions.tag(tag);
      text = text.replace(`title:"${tag.replace(/["\\]/g, " ")}"`, "").trim();
    }
    setState((draft) => {
      draft.search.text = text;
    });
    void search();
  }
  scan();
  ctx.onDispose(() => {
    observer.disconnect();
    clearTimeout(scanTimer);
    clearInterval(interval);
    searchRequest?.abort();
    disposeEffects();
    root?.dispose();
    shell.dispose();
    for (const [node] of mounts) remove(node);
    hidden.forEach((node) => node.classList.remove(styles["gws-hidden"]));
    for (const [anchor, link] of sourceLinks) if (anchor.href === link.rewritten) anchor.href = link.original;
    disposeNetwork();
  });
}
