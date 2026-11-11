import { CSS_SELECTORS } from "../../../selectors.js";
export function discoverListNames(document, href, clean) {
  const result = new Map(),
    url = new URL(href);
  const idOf = (value) => {
    try {
      const u = new URL(value, url);
      return u.origin === url.origin
        ? u.pathname.match(/^\/(?:(?:i|[A-Za-z0-9_]{1,15})\/)?lists\/(\d+)(?:\/|$)/)?.[1] || ""
        : "";
    } catch {
      return "";
    }
  };
  const own = '[id^="rodx-"],#x-lists-studio-root,#xls-homebar,#xls-list-toolbar';
  function name(value, title = false) {
    let text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (title) {
      text = text.replace(/^\(\d+\)\s*/, "").replace(/\s*(?:\/|\||[-–—])\s*(?:X|Twitter)\s*$/i, "");
      const quoted = text.match(/[“"]([^”"]+)[”"]/);
      if (quoted) text = quoted[1];
      else if (text.includes(" / ")) text = text.split(" / ").at(-1);
      text = text.replace(/\s*\(@[A-Za-z0-9_]+\)\s*$/, "");
    }
    text = text.replace(/^(?:view list|open list|ver lista|abrir lista)\s*:?\s*/i, "");
    if (
      /^@|https?:|^(?:X|Twitter|Lists?|Listas?|For you|Para você|Home|Início|Members|Membros|Pinned|Fixadas|Suggested Lists|Listas sugeridas)$/i.test(
        text,
      )
    )
      return "";
    return clean(text);
  }
  function add(id, value, source, evidence) {
    const label = name(value, source !== "card");
    if (id && label && !result.has(id))
      result.set(id, { id, name: label, nameSource: source, nameEvidence: evidence });
  }
  for (const anchor of document.querySelectorAll(CSS_SELECTORS.s096)) {
    if (anchor.closest(CSS_SELECTORS.s298(own))) continue;
    const id = idOf(anchor.getAttribute("href"));
    if (!id) continue;
    const heading = anchor.querySelector(CSS_SELECTORS.s109);
    const leaves = [...anchor.querySelectorAll(CSS_SELECTORS.s110)].filter((el) => !el.children.length);
    const candidates = [
      heading?.textContent,
      anchor.getAttribute("title"),
      anchor.getAttribute("aria-label"),
      ...leaves.map((el) => el.textContent),
    ];
    if (!anchor.children.length) candidates.push(anchor.textContent);
    const combined = anchor.textContent || "";
    const firstLine = combined.match(/^(.*?)\s*[·•]\s*[\d.,]+\s*(?:membros?|members?)/i)?.[1];
    const label = name(firstLine) || candidates.map((v) => name(v)).find(Boolean);
    if (label) add(id, label, "card", new URL(anchor.getAttribute("href"), url).pathname);
  }
  const routeId = idOf(url.href);
  if (routeId && !/\/(members|followers)\/?$/.test(url.pathname)) {
    const primary = document.querySelector(CSS_SELECTORS.s031) || document.querySelector(CSS_SELECTORS.s094);
    const headings = [...(primary?.querySelectorAll(CSS_SELECTORS.s111) || [])].filter(
      (el) => !el.closest(CSS_SELECTORS.s299(own)) && !el.closest(CSS_SELECTORS.s096),
    );
    const heading = headings.map((el) => name(el.textContent)).find(Boolean) || "";
    const canonical = document.querySelector(CSS_SELECTORS.s112)?.href;
    const metaUrl = document.querySelector(CSS_SELECTORS.s113)?.content;
    const bound = idOf(canonical || metaUrl || "") === routeId;
    const titles = [
      document.querySelector(CSS_SELECTORS.s114)?.content,
      document.querySelector(CSS_SELECTORS.s115)?.content,
      document.title,
    ]
      .map((v) => name(v, true))
      .filter(Boolean);
    // A matching heading corroborates metadata when the SPA canonical is temporarily stale.
    const corroborated = heading && titles.includes(heading);
    if (heading) {
      result.set(routeId, {
        id: routeId,
        name: heading,
        nameSource: "page",
        nameEvidence: url.pathname,
        corroborated: Boolean(corroborated),
      });
    } else if (bound && titles.length) {
      result.set(routeId, {
        id: routeId,
        name: titles[0],
        nameSource: "metadata",
        nameEvidence: url.pathname,
        corroborated: true,
      });
    }
  }
  return [...result.values()];
}
