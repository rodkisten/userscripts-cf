import fs from "node:fs/promises";
import path from "node:path";

const pr = Number(process.env.PR_NUMBER);
const token = process.env.PREVIEW_UPLOAD_TOKEN;
const origin = (process.env.PREVIEW_ORIGIN || "https://userscripts.preview.migos.club").replace(/\/$/, "");
if (!Number.isSafeInteger(pr) || pr < 1 || !token) throw Error("PR_NUMBER and PREVIEW_UPLOAD_TOKEN required");
const dir = path.resolve(process.argv[2] || path.join("dist", "pr-preview", String(pr)));
const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
if (manifest.pr !== pr || !Array.isArray(manifest.scripts) || !manifest.scripts.length)
  throw Error("Invalid PR manifest");
const names = [
  "icons/pr.svg",
  "index.html",
  ...manifest.scripts.flatMap((s) => [s.file, s.metaFile]),
  "manifest.json",
];
for (const name of names) {
  if (!/^(?:[a-z][a-z0-9-]*\.(?:user|meta)\.js|manifest\.json|index\.html|icons\/pr\.svg)$/.test(name))
    throw Error("Unsafe path " + name);
  const body = await fs.readFile(path.join(dir, name));
  const response = await fetch(origin + "/_publish/" + pr + "/" + name, {
    method: "PUT",
    headers: { authorization: "Bearer " + token, "content-type": "application/octet-stream" },
    body,
  });
  if (!response.ok) throw Error("Upload " + name + ": " + response.status + " " + (await response.text()));
  console.log("Published", name);
}
console.log("Preview available at " + origin + "/" + pr + "/");
