import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(await fs.readFile(path.join(dist, "manifest.json"), "utf8"));
const assets = {};
for (const file of await fs.readdir(dist)) {
  if (!/^(?:[a-z][a-z0-9-]*\.(?:user|meta)\.js|manifest\.json|SHA256SUMS)$/.test(file)) continue;
  assets[file] = await fs.readFile(path.join(dist, file), "utf8");
}
const code = `import {createHandler} from './handler.js';
const assets=${JSON.stringify(assets)};
const info=${JSON.stringify({ name: "Userscripts CF", version: manifest.version, baseURL: manifest.baseURL, downloads: manifest.scripts.map((s) => ({ id: s.id, install: manifest.baseURL + "/" + s.file, update: manifest.baseURL + "/" + s.metaFile })) })};
export default createHandler(assets,info);`;
await fs.writeFile(
  path.join(root, "hosting/worker.mjs"),
  await format(code, { parser: "babel", printWidth: 110 }),
);
console.log("Prepared Cloudflare Worker with installable bundles.");
