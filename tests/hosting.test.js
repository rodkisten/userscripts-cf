import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../hosting/handler.js";
const worker = createHandler(
  { "unified.user.js": "// code", "unified.meta.js": "// header" },
  { version: "test" },
);
test("public distribution serves JS with fresh metadata and HEAD support", async () => {
  for (const file of ["unified.user.js", "unified.meta.js"]) {
    const r = await worker.fetch(new Request("https://test/" + file + "?v=1"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.match(r.headers.get("content-type"), /application\/javascript/);
  }
  assert.equal(
    await (await worker.fetch(new Request("https://test/unified.user.js", { method: "HEAD" }))).text(),
    "",
  );
  assert.equal((await worker.fetch(new Request("https://test/private"))).status, 404);
  assert.equal((await worker.fetch(new Request("https://test/__proto__"))).status, 404);
  assert.equal((await worker.fetch(new Request("https://test/", { method: "POST" }))).status, 405);
});
