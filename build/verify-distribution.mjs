import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const dist = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dist), "utf8"));
assert.ok(Array.isArray(manifest.scripts) && manifest.scripts.length > 0);
const ids = new Set();
for (const entry of manifest.scripts) {
  assert.ok(!ids.has(entry.id), `Duplicate target: ${entry.id}`);
  ids.add(entry.id);
  const source = await readFile(new URL(entry.file, dist), "utf8");
  assert.match(source, /^\/\/ ==UserScript==/);
  assert.match(source, /@run-at\s+document-start/);
  assert.match(source, new RegExp(`@version\\s+${entry.version.replaceAll(".", "\\.")}`));
  assert.equal(createHash("sha256").update(source).digest("hex"), entry.sha256, entry.file);
  console.log(`Verified ${entry.id}: ${Buffer.byteLength(source)} bytes`);
}
console.log(`Verified ${ids.size} installable bundles without browser execution.`);
