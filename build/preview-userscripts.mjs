import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(await fs.readFile(path.join(dist, "manifest.json"), "utf8"));
const baseURL = manifest.baseURL.replace(/\/$/, "");
const icon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#09090b"/><rect x="7" y="7" width="114" height="114" rx="18" fill="none" stroke="#71717a" stroke-width="3"/><text x="64" y="77" text-anchor="middle" font-family="Arial,sans-serif" font-size="39" font-weight="bold" fill="#fff">PRE</text></svg>';
await fs.mkdir(path.join(dist, "icons"), { recursive: true });
await fs.writeFile(path.join(dist, "icons", "preview.svg"), icon);
const preview = { ...manifest, channel: "preview", scripts: [] };
for (const item of manifest.scripts) {
  const file = item.id + ".preview.user.js";
  const metaFile = item.id + ".preview.meta.js";
  const original = await fs.readFile(path.join(dist, item.file), "utf8");
  const separator = "// ==/UserScript==";
  const end = original.indexOf(separator);
  if (end < 0) throw Error("Missing metadata in " + item.file);
  const metadata = original
    .slice(0, end + separator.length)
    .replace(/^\/\/ @name\s+(.+)$/m, (_, name) => "// @name         [PRE] " + name)
    .replace(/^\/\/ @namespace\s+(.+)$/m, (_, ns) => "// @namespace    " + ns.replace(/\/$/, "") + "/preview")
    .replace(/^\/\/ @icon\s+.+$/m, "// @icon         " + baseURL + "/icons/preview.svg")
    .replace(/^\/\/ @updateURL\s+.+$/m, "// @updateURL    " + baseURL + "/" + metaFile)
    .replace(/^\/\/ @downloadURL\s+.+$/m, "// @downloadURL  " + baseURL + "/" + file);
  const body = metadata + original.slice(end + separator.length);
  const meta = metadata + "\n";
  await fs.writeFile(path.join(dist, file), body);
  await fs.writeFile(path.join(dist, metaFile), meta);
  preview.scripts.push({
    ...item,
    name: "[PRE] " + item.name,
    file,
    metaFile,
    sha256: createHash("sha256").update(body).digest("hex"),
    metaSha256: createHash("sha256").update(meta).digest("hex"),
  });
}
await fs.writeFile(path.join(dist, "preview-manifest.json"), JSON.stringify(preview, null, 2) + "\n");
console.log("Prepared " + preview.scripts.length + " isolated preview installers.");
