import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { Studio } from "../core/studio.js";

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
        if (!response.ok) throw Error("Bundle do X: HTTP " + response.status);
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
      if (clientPromise) return clientPromise;
      clientPromise = (async () => {
        const urls = [...document.scripts]
          .map((s) => s.src)
          .filter(
            (src) =>
              /^https:\/\/abs\.twimg\.com\/responsive-web\//.test(src) && /\/main\.[^/]+\.js/.test(src),
          );
        if (!urls.length) throw Error("Bundle principal do X não encontrado.");
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
        throw Error(result.error || "Listas: HTTP " + result.status);
      if (result.data?.errors?.length) throw Error(result.data.errors.map((e) => e.message).join("; "));
      return result.data;
    }
    async function query(name, variables, signal) {
      const c = await client(),
        op = c.operations.get(name);
      if (!op) throw Error("Operação " + name + " não encontrada no cliente atual do X.");
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
      if (!id) throw Error("ID do perfil não encontrado.");
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
          if (!node || typeof node !== "object") return;
          if (node.__typename === "List" || node.list?.__typename === "List") {
            const value = node.list || node;
            const id = value.id_str || value.rest_id;
            const name = value.name;
            if (id && name)
              lists.set(String(id), {
                id: String(id),
                name: String(name),
              });
          }
          if (node.cursorType === "Bottom") next = node.value;
          Object.values(node).forEach((value) => (Array.isArray(value) ? value.forEach(walk) : walk(value)));
        }
        walk(response);
        if (!next || next === cursor) break;
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
          throw Error(data.errors?.[0]?.message || "Resposta de listas inesperada.");
        for (const list of data.lists) {
          const id = String(list.id_str || "");
          if (id && list.name)
            lists.set(id, {
              id,
              name: list.name,
            });
        }
        const next = String(data.next_cursor_str || "0");
        if (next === cursor) break;
        cursor = next;
      }
      return [...lists.values()];
    }
    async function read(handle, signal) {
      try {
        return await memberships(handle, signal);
      } catch (first) {
        if (signal?.aborted) throw first;
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
