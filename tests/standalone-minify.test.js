import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("standalone minifies JavaScript while retaining userscript metadata and a full external source map", async () => {
  const base = new URL("../dist/", import.meta.url);
  const source = await fs.readFile(new URL("standalone.user.js", base), "utf8");
  const map = JSON.parse(await fs.readFile(new URL("standalone.user.js.map", base), "utf8"));
  assert.match(source, /^\/\/ ==UserScript==/);
  assert.match(source, /^\/\/ @grant\s+GM_registerMenuCommand$/m);
  assert.match(source, /sourceMappingURL=standalone\.user\.js\.map/);
  assert.equal(map.version, 3);
  assert.equal(map.file, "standalone.user.js");
  assert.ok(map.mappings.length > 0);
  assert.ok(map.sources.length > 0);
  assert.equal(map.sourcesContent.length, map.sources.length);
  assert.ok(map.sourcesContent.every((entry) => typeof entry === "string"));
  assert.match(source, /Rod Dock|rod-dock/);
});
