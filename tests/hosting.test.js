import { test } from "vitest";
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

test("SolidJS playground assets have correct MIME types", async () => {
  const app = createHandler(
    {
      "playground/form-controls.html": '<script type="module" src="/playground/form-controls.js"></script>',
      "playground/form-controls.js": 'console.log("solid");',
      "playground/form-controls.css": ".root{color:red}",
    },
    { version: "test" },
  );
  for (const [file, expected] of [
    ["playground/form-controls.html", /text\/html/],
    ["playground/form-controls.js", /application\/javascript/],
    ["playground/form-controls.css", /text\/css/],
  ]) {
    const response = await app.fetch(new Request("https://test/" + file));
    assert.equal(response.status, 200, file);
    assert.match(response.headers.get("content-type"), expected, file);
  }
});
