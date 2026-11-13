import { extractLinks, parseTags, safeURL, type Post } from "./domain.ts";
export function readPost(node: Element, routeSub: string): Post | null {
  const host = node.matches("shreddit-post") ? node : node.querySelector("shreddit-post") || node;
  const link = node.querySelector<HTMLAnchorElement>('a[href*="/comments/"]');
  const href = host.getAttribute("data-gws-url") || host.getAttribute("permalink") || link?.href || "";
  const rawId =
    host.getAttribute("data-fullname") ||
    host.id ||
    host.getAttribute("post-id") ||
    host.getAttribute("thingid") ||
    host.getAttribute("data-post-id") ||
    href;
  const match = rawId.match(/(?:t3_|post-|\/comments\/)([a-z0-9]{5,12})(?:\b|\/|$)/i);
  const id = match ? `t3_${match[1]}` : /^[a-z0-9]{5,12}$/i.test(rawId) ? `t3_${rawId}` : "";
  const title =
    host.getAttribute("data-gws-title") ||
    host.getAttribute("post-title") ||
    node
      .querySelector(
        '[data-testid="post-title-text"], a[data-testid="post-title"], [data-testid="post-title"], [slot="title"], h3, a.title, a[id^="post-title"]',
      )
      ?.textContent?.trim() ||
    link?.textContent?.trim() ||
    "";
  if (!id || !title) return null;
  const sub = (
    host.getAttribute("data-gws-sub") ||
    host.getAttribute("subreddit-prefixed-name") ||
    host.getAttribute("subreddit-name") ||
    href.match(/\/r\/([^/]+)/)?.[1] ||
    routeSub
  ).replace(/^r\//i, "");
  const tags = parseTags(title);
  if (
    (host.hasAttribute("nsfw") ||
      host.hasAttribute("over-18") ||
      node.querySelector('[slot="nsfw-badge"], [data-testid="nsfw-badge"]')) &&
    !tags.some((tag) => /^nsfw$/i.test(tag))
  )
    tags.push("NSFW");
  return {
    id,
    title,
    sub,
    href:
      safeURL(href)?.href ||
      new URL(`/r/${encodeURIComponent(sub)}/comments/${id.slice(3)}/`, location.origin).href,
    author: host.getAttribute("author") || "",
    body: "",
    tags,
    links: [
      ...new Set(
        [...node.querySelectorAll<HTMLAnchorElement>("a[href]")]
          .flatMap((anchor) => extractLinks(anchor.href))
          .concat(
            extractLinks(node.textContent || ""),
            extractLinks(host.getAttribute("content-href") || ""),
          ),
      ),
    ],
  };
}
