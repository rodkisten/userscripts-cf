export function createHandler(assets, info) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", { status: 405, headers });
      let body,
        status = 200;
      if (url.pathname === "/") {
        headers.set("Content-Type", "application/json; charset=utf-8");
        body = JSON.stringify(info, null, 2);
      } else {
        const file = url.pathname.slice(1);
        if (!Object.hasOwn(assets, file)) {
          status = 404;
          body = "Not found";
          headers.set("Content-Type", "text/plain; charset=utf-8");
        } else {
          body = assets[file];
          headers.set(
            "Content-Type",
            file.endsWith(".js")
              ? "application/javascript; charset=utf-8"
              : file.endsWith(".json")
                ? "application/json; charset=utf-8"
                : "text/plain; charset=utf-8",
          );
        }
      }
      return new Response(request.method === "HEAD" ? null : body, { status, headers });
    },
  };
}
