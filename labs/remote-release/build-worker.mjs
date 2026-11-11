import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const directory = path.dirname(fileURLToPath(import.meta.url));
const release = process.argv[2] || "A";
if (!["A", "B"].includes(release)) throw Error("Release esperada: A ou B");
const assets = {},
  manifests = {};
for (const version of ["A", "B", "BAD"]) {
  const code = fs.readFileSync(path.join(directory, "module-" + version + ".js"), "utf8");
  const sha256 = crypto.createHash("sha256").update(code).digest("hex");
  const file = "/modules/probe-" + version + "." + sha256.slice(0, 12) + ".js";
  assets[file] = code;
  manifests[version] = {
    schema: 1,
    release: version,
    module: { path: file, sha256, version },
  };
}
const template = fs.readFileSync(path.join(directory, "worker-template.js"), "utf8");
const output = template
  .replace("__ASSETS__", JSON.stringify(assets))
  .replace("__MANIFEST__", JSON.stringify(manifests[release]))
  .replace("__BROKEN__", JSON.stringify(manifests.BAD));
fs.writeFileSync(path.join(directory, "worker.mjs"), output);
console.log("Built " + release + " with A/B/BAD module assets retained.");
