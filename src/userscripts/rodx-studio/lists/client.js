import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { NATIVE_X_SELECTORS, DOM_SELECTORS } from "../../../selectors.js";
import scope0, { css as extractedCSS1 } from "../../../styles/extracted/userscripts-rodx-studio-lists-view-1.module.css";
import { refresh } from "./render.tsx";
import { Studio } from "../core/studio-runtime.js";

export let XClientLists;

export function initializeDeckXClientLists() {
  XClientLists = (() => {
    let clientPromise;
    async function source(url) {
      const gm =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined"
            ? GM.xmlHttpRequest?.bind(GM)
            : null;
      if (!gm) {
        const response = await fetch(url);
        if (!response.ok) {
throw Error("Bundle do X: HTTP " + response.status);
}
        return response.text();
      }
      return new Promise((resolve, reject) =>
        gm({
          method: "GET",
          url,
          timeout: RUNTIME_LIMITS.listsClient.sourceTimeout,
          onload: (r) =>
            r.status === 200 ? resolve(r.responseText) : reject(Error("Bundle do X: HTTP " + r.status)),
          onerror: () => reject(Error("Não foi possível ler o cliente do X")),
          ontimeout: () => reject(Error("Tempo esgotado ao ler o cliente do X")),
        }),
      );
    }
    async function client() {
      if (clientPromise) {
return clientPromise;
}
      clientPromise = (async () => {
        const urls = [...document.scripts]
          .map((s) => s.src)
          .filter(
            (src) =>
              /^https:\/\/abs\.twimg\.com\/responsive-web\//.test(src) && /\/main\.[^/]+\.js/.test(src),
          );
        if (!urls.length) {
throw Error("Bundle principal do X não encontrado.");
}
        const text = await source(urls[0]);
        const operations = new Map();
        for (const match of text.matchAll(/queryId:["']([^"']+)["'],operationName:["']([^"']+)["']/g)) {
          const context = text.slice(match.index, match.index + 5000);
          const featureText = context.match(/featureSwitches:\[([^\]]*)\]/)?.[1] || "";
          const features = Object.fromEntries(
            [...featureText.matchAll(/["']([^"']+)["']/g)].map((m) => [m[1], false]),
          );
          operations.set(match[2], {
            id: match[1],
            features,
          });
        }
        return {
          operations,
        };
      })().catch((error) => {
        clientPromise = null;
        throw error;
      });
      return clientPromise;
    }
    async function api(path, params, signal) {
      const result = await Studio.net.request(path, {
        params,
        signal,
      });
      if (result.status < 200 || result.status >= 300)
        {
throw Error(result.error || "Listas: HTTP " + result.status);
}
      if (result.data?.errors?.length) {
throw Error(result.data.errors.map((e) => e.message).join("; "));
}
      return result.data;
    }
    async function query(name, variables, signal) {
      const c = await client(),
        op = c.operations.get(name);
      if (!op) {
throw Error("Operação " + name + " não encontrada no cliente atual do X.");
}
      return api(
        "/i/api/graphql/" + op.id + "/" + name,
        {
          variables,
          features: op.features,
        },
        signal,
      );
    }
    async function memberships(handle, signal) {
      const user = await query(
        "UserByScreenName",
        {
          screen_name: handle,
          withSafetyModeUserFields: true,
        },
        signal,
      );
      const id = user.data?.user?.result?.rest_id;
      if (!id) {
throw Error("ID do perfil não encontrado.");
}
      const lists = new Map();
      let cursor,
        pages = 0;
      do {
        const response = await query(
          "ListMemberships",
          {
            userId: id,
            count: 50,
            ...(cursor
              ? {
                  cursor,
                }
              : {}),
          },
          signal,
        );
        let next;
        function walk(node) {
          if (!node || typeof node !== "object") {
return;
}
          if (node.__typename === "List" || node.list?.__typename === "List") {
            const value = node.list || node;
            const id = value.id_str || value.rest_id;
            const name = value.name;
            if (id && name)
              {
lists.set(String(id), {
                id: String(id),
                name: String(name),
              });
}
          }
          if (node.cursorType === "Bottom") {
next = node.value;
}
          Object.values(node).forEach((value) => (Array.isArray(value) ? value.forEach(walk) : walk(value)));
        }
        walk(response);
        if (!next || next === cursor) {
break;
}
        cursor = next;
      } while (++pages < 10);
      return [...lists.values()];
    }
    async function legacyMemberships(handle, signal) {
      let cursor = "-1";
      const lists = new Map();
      for (let page = 0; page < 10 && cursor !== "0"; page++) {
        const url = new URL("/i/api/1.1/lists/memberships.json", location.origin);
        url.search = new URLSearchParams({
          screen_name: handle,
          count: "200",
          cursor,
        }).toString();
        const data = await api(url.pathname, Object.fromEntries(url.searchParams), signal);
        if (!Array.isArray(data.lists))
          {
throw Error(data.errors?.[0]?.message || "Resposta de listas inesperada.");
}
        for (const list of data.lists) {
          const id = String(list.id_str || "");
          if (id && list.name)
            {
lists.set(id, {
              id,
              name: list.name,
            });
}
        }
        const next = String(data.next_cursor_str || "0");
        if (next === cursor) {
break;
}
        cursor = next;
      }
      return [...lists.values()];
    }
    async function read(handle, signal) {
      try {
        return await memberships(handle, signal);
      } catch (first) {
        if (signal?.aborted) {
throw first;
}
        try {
          return await legacyMemberships(handle, signal);
        } catch (second) {
          throw Error(first.message + " / " + second.message);
        }
      }
    }
    return {
      memberships: read,
    };
  })();
}


// Consolidated Lists View Shadow Host
  css as extractedCSS1,
} from "../../../styles/extracted/userscripts-rodx-studio-lists-view-1.module.css";

export let refreshScheduled;

export function initializeListsRefreshScheduled() {
  refreshScheduled = false;
}

export function scheduleRefresh() {
  if (refreshScheduled) {
return;
}
  refreshScheduled = true;
  setTimeout(() => {
    refreshScheduled = false;
    refresh();
  }, RUNTIME_LIMITS.listsView.scheduleRefreshDelayMs);
}

export let host;

export function initializeListsHost() {
  host = document.createElement("div");
}

export function initializeRodX_lists_74() {
  host.id = "x-lists-studio-root";
}

export let shadow;

export function initializeListsShadow() {
  shadow = host.attachShadow({
    mode: "open",
  });
}

export let style;

export function initializeListsStyle() {
  style = document.createElement("style");
}

export function initializeRodX_lists_77() {
  style.textContent = extractedCSS1;
}

export const componentClasses = Object.assign({}, scope0);

// Consolidated Lists Name Discovery
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
      if (quoted) {
text = quoted[1];
}
      else if (text.includes(" / ")) {
text = text.split(" / ").at(-1);
}
      text = text.replace(/\s*\(@[A-Za-z0-9_]+\)\s*$/, "");
    }
    text = text.replace(/^(?:view list|open list|ver lista|abrir lista)\s*:?\s*/i, "");
    if (
      /^@|https?:|^(?:X|Twitter|Lists?|Listas?|For you|Para você|Home|Início|Members|Membros|Pinned|Fixadas|Suggested Lists|Listas sugeridas)$/i.test(
        text,
      )
    )
      {
return "";
}
    return clean(text);
  }
  function add(id, value, source, evidence) {
    const label = name(value, source !== "card");
    if (id && label && !result.has(id))
      {
result.set(id, { id, name: label, nameSource: source, nameEvidence: evidence });
}
  }
  for (const anchor of document.querySelectorAll(NATIVE_X_SELECTORS.listLinks)) {
    if (anchor.closest(NATIVE_X_SELECTORS.articleUserCellsOrOwnedRoot(own))) {
continue;
}
    const id = idOf(anchor.getAttribute("href"));
    if (!id) {
continue;
}
    const heading = anchor.querySelector(NATIVE_X_SELECTORS.listCardHeadings);
    const leaves = [...anchor.querySelectorAll(DOM_SELECTORS.autoDirectionText)].filter(
      (el) => !el.children.length,
    );
    const candidates = [
      heading?.textContent,
      anchor.getAttribute("title"),
      anchor.getAttribute("aria-label"),
      ...leaves.map((el) => el.textContent),
    ];
    if (!anchor.children.length) {
candidates.push(anchor.textContent);
}
    const combined = anchor.textContent || "";
    const firstLine = combined.match(/^(.*?)\s*[·•]\s*[\d.,]+\s*(?:membros?|members?)/i)?.[1];
    const label = name(firstLine) || candidates.map((v) => name(v)).find(Boolean);
    if (label) {
add(id, label, "card", new URL(anchor.getAttribute("href"), url).pathname);
}
  }
  const routeId = idOf(url.href);
  if (routeId && !/\/(members|followers)\/?$/.test(url.pathname)) {
    const primary =
      document.querySelector(NATIVE_X_SELECTORS.primaryColumn) ||
      document.querySelector(DOM_SELECTORS.mainElement);
    const headings = [...(primary?.querySelectorAll(NATIVE_X_SELECTORS.listPageHeadings) || [])].filter(
      (el) => !el.closest(DOM_SELECTORS.articleOrOwnedRoot(own)) && !el.closest(NATIVE_X_SELECTORS.listLinks),
    );
    const heading = headings.map((el) => name(el.textContent)).find(Boolean) || "";
    const canonical = document.querySelector(DOM_SELECTORS.canonicalLink)?.href;
    const metaUrl = document.querySelector(DOM_SELECTORS.openGraphUrl)?.content;
    const bound = idOf(canonical || metaUrl || "") === routeId;
    const titles = [
      document.querySelector(DOM_SELECTORS.openGraphTitle)?.content,
      document.querySelector(DOM_SELECTORS.twitterTitle)?.content,
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
