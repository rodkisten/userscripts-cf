// The page-world boundary must remain serializable and independent of Solid.
export function pageNetworkShim(configKey, seenKey) {
  "use strict";
  if (window.__gwsNetworkInstalled) return;
  Object.defineProperty(window, "__gwsNetworkInstalled", { value: true, configurable: true });
  const load = (key, defaultValue) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };
  const enabled = (cfg, sr) =>
    (cfg.subreddits || []).some((s) => s.toLowerCase() === (sr || "").toLowerCase());
  const idOf = (v) => {
    const source = String(v || "");
    const match = source.match(/(?:t3_|post-|\/comments\/)([a-z0-9]{5,12})\b/i);
    if (match) return `t3_${match[1].toLowerCase()}`;
    return /^[a-z0-9]{5,12}$/i.test(source) ? `t3_${source.toLowerCase()}` : "";
  };
  const isAd = (node) =>
    !!(
      node &&
      (node.promoted === true ||
        node.is_promoted === true ||
        node.isSponsored === true ||
        node.is_sponsored === true ||
        node.adType ||
        node.ad_type)
    );
  function mutateJSON(data, cfg, seen, sr) {
    let removed = 0;
    const skip = (item) => {
      const itemData = item?.data || item;
      if (cfg.removeAds && (isAd(item) || isAd(itemData))) return true;
      if (!cfg.hideSeen || !cfg.networkFilter) return false;
      const name = itemData?.subreddit || sr;
      const id = idOf(itemData?.name || itemData?.id || itemData?.permalink);
      return enabled(cfg, name) && id && !!seen[id];
    };
    const walk = (node, depth = 0) => {
      if (!node || typeof node !== "object" || depth > 8) return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child, depth + 1);
        return;
      }
      // Limit mutation to standard Reddit Listing nodes, not arbitrary API objects.
      if (node.kind === "Listing" && Array.isArray(node.data?.children)) {
        const prior = node.data.children.length;
        node.data.children = node.data.children.filter((child) => !skip(child));
        removed += prior - node.data.children.length;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "children" || (key === "data" && node.kind === "Listing")) continue;
        if (typeof value === "object" && value) walk(value, depth + 1);
      }
      if (node.kind === "Listing" && node.data) walk(node.data, depth + 1);
    };
    walk(data);
    return removed;
  }
  function mutateHTML(html, cfg, seen, sr) {
    if (!html.includes("shreddit-post") && !html.includes("promoted")) return null;
    const template = document.createElement("template");
    template.innerHTML = html;
    let removed = 0;
    template.content.querySelectorAll("shreddit-post").forEach((post) => {
      const node = post.closest("article") || post;
      const name =
        post.getAttribute("subreddit-prefixed-name")?.replace(/^r\//i, "") ||
        post.getAttribute("subreddit-name") ||
        sr;
      const id = idOf(
        post.getAttribute("id") ||
          post.getAttribute("post-id") ||
          post.getAttribute("thingid") ||
          post.getAttribute("permalink"),
      );
      const ad =
        ["promoted", "is-promoted", "ad-type"].some((x) => post.hasAttribute(x)) ||
        /\bPromoted\b/i.test(post.getAttribute("post-type") || "");
      if ((cfg.removeAds && ad) || (cfg.hideSeen && cfg.networkFilter && enabled(cfg, name) && !!seen[id])) {
        node.remove();
        removed++;
      }
    });
    template.content.querySelectorAll("shreddit-ad-post, shreddit-ad, reddit-ad").forEach((el) => {
      if (cfg.removeAds) {
        (el.closest("article") || el).remove();
        removed++;
      }
    });
    return removed ? template.innerHTML : null;
  }
  const qualifies = (url, method) => {
    try {
      const u = new URL(url, location.href);
      if (!/^(?:GET|HEAD)$/i.test(method || "GET") || u.origin !== location.origin) return null;
      if (
        !/(?:\/svc\/shreddit\/|\/search(?:\.json)?(?:\/|\?)|\/(?:hot|new|top|rising|controversial|comments)(?:\/|\.json)|\.json(?:\?|$))/i.test(
          u.pathname + u.search,
        )
      )
        return null;
      return u;
    } catch {
      return null;
    }
  };
  const originalFetch = window.fetch;
  window.fetch = async function (request, init) {
    const url = typeof request === "string" || request instanceof URL ? String(request) : request?.url;
    const method = init?.method || request?.method || "GET";
    const response = await Reflect.apply(originalFetch, this, arguments);
    const u = qualifies(url, method);
    if (!u || !response.ok || response.type === "opaque" || response.bodyUsed) return response;
    const cfg = load(configKey, {});
    if (!cfg.removeAds && !(cfg.hideSeen && cfg.networkFilter)) return response;
    const seen = load(seenKey, {});
    const sr = u.pathname.match(/\/r\/([^/]+)/)?.[1] || u.searchParams.get("name") || "";
    const type = response.headers.get("content-type") || "";
    try {
      if (/json/i.test(type)) {
        const data = await response.clone().json();
        if (!mutateJSON(data, cfg, seen, sr)) return response;
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      if (/html/i.test(type) && /\/svc\/shreddit\//.test(u.pathname)) {
        const html = await response.clone().text();
        const mutated = mutateHTML(html, cfg, seen, sr);
        if (mutated == null) return response;
        return new Response(mutated, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    } catch {
      /* Return original response intact. */
    }
    return response;
  };
  // XHR also carries listing data on some Reddit builds. This hook is best-effort.
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__gwsURL = url;
    this.__gwsMethod = method;
    return Reflect.apply(open, this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const xhr = this;
    const u = qualifies(xhr.__gwsURL, xhr.__gwsMethod);
    if (u)
      xhr.addEventListener(
        "readystatechange",
        () => {
          if (
            xhr.readyState !== 4 ||
            (xhr.responseType && xhr.responseType !== "text") ||
            xhr.status < 200 ||
            xhr.status >= 300
          )
            return;
          try {
            const cfg = load(configKey, {});
            const body = xhr.responseText;
            if (!body || !/json/i.test(xhr.getResponseHeader("content-type") || "")) return;
            const data = JSON.parse(body);
            const sr = u.pathname.match(/\/r\/([^/]+)/)?.[1] || "";
            if (!mutateJSON(data, cfg, load(seenKey, {}), sr)) return;
            const rewritten = JSON.stringify(data);
            Object.defineProperty(xhr, "responseText", { configurable: true, get: () => rewritten });
            Object.defineProperty(xhr, "response", { configurable: true, get: () => rewritten });
          } catch {
            /* Keep native XHR behavior on unsupported builds. */
          }
        },
        true,
      );
    return Reflect.apply(send, this, arguments);
  };
  const wrappedFetch = window.fetch;
  const wrappedOpen = XMLHttpRequest.prototype.open;
  const wrappedSend = XMLHttpRequest.prototype.send;
  document.addEventListener(
    "gws:network-dispose",
    () => {
      // Do not overwrite another extension's wrappers installed after ours.
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      if (XMLHttpRequest.prototype.open === wrappedOpen) XMLHttpRequest.prototype.open = open;
      if (XMLHttpRequest.prototype.send === wrappedSend) XMLHttpRequest.prototype.send = send;
      delete window.__gwsNetworkInstalled;
    },
    { once: true },
  );
  document.dispatchEvent(new CustomEvent("gws:network-ready"));
}

// The only script-element creation is this explicit page-world/CSP boundary.
export function installNetwork(configKey, seenKey) {
  let ready = false,
    blobURL = "",
    pending;
  const markReady = () => {
    ready = true;
  };
  document.addEventListener("gws:network-ready", markReady);
  const source = `;(${pageNetworkShim.toString()})(${JSON.stringify(configKey)},${JSON.stringify(seenKey)});`;
  const inject = (url) => {
    const script = document.createElement("script");
    if (url) {
      script.src = url;
      script.onload = script.onerror = () => {
        script.remove();
        URL.revokeObjectURL(url);
      };
    } else script.textContent = source;
    document.documentElement.append(script);
    if (!url) script.remove();
    else pending = script;
  };
  try {
    inject();
  } catch {
    /* CSP may require the blob fallback. */
  }
  const timer = setTimeout(() => {
    if (!ready) {
      blobURL = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      try {
        inject(blobURL);
      } catch {
        URL.revokeObjectURL(blobURL);
      }
    }
  }, 250);
  return () => {
    clearTimeout(timer);
    pending?.remove();
    if (blobURL) URL.revokeObjectURL(blobURL);
    document.removeEventListener("gws:network-ready", markReady);
    document.dispatchEvent(new CustomEvent("gws:network-dispose"));
  };
}
