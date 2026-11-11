import { mountView } from "../ui/solid-mount.tsx";
import { RODX_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-lists-timeline-1.css?inline";
import extractedCSS2 from "../../../styles/extracted/userscripts-rodx-studio-lists-timeline-2.css?inline";
import { Studio } from "../core/studio.js";
import {
  bottomCursor,
  csrfCookie,
  operationName,
  requestInternal,
  requestTemplates,
  responseListId,
  sessionAuth,
  templateRequest,
} from "./graphql.js";
import { toggle } from "./quick-picker.tsx";
import {
  APP,
  LIST_PRESETS_KEY,
  PER_LIST_FIELDS,
  buildQuery,
  esc,
  isListPage,
  listPresets,
  listToolbar,
  now,
  openDB,
  putMany,
  qs,
  routeListId,
  settings,
  state,
  timeText,
  validHandle,
  validListId,
} from "./render.tsx";
import { shadow } from "./view.tsx";

export let timeline;

export function initializeListsTimeline() {
  timeline = Studio.slice("listTimeline", {
    listId: "",
    query: "",
    queryKey: "",
    mode: "",
    items: [],
    cursor: "",
    hasMore: false,
    loading: false,
    error: "",
    status: "",
    updatedAt: "",
    seq: 0,
  });
}

export let embeddedTimeline;

export function initializeListsEmbeddedTimeline() {
  embeddedTimeline = null;
}

export let readThrottle;

export function initializeListsReadThrottle() {
  readThrottle = new Map<any, any>();
}

export let lastAutoPageAt;

export function initializeListsLastAutoPageAt() {
  lastAutoPageAt = 0;
}

export let scrollObserver;

export function initializeListsScrollObserver() {
  scrollObserver = null;
}

export function attachScrollObserver() {
  scrollObserver?.disconnect();
  if (!embeddedTimeline?.isConnected || !window.IntersectionObserver || !timeline.hasMore) return;
  const sentinel = embeddedTimeline.shadowRoot?.getElementById("xls-more-sentinel");
  if (!sentinel) return;
  scrollObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting) || document.hidden || timeline.loading || !timeline.hasMore)
        return;
      if (clientFilterPosts(timeline.items).length < 3) return;
      if (Date.now() - lastAutoPageAt < 15000) return;
      lastAutoPageAt = Date.now();
      loadTimeline({
        listId: timeline.listId,
        more: true,
      }).catch(reportTimelineError);
    },
    {
      rootMargin: "200px 0px",
    },
  );
  scrollObserver.observe(sentinel);
}

export function hashQuery(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export let timelineQueryKey;

export function initializeListsTimelineQueryKey() {
  timelineQueryKey = (mode, query, sort = settings.sort) =>
    mode === "native" ? "native" : `search:${hashQuery(query + "|" + sort)}`;
}

export function safeMediaURL(value, kind = "image") {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    if (kind === "video") return url.hostname === "video.twimg.com" ? url.toString() : "";
    return ["pbs.twimg.com", "abs.twimg.com"].includes(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function extractTimelinePosts(data) {
  const output = new Map<any, any>();
  const stack = [data],
    seen = new WeakSet<any>();
  let steps = 0;
  while (stack.length && steps++ < 50000 && output.size < 160) {
    const obj = stack.pop();
    if (!obj || typeof obj !== "object" || seen.has(obj)) continue;
    seen.add(obj);
    // Capture a Tweet only from an actual result, not arbitrary list metadata.
    if (obj.tweet_results?.result) {
      let t = obj.tweet_results.result;
      if (t?.tweet) t = t.tweet; // TweetWithVisibilityResults
      const legacy = t?.legacy || {},
        id = String(t?.rest_id || legacy.id_str || "");
      const user = t?.core?.user_results?.result || t?.core?.user?.result || {};
      const userLegacy = user?.legacy || {},
        core = user?.core || {};
      const username = String(userLegacy.screen_name || core.screen_name || "");
      if (validListId(id) && validHandle(username)) {
        const mediaArr = legacy.extended_entities?.media || legacy.entities?.media || [];
        let media = null;
        for (const item of mediaArr) {
          const image = safeMediaURL(item.media_url_https || item.media_url);
          if (!image) continue;
          const variants = (item.video_info?.variants || [])
            .filter((x) => x.content_type === "video/mp4" && safeMediaURL(x.url, "video"))
            .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
          media = {
            type: ["video", "animated_gif"].includes(item.type) ? "video" : "image",
            image,
            video: variants[0] ? safeMediaURL(variants[0].url, "video") : "",
          };
          if (media.type === "video") break;
        }
        const text = String(
          t?.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || legacy.text || "",
        ).slice(0, 10000);
        const displayName = String(userLegacy.name || core.name || username).slice(0, 160);
        const post = {
          id,
          listId: "",
          username,
          displayName,
          text,
          media,
          createdAt: legacy.created_at || "",
          likes: Number(legacy.favorite_count) || 0,
          isRepost: Boolean(
            legacy.retweeted_status_result || legacy.retweeted_status_id_str || t?.retweeted_status_result,
          ),
          isReply: Boolean(legacy.in_reply_to_status_id_str),
          avatar: safeMediaURL(userLegacy.profile_image_url_https || user?.avatar?.image_url || ""),
          url: `https://x.com/${encodeURIComponent(username)}/status/${id}`,
        };
        if (!output.has(id)) output.set(id, post);
      }
    }
    if (Array.isArray(obj)) {
      for (let i = obj.length - 1; i >= 0; i--) if (obj[i] && typeof obj[i] === "object") stack.push(obj[i]);
    } else
      for (const [key, value] of Object.entries(obj))
        if (key !== "tweet_results" && value && typeof value === "object") stack.push(value);
  }
  return [...output.values()];
}

export function clientFilterPosts(posts) {
  return posts.filter((p) => {
    if (settings.hideReposts && p.isRepost) return false;
    if (!settings.replies && p.isReply) return false;
    if (settings.media === "videos" || settings.media === "native")
      if (p.media?.type !== "video") return false;
    if (settings.media === "images" && p.media?.type !== "image") return false;
    if (settings.media === "media" && !p.media) return false;
    if (Number(settings.minLikes) > 0 && p.likes < Number(settings.minLikes)) return false;
    return true;
  });
}

export function formatPostDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
}

export function postHTML(post) {
  const avatar = post.avatar ? (
    <>
      <img class={"xls-avatar"} loading={"lazy"} referrerpolicy={"no-referrer"} src={post.avatar} alt={""} />
    </>
  ) : (
    <>
      <span class={"xls-avatar"}></span>
    </>
  );
  const media =
    post.media?.type === "video" && post.media.video ? (
      <>
        <video
          class={"xls-media"}
          playsinline={true}
          controls={true}
          preload={"none"}
          poster={post.media.image}
          src={post.media.video}
        ></video>
      </>
    ) : post.media?.image ? (
      <>
        <img class={"xls-media"} loading={"lazy"} src={post.media.image} alt={"Mídia do post"} />
      </>
    ) : (
      ""
    );
  return (
    <>
      <article class={"xls-post"}>
        {avatar}
        <div class={"xls-post-body"}>
          {"\n      "}
          <a
            href={["https://x.com/", encodeURIComponent(post.username)].join("")}
            target={"_blank"}
            rel={"noopener noreferrer"}
          >
            <strong>{post.displayName}</strong>{" "}
            <span class={"small"}>
              {"@"}
              {post.username}
            </span>
          </a>
          {"\n      "}
          <div class={"xls-post-date"}>
            {post.isRepost ? "Repost · " : ""}
            {formatPostDate(post.createdAt)}
            {" · "}
            {post.likes}
            {" curtidas"}
          </div>
          {"\n      "}
          <div class={"xls-post-text"}>{post.text}</div>
          {media}
          {"\n      "}
          <a href={post.url} target={"_blank"} rel={"noopener noreferrer"} class={"small"}>
            {"Abrir post no X ↗"}
          </a>
          {"\n      "}
        </div>
      </article>
    </>
  );
}

export function renderTimelineCards(panel = false) {
  const shown = clientFilterPosts(timeline.items);
  const canMore = Boolean(timeline.hasMore && !timeline.loading);
  const actions = (
    <>
      <div class={"grp rx-timeline-grp"}>
        <button
          class={"btn mini"}
          data-action={"timeline-refresh"}
          disabled={(timeline.loading ? "disabled" : "") === "disabled"}
        >
          {"↻ Atualizar"}
        </button>
        {"\n      "}
        <button
          class={"btn mini primary"}
          data-action={"timeline-more"}
          disabled={(!canMore ? "disabled" : "") === "disabled"}
        >
          {"Mais posts ↓"}
        </button>
      </div>
    </>
  );
  const label = timeline.mode === "search" ? "Busca interna filtrada" : "Timeline da lista + filtros locais";
  const status = (
    <>
      <div class={"xls-feed-status"}>
        {label}
        {" · "}
        {shown.length}
        {" visíveis / "}
        {timeline.items.length}
        {" recebidos"}
        {timeline.updatedAt ? " · " + timeText(timeline.updatedAt) : ""}
        {"\n      "}
        {timeline.loading ? " · Carregando…" : ""}
      </div>
      {"\n      "}
      {timeline.mode === "native" ? (
        <>
          <div class={"xls-feed-status"}>
            {
              "Modo parcial: filtros aplicados só aos posts recebidos. Para consultas exatas, abra uma busca comum no X uma vez para que o Studio identifique SearchTimeline."
            }
          </div>
        </>
      ) : (
        ""
      )}
      {"\n      "}
      {timeline.error ? (
        <>
          <p class={"notice error"}>{timeline.error}</p>
        </>
      ) : (
        ""
      )}
      {"\n      "}
      {timeline.status ? (
        <>
          <p class={"notice"}>{timeline.status}</p>
        </>
      ) : (
        ""
      )}
    </>
  );
  return (
    <>
      <div class={"xls-feed"} data-xls-feed={panel ? "panel" : "embedded"}>
        {status}
        {actions}
        {"\n      "}
        {shown.map(postHTML) ||
          (!timeline.loading ? (
            <>
              <p class={"muted"}>{"Nenhum post correspondente entre os resultados carregados."}</p>
            </>
          ) : (
            ""
          ))}
        {"\n      "}
        {shown.length > 5 ? actions : ""}
        {"\n      "}
        {timeline.hasMore ? (
          <>
            <div id={"xls-more-sentinel"} class={"rx-timeline-sentinel"} aria-hidden={"true"}></div>
          </>
        ) : (
          ""
        )}
      </div>
    </>
  );
}

export async function cachedTimeline(listId, queryKey) {
  const db = await openDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction("timeline", "readonly");
    const req = tx.objectStore("timeline").index("listQuery").getAll([listId, queryKey]);
    req.onsuccess = () =>
      resolve(
        req.result
          .sort((a, b) => b.savedAt - a.savedAt)
          .slice(0, 150)
          .map((row) => row.post),
      );
    req.onerror = () => reject(req.error);
  });
}

export async function cacheTimeline(listId, queryKey, posts) {
  if (!validListId(listId) || !posts.length) return;
  const stamp = Date.now();
  const rows = posts.slice(0, 140).map((post, i) => ({
    key: `${listId}:${queryKey}:${post.id}`,
    listId,
    queryKey,
    post,
    savedAt: stamp - i,
  }));
  await putMany("timeline", rows);
  // Bound the cache per list and query, including after repeated infinite-scroll pages.
  const db = await openDB();
  const records = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction("timeline", "readonly");
    const request = tx.objectStore("timeline").index("listQuery").getAll([listId, queryKey]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (records.length > 300) {
    const stale = records.sort((a, b) => b.savedAt - a.savedAt).slice(300);
    await new Promise<any>((resolve, reject) => {
      const tx = db.transaction("timeline", "readwrite");
      for (const r of stale) tx.objectStore("timeline").delete(r.key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
}

export function timelineRequest(mode, id, query, cursor = "") {
  const op =
    mode === "search"
      ? "SearchTimeline"
      : requestTemplates.ListLatestTweetsTimeline
        ? "ListLatestTweetsTimeline"
        : "ListTweetsTimeline";
  const tmpl = requestTemplates[op];
  if (!tmpl || tmpl.method !== "GET")
    throw new Error(
      `Ainda não observei ${op}. Abra uma vez a ${mode === "search" ? "busca nativa" : "lista"} normalmente no X; depois use Timeline Studio.`,
    );
  let existing = {};
  try {
    existing = JSON.parse(tmpl.params.variables || "{}");
  } catch {}
  let variables: Record<string, any> = {};
  if (mode === "search") {
    variables = {
      rawQuery: query,
    };
    if ("count" in existing) variables.count = Math.min(40, Math.max(10, Number(existing.count) || 20));
    if ("product" in existing) variables.product = settings.sort === "top" ? "Top" : "Latest";
  } else {
    const idKey = "listId" in existing ? "listId" : "list_id" in existing ? "list_id" : "listId";
    variables = {
      [idKey]: id,
    };
  }
  if (cursor) variables.cursor = cursor;
  return templateRequest(op, variables, cursor ? [] : ["cursor"]);
}

export function reportTimelineError(err) {
  timeline.loading = false;
  timeline.error = String(err?.message || err);
  refreshTimelineView();
  console.debug("[X Lists Studio] Timeline:", err);
}

export function refreshTimelineView() {
  if (embeddedTimeline && embeddedTimeline.isConnected) {
    // Do not replace a playing video or reset media controls on every X DOM mutation.
    const signature = JSON.stringify([
      timeline.seq,
      timeline.listId,
      timeline.query,
      timeline.mode,
      timeline.items.length,
      timeline.items[0]?.id,
      timeline.items.at(-1)?.id,
      timeline.loading,
      timeline.error,
      timeline.status,
      timeline.updatedAt,
      timeline.hasMore,
      ...PER_LIST_FIELDS.map((k) => settings[k]),
    ]);
    if (embeddedTimeline.dataset.xlsSignature !== signature) {
      embeddedTimeline.dataset.xlsSignature = signature;
      const root = embeddedTimeline.shadowRoot;
      if (root) mountView(root.getElementById("xls-feed-root"), () => renderTimelineCards());
      attachScrollObserver();
    }
  }
  if (state.visible && state.tab === "busca") {
    const preview = qs(RODX_SELECTORS.listsSearchPreview, shadow);
    if (preview && timeline.listId === state.listId && timeline.query === buildQuery(state.listId))
      mountView(preview, () => renderTimelineCards(true));
  }
}

export async function loadTimeline({
  listId = routeListId() || state.listId,
  more = false,
  force = false,
} = {}) {
  if (!validListId(listId)) throw new Error("Selecione uma lista válida.");
  if (document.hidden) throw new Error("Volte para a aba do X para carregar a timeline.");
  if (timeline.loading) return;
  const query = buildQuery(listId);
  const mode = requestTemplates.SearchTimeline ? "search" : "native";
  const queryKey = timelineQueryKey(mode, query);
  const same =
    timeline.listId === listId &&
    timeline.query === query &&
    timeline.mode === mode &&
    timeline.queryKey === queryKey;
  if (more && (!same || !timeline.hasMore)) return;
  if (!more && same && !force && timeline.items.length) return;
  if (!more) {
    timeline.listId = listId;
    timeline.query = query;
    timeline.queryKey = queryKey;
    timeline.mode = mode;
    timeline.cursor = "";
    timeline.hasMore = false;
    timeline.items = [];
    timeline.error = "";
    timeline.status = "";
    const seq = ++timeline.seq;
    cachedTimeline(listId, queryKey)
      .then((posts) => {
        if (seq !== timeline.seq || timeline.items.length) return;
        timeline.items = posts;
        refreshTimelineView();
      })
      .catch(() => {});
  }
  const seq = timeline.seq;
  timeline.loading = true;
  timeline.error = "";
  refreshTimelineView();
  try {
    if (!navigator.onLine) throw new Error("Sem conexão com a internet; exibindo cache quando disponível.");
    if (!sessionAuth.authorization || !csrfCookie())
      throw new Error("Aguarde o X carregar uma timeline para identificar a sessão atual.");
    const until = Number(sessionStorage.getItem(`${APP}:rate-low-until`) || 0);
    if (until > Date.now())
      throw new Error(
        `O X informou cota quase esgotada. Não fazer novas requisições até ${timeText(new Date(until).toISOString())}.`,
      );
    const stampKey = `${listId}:${queryKey}`;
    if (!more && !force && Date.now() - (readThrottle.get(stampKey) || 0) < 45_000) return;
    const cursor = more ? timeline.cursor : "";
    const request = timelineRequest(mode, listId, query, cursor);
    readThrottle.set(stampKey, Date.now());
    const data = await requestInternal(request.path, {
      params: request.params,
    });
    const posts = extractTimelinePosts(data);
    if (seq !== timeline.seq) return;
    const unique = new Map<any, any>([...(more ? timeline.items : []), ...posts].map((p) => [p.id, p]));
    timeline.items = [...unique.values()].slice(0, 400);
    const next = bottomCursor(data);
    timeline.hasMore = Boolean(next && next !== cursor && posts.length);
    timeline.cursor = timeline.hasMore ? next : "";
    timeline.updatedAt = now();
    if (!posts.length)
      timeline.status =
        "O X não retornou posts reconhecíveis para esta consulta. Pode ser uma lista privada, vazia ou um formato de resposta alterado.";
    await cacheTimeline(listId, queryKey, posts);
  } catch (error) {
    if (seq === timeline.seq) timeline.error = String(error?.message || error);
  } finally {
    if (seq === timeline.seq) {
      timeline.loading = false;
      refreshTimelineView();
    }
  }
}

export async function ingestObservedTimeline(data, url) {
  const op = operationName(url);
  if (!["SearchTimeline", "ListLatestTweetsTimeline", "ListTweetsTimeline"].includes(op)) return;
  const listId = responseListId(url);
  if (!validListId(listId)) return;
  const posts = extractTimelinePosts(data);
  if (!posts.length) return;
  let query = "",
    mode = "native";
  let sort = "live";
  if (op === "SearchTimeline") {
    try {
      const vars = JSON.parse(new URL(url, location.origin).searchParams.get("variables") || "{}");
      query = String(vars.rawQuery || "");
      sort = String(vars.product || "Latest").toLowerCase() === "top" ? "top" : "live";
    } catch {}
    if (!query.includes(`list:${listId}`)) return;
    mode = "search";
  }
  const key = timelineQueryKey(mode, query, sort);
  cacheTimeline(listId, key, posts).catch(() => {});
  // Do not replace filtered search results with unrelated native-list results.
  if (
    timeline.listId === listId &&
    timeline.mode === mode &&
    timeline.queryKey === key &&
    !timeline.loading
  ) {
    const unique = new Map<any, any>([...timeline.items, ...posts].map((p) => [p.id, p]));
    timeline.items = [...unique.values()].slice(0, 400);
    timeline.updatedAt = now();
    refreshTimelineView();
  }
}

export function removeEmbeddedTimeline() {
  scrollObserver?.disconnect();
  scrollObserver = null;
  document.documentElement.classList.remove("xls-custom-timeline");
  embeddedTimeline?.remove();
  embeddedTimeline = null;
}

export function ensureEmbeddedTimeline() {
  const id = routeListId(),
    on = isListPage() && Boolean(listPresets[id]?.customTimeline);
  if (!on) {
    removeEmbeddedTimeline();
    return;
  }
  if (!listToolbar?.isConnected) return;
  if (!embeddedTimeline) {
    embeddedTimeline = (<section />) as HTMLElement;
    embeddedTimeline.id = "xls-timeline-inject";
    const root = embeddedTimeline.attachShadow({
      mode: "open",
    });
    const styles = (<style />) as HTMLStyleElement;
    styles.textContent = extractedCSS1;
    root.append(styles);
    const markup = (<div />) as HTMLDivElement;
    mountView(markup, () => (
      <>
        <div class={"head"}>
          <div>
            <span class={"tag"}>{"X LISTS STUDIO"}</span>
            <div>
              <strong>{"Timeline personalizada"}</strong>
            </div>
          </div>
          <div class={"grp"}>
            <button class={"btn"} data-action={"edit-filters"}>
              {"Filtros ⚙"}
            </button>
            <button class={"btn"} data-action={"timeline-close"}>
              {"Voltar ao X"}
            </button>
          </div>
        </div>
        <div id={"xls-feed-root"}></div>
      </>
    ));
    root.append(markup);
    root.addEventListener("click", (event) => {
      const action = event.target.closest(RODX_SELECTORS.dataActions)?.dataset.action;
      if (action === "timeline-close") {
        listPresets[routeListId()] = {
          ...listPresets[routeListId()],
          customTimeline: false,
        };
        localStorage.setItem(LIST_PRESETS_KEY, JSON.stringify(listPresets));
        removeEmbeddedTimeline();
      } else if (action === "edit-filters") {
        state.listId = routeListId();
        state.tab = "busca";
        toggle(true);
      } else if (action === "timeline-more")
        loadTimeline({
          listId: id,
          more: true,
        }).catch(reportTimelineError);
      else if (action === "timeline-refresh")
        loadTimeline({
          listId: id,
          force: true,
        }).catch(reportTimelineError);
    });
  }
  if (listToolbar.nextElementSibling !== embeddedTimeline)
    listToolbar.insertAdjacentElement("afterend", embeddedTimeline);
  if (!document.getElementById("xls-custom-feed-style")) {
    const style = (<style />) as HTMLStyleElement;
    style.id = "xls-custom-feed-style";
    style.textContent = extractedCSS2;
    document.head?.append(style);
  }
  document.documentElement.classList.add("xls-custom-timeline");
  refreshTimelineView();
  const query = buildQuery(id);
  if (
    timeline.listId !== id ||
    timeline.query !== query ||
    timeline.queryKey !== timelineQueryKey(timeline.mode || "native", query)
  )
    loadTimeline({
      listId: id,
    }).catch(reportTimelineError);
}
