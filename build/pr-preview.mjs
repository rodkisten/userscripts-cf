import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import definitions from "../userscripts.config.js";
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
const shortSha = (process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").slice(0, 8);
if (!/^[0-9a-f]{8}$/i.test(shortSha)) throw Error("PR_HEAD_SHA or GITHUB_SHA must be a commit SHA");
// Timestamp is numeric so a newer preview never sorts below an older commit hash.
const publishedAt = new Date(process.env.PREVIEW_BUILD_TIMESTAMP || Date.now());
if (Number.isNaN(publishedAt.getTime())) throw Error("Invalid PREVIEW_BUILD_TIMESTAMP");
const timestamp = publishedAt
  .toISOString()
  .replace(/[-:T.Z]/g, "")
  .slice(0, 14);
const previewVersion = `${manifest.version}.${timestamp}`;
const releaseLabel = `v${previewVersion} · ${shortSha} · ${publishedAt.toISOString()}`;
const escapeXML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char],
  );
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M64 8 122 112H6Z" fill="#f59e0b" stroke="#18181b" stroke-width="5" stroke-linejoin="round"/><text x="64" y="88" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${String(number).length > 4 ? 23 : 34}" fill="#18181b">${escapeXML(number)}</text></svg>`;
await fs.mkdir(path.join(output, "icons"), { recursive: true });
await fs.writeFile(path.join(output, "icons", "pr.svg"), icon);
const catalog = {
  channel: "pr-preview",
  pr: number,
  version: previewVersion,
  commit: shortSha,
  publishedAt: publishedAt.toISOString(),
  releaseLabel,
  baseURL: origin + prefix,
  scripts: [],
};
const definitionById = new Map(definitions.map((item) => [item.id, item]));
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
  replace("name", `#${number} ${item.name} · ${releaseLabel}`);
  replace("version", previewVersion);
  replace("namespace", `${origin}/pr/${number}/${item.id}`);
  replace("icon", `${origin}${prefix}/icons/pr.svg`);
  replace("updateURL", `${origin}${prefix}/${metaFile}`);
  replace("downloadURL", `${origin}${prefix}/${file}`);
  // Preview installers announce their presence without booting the module on this site.
  metadata = metadata.replace(marker, "// @match        https://userscripts.preview.migos.club/*\n" + marker);
  const probe = [
    `if (location.hostname === "userscripts.preview.migos.club" && location.pathname.startsWith("/${number}")) {`,
    `const report = () => document.dispatchEvent(new CustomEvent("userscripts-cf:installed", { detail: ${JSON.stringify({ id: item.id, version: previewVersion, commit: shortSha })} }));`,
    `document.addEventListener("userscripts-cf:probe", report);`,
    `report();`,
    `} else {`,
    original.slice(end + marker.length),
    `}`,
  ].join("\n");
  const source = metadata + "\n" + probe;
  await fs.writeFile(path.join(output, file), source);
  await fs.writeFile(path.join(output, metaFile), metadata + "\n");
  catalog.scripts.push({
    id: item.id,
    tags:
      definitionById.get(item.id)?.tags ??
      (item.id === "standalone" || item.id === "unified" ? ["bundle"] : ["other"]),
    group:
      item.id === "standalone" || item.id === "unified"
        ? "Bundles"
        : (definitionById.get(item.id)?.tags?.[0] ?? "Other"),
    name: `#${number} ${item.name} · ${releaseLabel}`,
    commit: shortSha,
    publishedAt: publishedAt.toISOString(),
    file,
    metaFile,
    version: previewVersion,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
}
// Preserve unchanged installers from the previous successful deployment.
// Pages uploads replace the deployment; absent files must be carried forward explicitly.
const expectedIds = new Set(["standalone", ...definitions.map(({ id }) => id), "unified"]);
const missingIds = [...expectedIds].filter((id) => !catalog.scripts.some((item) => item.id === id));
if (missingIds.length) {
  const remote = origin + prefix;
  const response = await fetch(remote + "/manifest.json", { signal: AbortSignal.timeout(15000) });
  if (!response.ok)
    throw Error(
      "Cannot preserve unchanged installers: previous preview manifest returned " + response.status,
    );
  const previous = await response.json();
  if (previous.pr !== number || previous.baseURL !== remote || !Array.isArray(previous.scripts))
    throw Error("Invalid previous PR preview manifest");
  for (const id of missingIds) {
    const item = previous.scripts.find((script) => script.id === id);
    if (
      !item ||
      item.file !== id + ".user.js" ||
      item.metaFile !== id + ".meta.js" ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw Error("Missing valid previous preview installer: " + id);
    const [installer, metadata] = await Promise.all(
      [item.file, item.metaFile].map(async (file) => {
        const res = await fetch(remote + "/" + file, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw Error("Cannot retrieve previous preview file: " + file);
        return res.text();
      }),
    );
    if (createHash("sha256").update(installer).digest("hex") !== item.sha256)
      throw Error("Previous preview checksum mismatch: " + id);
    await Promise.all([
      fs.writeFile(path.join(output, item.file), installer),
      fs.writeFile(path.join(output, item.metaFile), metadata),
    ]);
    const definition = definitionById.get(id);
    catalog.scripts.push({
      ...item,
      tags: definition?.tags ?? (id === "standalone" || id === "unified" ? ["bundle"] : ["other"]),
      group: id === "standalone" || id === "unified" ? "Bundles" : (definition?.tags?.[0] ?? "Other"),
    });
  }
  console.log("Preserved " + missingIds.length + " unchanged installers from previous preview");
}
catalog.scripts.sort((a, b) => [...expectedIds].indexOf(a.id) - [...expectedIds].indexOf(b.id));
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(catalog, null, 2) + "\n");
const data = JSON.stringify(catalog).replace(/</g, "\\u003c");
const template = await fs.readFile(path.join(root, "build", "pr-preview-page.html"), "utf8");
const html = template.replaceAll("__PREVIEW_DATA__", data).replaceAll("__PR_NUMBER__", String(number));
await fs.writeFile(path.join(output, "index.html"), html);
console.log(`Generated ${catalog.scripts.length} installers for PR #${number} in ${output}`);  // Installed preview scripts announce their version on the catalog page only.
  metadata = metadata.replace(marker, "// @match        https://userscripts.preview.migos.club/*\n" + marker);
  const probe = [
  `  const report = () => document.dispatchEvent(new CustomEvent("userscripts-cf:installed", { detail: ${JSON.stringify({ id: item.id, version: previewVersion, commit: shortSha })} }));`,
  `  const report = () => document.dispatchEvent(new CustomEvent("userscripts-cf:installed", { detail: ${JSON.stringify({id:"PLACEHOLDER"})} }));`,
  `  document.addEventListener("userscripts-cf:probe", report);`,
  `  report();`,
  `} else {`,
  original.slice(end + marker.length),
  `}`,
  ].join("\n");
  const source = metadata + "\n" + probe;
  await fs.writeFile(path.join(output, file), source);
  await fs.writeFile(path.join(output, metaFile), metadata + "\n");
  catalog.scripts.push({
    id: item.id,
    tags:
      definitionById.get(item.id)?.tags ??
      (item.id === "standalone" || item.id === "unified" ? ["bundle"] : ["other"]),
    group:
      item.id === "standalone" || item.id === "unified"
        ? "Bundles"
        : (definitionById.get(item.id)?.tags?.[0] ?? "Other"),
    name: `#${number} ${item.name} · ${releaseLabel}`,
    commit: shortSha,
    publishedAt: publishedAt.toISOString(),
    file,
    metaFile,
    version: previewVersion,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
}
// Preserve unchanged installers from the previous successful deployment.
// Pages uploads replace the deployment; absent files must be carried forward explicitly.
const expectedIds = new Set(["standalone", ...definitions.map(({ id }) => id), "unified"]);
const missingIds = [...expectedIds].filter((id) => !catalog.scripts.some((item) => item.id === id));
if (missingIds.length) {
  const remote = origin + prefix;
  const response = await fetch(remote + "/manifest.json", { signal: AbortSignal.timeout(15000) });
  if (!response.ok)
    throw Error(
      "Cannot preserve unchanged installers: previous preview manifest returned " + response.status,
    );
  const previous = await response.json();
  if (previous.pr !== number || previous.baseURL !== remote || !Array.isArray(previous.scripts))
    throw Error("Invalid previous PR preview manifest");
  for (const id of missingIds) {
    const item = previous.scripts.find((script) => script.id === id);
    if (
      !item ||
      item.file !== id + ".user.js" ||
      item.metaFile !== id + ".meta.js" ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw Error("Missing valid previous preview installer: " + id);
    const [installer, metadata] = await Promise.all(
      [item.file, item.metaFile].map(async (file) => {
        const res = await fetch(remote + "/" + file, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw Error("Cannot retrieve previous preview file: " + file);
        return res.text();
      }),
    );
    if (createHash("sha256").update(installer).digest("hex") !== item.sha256)
      throw Error("Previous preview checksum mismatch: " + id);
    await Promise.all([
      fs.writeFile(path.join(output, item.file), installer),
      fs.writeFile(path.join(output, item.metaFile), metadata),
    ]);
    const definition = definitionById.get(id);
    catalog.scripts.push({
      ...item,
      tags: definition?.tags ?? (id === "standalone" || id === "unified" ? ["bundle"] : ["other"]),
      group: id === "standalone" || id === "unified" ? "Bundles" : (definition?.tags?.[0] ?? "Other"),
    });
  }
  console.log("Preserved " + missingIds.length + " unchanged installers from previous preview");
}
catalog.scripts.sort((a, b) => [...expectedIds].indexOf(a.id) - [...expectedIds].indexOf(b.id));
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(catalog, null, 2) + "\n");
const data = JSON.stringify(catalog).replace(/</g, "\\u003c");
const template = await fs.readFile(path.join(root, "build", "pr-preview-page.html"), "utf8");
const html = template.replaceAll("__PREVIEW_DATA__", data).replaceAll("__PR_NUMBER__", String(number));
await fs.writeFile(path.join(output, "index.html"), html);
console.log(`Generated ${catalog.scripts.length} installers for PR #${number} in ${output}`);
