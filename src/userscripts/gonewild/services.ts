import { gmRequest } from "../../runtime/userscript-capabilities.ts";
import { readPost } from "./native.ts";
import {
  AUDIO_EXT,
  HOSTS,
  KEYS,
  extractLinks,
  parseTags,
  readJSON,
  safeURL,
  writeJSON,
  type AudioItem,
  type Post,
  type Recording,
} from "./domain.ts";
export function requestText(url: string, signal: AbortSignal): Promise<string> {
  const request = gmRequest();
  if (!request)
    return fetch(url, { credentials: "omit", signal }).then((response) => {
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return response.text();
    });
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      handle?.abort();
      reject(signal.reason);
    };
    const done = (fn: () => void) => {
      signal.removeEventListener("abort", cancel);
      fn();
    };
    const handle = request({
      method: "GET",
      url,
      responseType: "text",
      timeout: 12000,
      onload: (result: any) =>
        done(() =>
          result.status >= 200 && result.status < 300
            ? resolve(String(result.responseText ?? result.response ?? ""))
            : reject(Error(`HTTP ${result.status}`)),
        ),
      onerror: () => done(() => reject(Error("Falha de rede"))),
      ontimeout: () => done(() => reject(Error("Tempo excedido"))),
      onabort: () => done(() => reject(Error("Interrompido"))),
    });
    signal.addEventListener("abort", cancel, { once: true });
  });
}
export function mediaFromHTML(html: string, base: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const candidates = [
    ...doc.querySelectorAll(
      'audio[src], audio source[src], meta[property="og:audio"], meta[name="twitter:player:stream"], a[href]',
    ),
  ].map(
    (node) => node.getAttribute("src") || node.getAttribute("content") || node.getAttribute("href") || "",
  );
  const decoded = html
    .replace(/\\\//g, "/")
    .replace(/\\u002f/gi, "/")
    .replace(/&amp;/g, "&");
  candidates.push(
    ...[
      ...decoded.matchAll(/https?:\/\/[^\s'"<>\\]+\.(?:m4a|mp3|aac|ogg|opus|wav)(?:\?[^\s'"<>\\]*)?/gi),
    ].map((match) => match[0]),
  );
  for (const candidate of candidates) {
    const url = safeURL(candidate, base);
    if (url && HOSTS.test(url.hostname) && AUDIO_EXT.test(url.href)) return url.href;
  }
  return "";
}
export function readNativeMedia(doc: Document = document) {
  for (const node of doc.querySelectorAll<HTMLMediaElement | HTMLSourceElement>(
    "audio[src], audio source[src]",
  )) {
    if (node.closest("[data-solid-mount], #gws-sg-root")) continue;
    const raw = (node as HTMLMediaElement).currentSrc || node.getAttribute("src") || "";
    const url = safeURL(raw);
    if (url && HOSTS.test(url.hostname) && AUDIO_EXT.test(url.href)) return url.href;
  }
  const scripts = [...doc.querySelectorAll("script:not([src])")]
    .map((node) => node.textContent || "")
    .join("\n");
  return mediaFromHTML(scripts, location.href);
}
export function readRecordings(doc: Document = document): Recording[] {
  const seen = new Set<string>();
  return [...doc.querySelectorAll(".sound-details")].flatMap((block, index) => {
    const link = [...block.querySelectorAll<HTMLAnchorElement>("a[href]")].find((node) => {
      const url = safeURL(node.href);
      return (
        url && /^(?:www\.)?soundgasm\.net$/i.test(url.hostname) && /^\/u\/[^/]+\/[^/]+/.test(url.pathname)
      );
    });
    if (!link || seen.has(link.pathname)) return [];
    seen.add(link.pathname);
    return [
      {
        title: (
          block.querySelector(".sound-title, .jp-title, h2, h3")?.textContent ||
          link.textContent ||
          ""
        ).trim(),
        href: link.href,
        description: (
          block.querySelector(".sound-description, .jp-description, .sound-desc, .description")
            ?.textContent || ""
        ).trim(),
        plays: Number(
          (block.textContent?.match(/Play\s*Count:\s*([\d,.]+)/i)?.[1] || "0").replace(/[,.]/g, ""),
        ),
        index,
      },
    ];
  });
}
let active = 0;
const waiting: Array<() => void> = [];
async function limited<T>(operation: () => Promise<T>, signal: AbortSignal) {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    signal.throwIfAborted();
    return await operation();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
export async function resolvePostAudio(post: Post, bridge: any, signal: AbortSignal, force = false) {
  return limited(async () => {
    let body = post.body,
      author = post.author;
    const links = [...post.links];
    try {
      const url = new URL(
        `/r/${encodeURIComponent(post.sub)}/comments/${post.id.replace(/^t3_/, "")}.json`,
        location.origin,
      );
      url.searchParams.set("raw_json", "1");
      url.searchParams.set("limit", "0");
      const response = await fetch(url, { credentials: "same-origin", signal });
      if (response.ok) {
        const json = await response.json();
        const data = json?.[0]?.data?.children?.[0]?.data;
        if (data) {
          body = data.selftext || body;
          author = data.author || author;
          links.push(...extractLinks([body, data.url_overridden_by_dest, data.url].join("\n")));
        }
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
    const cache = readJSON<Record<string, { at: number; items: AudioItem[] }>>(KEYS.cache, {});
    let items =
      !force && cache[post.id] && Date.now() - cache[post.id].at < 7 * 86400000 ? cache[post.id].items : null;
    if (!items) {
      items = [];
      for (const external of [...new Set(links)].slice(0, 5)) {
        let playable = AUDIO_EXT.test(external) ? external : null;
        try {
          if (!playable) playable = mediaFromHTML(await requestText(external, signal), external) || null;
        } catch (error) {
          if (signal.aborted) throw error;
        }
        items.push({ external, playable });
      }
      cache[post.id] = { at: Date.now(), items };
      writeJSON(
        KEYS.cache,
        Object.fromEntries(
          Object.entries(cache)
            .sort((a, b) => b[1].at - a[1].at)
            .slice(0, 500),
        ),
      );
    }
    const enriched = await Promise.all(
      items.map(async (item) => ({
        ...item,
        studioHref: await bridge.decorate(item.external, {
          subreddit: post.sub,
          permalink: post.href,
          title: post.title,
          description: body,
          author,
        }),
      })),
    );
    signal.throwIfAborted();
    return { items: enriched, body };
  }, signal);
}
export async function searchPosts(
  sub: string,
  query: string,
  after: string,
  signal: AbortSignal,
): Promise<{ posts: Post[]; after: string }> {
  const url = new URL(`/r/${encodeURIComponent(sub)}/search.json`, location.origin);
  for (const [key, value] of Object.entries({
    q: query,
    restrict_sr: "1",
    sort: "relevance",
    type: "link",
    limit: "25",
    raw_json: "1",
    after,
  }))
    url.searchParams.set(key, value);
  const response = await fetch(url, { credentials: "same-origin", signal });
  if (!response.ok) {
    url.pathname = url.pathname.replace(/\.json$/, "/");
    const fallback = await fetch(url, { credentials: "same-origin", signal });
    if (!fallback.ok) throw Error(`Reddit HTTP ${fallback.status}`);
    const doc = new DOMParser().parseFromString(await fallback.text(), "text/html");
    return {
      posts: [...doc.querySelectorAll(POST_SELECTOR)]
        .map((node) => readPost(node, sub))
        .filter((post): post is Post => !!post),
      after: doc.querySelector<HTMLAnchorElement>('a[rel="next"]')?.href
        ? new URL(doc.querySelector<HTMLAnchorElement>('a[rel="next"]')!.href).searchParams.get("after") || ""
        : "",
    };
  }
  const json = await response.json();
  return {
    posts: (json.data?.children || [])
      .filter((child: any) => child.kind === "t3")
      .map(({ data }: any) => ({
        id: data.name || `t3_${data.id}`,
        title: data.title,
        sub: data.subreddit,
        href: new URL(data.permalink, location.origin).href,
        author: data.author || "",
        body: data.selftext || "",
        links: extractLinks([data.selftext, data.url, data.url_overridden_by_dest].join("\n")),
        tags: parseTags(data.title),
      })),
    after: json.data?.after || "",
  };
}
export const POST_SELECTOR =
  'shreddit-post, [data-testid="search-post-unit"], [data-testid="sdui-post-unit"], [data-testid="post-container"], .Post, .thing.link[data-fullname]';

export async function boundedAudio(
  url: string,
  signal: AbortSignal,
  limit = 14 * 1024 * 1024,
): Promise<ArrayBuffer> {
  const request = gmRequest();
  if (request)
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      let handle: any;
      const cancel = () => {
        handle?.abort();
        done(() => reject(signal.reason));
      };
      const done = (fn: () => void) => {
        signal.removeEventListener("abort", cancel);
        fn();
      };
      handle = request({
        method: "GET",
        url,
        responseType: "arraybuffer",
        timeout: 30000,
        onprogress: (event: any) => {
          if (event.loaded > limit) {
            handle?.abort();
            done(() => reject(Error("Arquivo excede 14 MB")));
          }
        },
        onload: (response: any) =>
          done(() =>
            response.status >= 200 && response.status < 300 && response.response?.byteLength <= limit
              ? resolve(response.response)
              : reject(Error("Arquivo indisponível ou muito grande")),
          ),
        onerror: () => done(() => reject(Error("Falha ao carregar waveform"))),
        ontimeout: () => done(() => reject(Error("Tempo esgotado"))),
        onabort: () => done(() => reject(Error("Análise interrompida"))),
      });
      signal.addEventListener("abort", cancel, { once: true });
    });
  const response = await fetch(url, { credentials: "omit", signal });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length") || 0) > limit) throw Error("Arquivo excede 14 MB");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Stream indisponível");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) throw Error("Arquivo excede 14 MB");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}
