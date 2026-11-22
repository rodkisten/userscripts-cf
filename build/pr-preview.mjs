import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const number = Number(process.env.PR_NUMBER || process.env.GITHUB_PR_NUMBER);
if (!Number.isSafeInteger(number) || number < 1) throw Error("PR_NUMBER must be a positive integer");
const origin = (process.env.USERSCRIPTS_PREVIEW_URL || "https://userscripts.preview.migos.club").replace(
  /\/$/,
  "",
);
const base = new URL(origin);
if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash)
  throw Error("Invalid preview origin");
const prefix = process.env.USERSCRIPTS_PREVIEW_ROOT === "true" ? "" : `/${number}`;
const output = path.join(dist, "pr-preview", String(number));
const manifest = JSON.parse(await fs.readFile(path.join(dist, "manifest.json"), "utf8"));
const escapeXML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char],
  );
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M64 8 122 112H6Z" fill="#f59e0b" stroke="#18181b" stroke-width="5" stroke-linejoin="round"/><text x="64" y="88" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${String(number).length > 4 ? 23 : 34}" fill="#18181b">${escapeXML(number)}</text></svg>`;
await fs.mkdir(path.join(output, "icons"), { recursive: true });
await fs.writeFile(path.join(output, "icons", "pr.svg"), icon);
const catalog = { channel: "pr-preview", pr: number, baseURL: origin + prefix, scripts: [] };
for (const item of manifest.scripts) {
  const file = `${item.id}.user.js`;
  const metaFile = `${item.id}.meta.js`;
  const original = await fs.readFile(path.join(dist, item.file), "utf8");
  const marker = "// ==/UserScript==";
  const end = original.indexOf(marker);
  if (end < 0) throw Error("Missing userscript metadata: " + item.file);
  let metadata = original.slice(0, end + marker.length);
  const replace = (key, value) => {
    const line = new RegExp(`^// @${key}\\s+.*$`, "m");
    if (line.test(metadata)) metadata = metadata.replace(line, `// @${key.padEnd(12)} ${value}`);
    else metadata = metadata.replace(marker, `// @${key.padEnd(12)} ${value}\n${marker}`);
  };
  replace("name", `#${number} ${item.name}`);
  replace("namespace", `${origin}/pr/${number}/${item.id}`);
  replace("icon", `${origin}${prefix}/icons/pr.svg`);
  replace("updateURL", `${origin}${prefix}/${metaFile}`);
  replace("downloadURL", `${origin}${prefix}/${file}`);
  const source = metadata + original.slice(end + marker.length);
  await fs.writeFile(path.join(output, file), source);
  await fs.writeFile(path.join(output, metaFile), metadata + "\n");
  catalog.scripts.push({
    id: item.id,
    name: `#${number} ${item.name}`,
    file,
    metaFile,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
}
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(catalog, null, 2) + "\n");
const data = JSON.stringify(catalog).replace(/</g, "\\u003c");
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#09090b"><title>#${number} · Userscripts Preview</title><style>body{font:15px system-ui;background:#09090b;color:#fafafa;max-width:780px;margin:48px auto;padding:0 20px}h1{font-size:28px}p{color:#a1a1aa}article{border:1px solid #27272a;border-radius:12px;padding:16px;margin:12px 0;display:flex;justify-content:space-between;gap:16px;align-items:center}a{color:#d4d4d8}article a{background:#fafafa;color:#09090b;padding:10px 14px;border-radius:8px;text-decoration:none;white-space:nowrap}@media(max-width:480px){article{align-items:flex-start;flex-direction:column}}</style><h1>▲ Preview #${number}</h1><p>Instaladores isolados deste pull request. Não substituem a versão estável.</p><main id="scripts"></main><script>const catalog=${data};document.getElementById("scripts").replaceChildren(...catalog.scripts.map(s=>{const row=document.createElement("article");const title=document.createElement("strong");title.textContent=s.name;const link=document.createElement("a");link.textContent="Instalar ↗";link.href="./"+encodeURIComponent(s.file);row.append(title,link);return row;}));</script></html>`;
await fs.writeFile(path.join(output, "index.html"), html);
console.log(`Generated ${catalog.scripts.length} installers for PR #${number} in ${output}`);
