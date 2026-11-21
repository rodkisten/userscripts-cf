// Cloudflare Worker: private R2-backed installers and a live catalog.
const types = { js: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml", html: "text/html; charset=utf-8" };
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reply = (body, type = "html", status = 200) => new Response(body, { status, headers: { "content-type": types[type], "x-content-type-options": "nosniff", "cache-control": type === "html" || type === "json" ? "no-store" : "public, max-age=60" } });
async function previews(bucket) {
  const found = []; let cursor;
  do {
    const page = await bucket.list({ prefix: "prs/", delimiter: "/", cursor, limit: 1000 });
    for (const prefix of page.delimitedPrefixes || []) {
      const m = /^prs\/(\d+)\/$/.exec(prefix);
      if (!m) continue;
      const object = await bucket.get(prefix + "manifest.json");
      if (!object) continue;
      try {
        const data = await object.json();
        if (data.pr === Number(m[1]) && Array.isArray(data.scripts)) found.push(data);
      } catch { /* ignore incomplete previews */ }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return found.sort((a, b) => b.pr - a.pr);
}
export default {
  async fetch(request, env) {
    if (request.method === "PUT" || request.method === "DELETE") {
      if (!env.PREVIEW_UPLOAD_TOKEN || request.headers.get("authorization") !== "Bearer " + env.PREVIEW_UPLOAD_TOKEN) return reply("Unauthorized", "html", 401);
      const path = new URL(request.url).pathname;
      const upload = /^\/_publish\/(\d+)\/([a-z][a-z0-9-]*\.(?:user|meta)\.js|manifest\.json|index\.html|icons\/pr\.svg)$/.exec(path);
      const remove = /^\/_publish\/(\d+)$/.exec(path);
      if (request.method === "PUT" && upload && Number(upload[1]) > 0) {
        await env.PREVIEWS.put("prs/" + Number(upload[1]) + "/" + upload[2], request.body);
        return reply("Stored", "html", 201);
      }
      if (request.method === "DELETE" && remove && Number(remove[1]) > 0) {
        const prefix = "prs/" + Number(remove[1]) + "/";
        let cursor;
        do {
          const batch = await env.PREVIEWS.list({ prefix, cursor, limit: 1000 });
          await Promise.all(batch.objects.map(o => env.PREVIEWS.delete(o.key)));
          cursor = batch.truncated ? batch.cursor : undefined;
        } while (cursor);
        return reply("Removed");
      }
      return reply("Invalid publication path", "html", 400);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return reply("Method not allowed", "html", 405);
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/manifest.json") {
      const items = await previews(env.PREVIEWS);
      if (url.pathname === "/manifest.json") return reply(JSON.stringify({ previews: items }), "json");
      const cards = items.map(p => `<article><h2><a href="/${p.pr}/">▲ PR #${p.pr}</a></h2><p>${p.scripts.length} scripts</p><ul>${p.scripts.map(s => `<li><a href="/${p.pr}/${encodeURIComponent(s.file)}">${escape(s.name)}</a></li>`).join("")}</ul></article>`).join("");
      const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Userscripts · PR Previews</title><style>body{background:#09090b;color:#fafafa;font:15px system-ui;max-width:840px;margin:48px auto;padding:0 20px}a{color:#c4b5fd}article{padding:18px;border:1px solid #27272a;border-radius:12px;margin:12px 0}input{padding:12px;background:#18181b;color:white;border:1px solid #52525b;border-radius:8px;width:95%}</style><h1>▲ Userscripts · PR Previews</h1><p>Previews instaláveis por pull request</p><input type="search" id="q" placeholder="Buscar script ou PR" aria-label="Buscar"><main>${cards || "<p>Nenhuma preview publicada.</p>"}</main><script>document.getElementById("q").addEventListener("input",e=>{document.querySelectorAll("article").forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(e.target.value.toLowerCase()))})</script></html>`;
      return reply(request.method === "HEAD" ? null : html);
    }
    const m = /^\/(\d+)\/(?:([a-z][a-z0-9-]*\.(?:user|meta)\.js|manifest\.json|index\.html)|(icons\/pr\.svg))$/.exec(url.pathname) || /^\/(\d+)\/?$/.exec(url.pathname);
    if (!m || !Number.isSafeInteger(Number(m[1])) || Number(m[1]) < 1) return reply("Not found", "html", 404);
    const file = m[2] || m[3] || "index.html";
    const object = await env.PREVIEWS.get(`prs/${Number(m[1])}/${file}`);
    if (!object) return reply("Not found", "html", 404);
    const type = file.endsWith(".js") ? "js" : file.endsWith(".json") ? "json" : file.endsWith(".svg") ? "svg" : "html";
    return reply(request.method === "HEAD" ? null : object.body, type);
  }
};
