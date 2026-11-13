// Existing versioned context transport; no UI or DOM mutation.
export function createBridge() {
  const SOUNDGASM = /^(?:www\.)?soundgasm\.net$/i;
  const AUDIOCHAN = /^(?:www\.)?audiochan\.(?:com|net)$/i;
  const REDDIT = /^(?:[a-z0-9-]+\.)?reddit\.com$/i;
  const encodeBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let encoded = "";
    for (let index = 0; index < bytes.length; index += 8192) {
      encoded += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return btoa(encoded).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const decodeBase64 = (value) => {
    const text = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4));
    return Uint8Array.from(text, (char) => char.charCodeAt(0));
  };
  const validSub = (name) => /^[a-z0-9_]{2,32}$/i.test(String(name || ""));
  const safeReddit = (raw) => {
    try {
      const url = new URL(String(raw || ""), "https://www.reddit.com");
      return /^https?:$/.test(url.protocol) && REDDIT.test(url.hostname) && /\/comments\//.test(url.pathname)
        ? url.href
        : "";
    } catch {
      return "";
    }
  };
  function sanitize(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const subreddit = String(input.subreddit || input.sub || "").replace(/^r\//i, "");
    const permalink = safeReddit(input.permalink || input.post);
    if (!validSub(subreddit) && !permalink) return null;
    return {
      v: 2,
      subreddit: validSub(subreddit) ? subreddit : permalink.match(/\/r\/([^/]+)/)?.[1] || "",
      permalink,
      title: String(input.title || ""),
      description: String(input.description || ""),
      author: String(input.author || ""),
    };
  }
  async function pack(input) {
    const data = sanitize(input);
    if (!data) return "";
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    if (typeof CompressionStream === "function") {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
        return `z.${encodeBase64(await new Response(stream).arrayBuffer())}`;
      } catch (error) {
        console.debug("[GoneWildStudio] compression fallback", error);
      }
    }
    return `b.${encodeBase64(bytes)}`;
  }
  async function unpack(value) {
    if (!value || value.length > 500000) return null;
    try {
      const [mode, data] = [value.slice(0, 2), value.slice(2)];
      if (!data || !/^[A-Za-z0-9_-]+$/.test(data)) return null;
      const bytes = decodeBase64(data);
      let contents;
      if (mode === "z." && typeof DecompressionStream === "function") {
        const output = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        contents = await new Response(output).text();
      } else if (mode === "b.") contents = new TextDecoder().decode(bytes);
      else return null;
      if (!contents || contents.length > 250000) return null;
      return sanitize(JSON.parse(contents));
    } catch (error) {
      console.debug("[GoneWildStudio] Invalid audio context", error);
      return null;
    }
  }
  async function decorate(raw, input) {
    try {
      const url = new URL(raw);
      const context = sanitize(input);
      if (!context) return raw;
      if (AUDIOCHAN.test(url.hostname)) {
        // No UI replacement on Audiochan: only transport the original Reddit URL.
        // Use a query parameter so the website's own hash routing remains intact.
        if (context.permalink) url.searchParams.set("gws_post", context.permalink);
        return url.href;
      }
      if (!SOUNDGASM.test(url.hostname) || !/^\/u\/[^/]+\/[^/]+/.test(url.pathname)) return raw;
      url.searchParams.set("subreddit", context.subreddit);
      if (context.permalink) url.searchParams.set("permalink", context.permalink);
      const fragment = await pack(context);
      if (fragment) url.hash = `gws=${fragment}`;
      return url.href;
    } catch {
      return raw;
    }
  }
  function searchURL(rawSub, tag) {
    const subreddit = String(rawSub || "").replace(/^r\//i, "");
    const cleanedTag = String(tag || "")
      .replace(/["\\]/g, " ")
      .trim();
    if (!cleanedTag) return "";
    const scoped = validSub(subreddit);
    // Only scope to the originating subreddit when it is known. Direct
    // Soundgasm visits use Reddit's global search, never a guessed sub.
    const url = new URL(
      scoped
        ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search/`
        : "https://www.reddit.com/search/",
    );
    url.searchParams.set("q", `title:"${cleanedTag}"`);
    if (scoped) url.searchParams.set("restrict_sr", "1");
    url.searchParams.set("sort", "relevance");
    url.searchParams.set("type", "link");
    // Let the Reddit userscript rehydrate the clicked tag on arrival.
    if (scoped) {
      url.searchParams.set("gws", "1");
      url.searchParams.append("gwsTag", cleanedTag);
    }
    return url.href;
  }
  async function readLocation() {
    const params = new URL(location.href).searchParams;
    const token = location.hash.match(/(?:^#|&)gws=([^&]+)/)?.[1];
    const fromHash = token ? await unpack(decodeURIComponent(token)) : null;
    const subreddit = String(params.get("subreddit") || "").replace(/^r\//i, "");
    const permalink = safeReddit(params.get("permalink"));
    if (fromHash)
      return {
        ...fromHash,
        subreddit: fromHash.subreddit || (validSub(subreddit) ? subreddit : ""),
        permalink: fromHash.permalink || permalink,
      };
    return sanitize({ subreddit, permalink, title: "", description: "" });
  }
  return { decorate, unpack, pack, readLocation, searchURL, safeReddit, validSub };
}
