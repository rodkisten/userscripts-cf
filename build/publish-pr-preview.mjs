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
const requiredNames = [
  "icons/pr.svg",
  ...manifest.scripts.flatMap((s) => [s.file, s.metaFile]),
  "manifest.json",
];
const optionalNames = ["design-system.html", "design-system.js", "design-system.css"];
async function upload(name, optional = false, bodyOverride) {
  if (
    !/^(?:[a-z][a-z0-9-]*\.(?:user|meta)\.js|manifest\.json|index\.html|design-system\.(?:html|js|css)|icons\/pr\.svg)$/.test(
      name,
    )
  )
    throw Error("Unsafe path " + name);
  let body = bodyOverride;
  if (body === undefined) {
    try {
      body = await fs.readFile(path.join(dir, name));
    } catch (error) {
      if (optional && error?.code === "ENOENT") {
        console.warn("Optional preview asset was not generated", name, "— skipping");
        return false;
      }
      throw error;
    }
  }
  const response = await fetch(origin + "/_publish/" + pr + "/" + name, {
    method: "PUT",
    headers: { authorization: "Bearer " + token, "content-type": "application/octet-stream" },
    body,
  });
  if (!response.ok) {
    const message = await response.text();
    if (optional && response.status === 400 && message.includes("Invalid publication path")) {
      console.warn("Preview worker does not support optional asset", name, "— skipping");
      return false;
    }
    throw Error("Upload " + name + ": " + response.status + " " + message);
  }
  console.log("Published", name);
  return true;
}

for (const name of requiredNames) await upload(name);

let designSystemPublished = true;
for (const name of optionalNames) {
  designSystemPublished = (await upload(name, true)) && designSystemPublished;
}

let index = await fs.readFile(path.join(dir, "index.html"), "utf8");
if (!designSystemPublished) {
  index = index.replace('<a class="button" href="./design-system.html">Rod UI Studio ↗</a', "");
}
await upload("index.html", false, index);

console.log(
  "Preview available at " +
    origin +
    "/" +
    pr +
    "/" +
    (designSystemPublished ? " (Rod UI Studio enabled)" : " (installer catalog only)"),
);
