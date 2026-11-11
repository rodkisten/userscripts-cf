// Standalone lab: no bindings, credentials, writable API or user data.
const assets = __ASSETS__;
const manifest = __MANIFEST__;
const broken = __BROKEN__;
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    const headers = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    let body,
      status = 200;
    headers.set("Content-Type", "application/json; charset=utf-8");
    if (url.pathname === "/manifest.json") body = JSON.stringify(manifest);
    else if (url.pathname === "/manifest-bad.json") body = JSON.stringify(broken);
    else if (url.pathname === "/manifest-unavailable.json") {
      status = 503;
      body = JSON.stringify({ error: "Controlled network failure fixture" });
    } else if (assets[url.pathname] !== undefined) {
      body = assets[url.pathname];
      headers.set("Content-Type", "application/javascript; charset=utf-8");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (url.pathname === "/")
      body = JSON.stringify({
        name: "RodX Loader Lab",
        release: manifest.release,
        manifest: "/manifest.json",
      });
    else {
      status = 404;
      body = JSON.stringify({ error: "Not found" });
    }
    return new Response(request.method === "HEAD" ? null : body, {
      status,
      headers,
    });
  },
};
