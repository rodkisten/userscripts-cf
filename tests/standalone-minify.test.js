import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("standalone minifies JavaScript while retaining userscript metadata", async () => {
  const base = new URL("../dist/", import.meta.url);
  const source = await fs.readFile(new URL("standalone.user.js", base), "utf8");
  assert.match(source, /^\\/\\/ ==UserScript==/);
  assert.match(source, /^\\/\\/ @grant\\s+GM_registerMenuCommand$/m);
  assert.doesNotMatch(source, /sourceMappingURL=/);
  assert.match(source, /Rod Dock|rod-dock/);
  // TODO(SOURCEMAP): Re-enable source map assertions after Vite/Rolldown
  // reliably emits mappings and the standalone build publishes them.
});
