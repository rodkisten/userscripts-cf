import test from "node:test";
import assert from "node:assert/strict";
import { createHttpClient } from "../src/runtime/http-client.js";
import { createDomEngine } from "../src/runtime/dom-engine.js";

test("HTTP caches GET responses and clones bodies", async () => {
  let count = 0;
  const host = { location: { href: "https://example.com/", origin: "https://example.com" },
    fetch: async () => { count++; return new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } }); } };
  const client = createHttpClient({ host });
  assert.deepEqual(await client.json("https://example.com/data"), { ok: true });
  assert.deepEqual(await client.json("https://example.com/data"), { ok: true });
  assert.equal(count, 1);
  assert.equal(client.stats.hits, 1);
  client.dispose();
});

test("HTTP does not cache authorization or POST", async () => {
  let count = 0;
  const host = { location: { href: "https://example.com/", origin: "https://example.com" },
    fetch: async () => { count++; return new Response("ok"); } };
  const client = createHttpClient({ host });
  await client.text("https://example.com/private", { headers: { Authorization: "Bearer secret" } });
  await client.text("https://example.com/private", { headers: { Authorization: "Bearer secret" } });
  await client.request("https://example.com/create", { method: "POST" });
  await client.request("https://example.com/create", { method: "POST" });
  assert.equal(count, 4);
});

test("GM HEAD creates a bodyless response", async () => {
  const host = { location: { href: "https://example.com/", origin: "https://example.com" },
    GM_xmlhttpRequest: (options) => {
      queueMicrotask(() => options.onload({ status: 200, statusText: "OK", response: new ArrayBuffer(0), responseHeaders: "Content-Length: 0" }));
      return { abort() {} };
    } };
  const client = createHttpClient({ host });
  const response = await client.request("https://remote.example/", { method: "HEAD", transport: "gm" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("DOM engine queries and invalidates cache explicitly", () => {
  let calls = 0;
  const node = {};
  const root = { querySelector: () => { calls++; return node; }, querySelectorAll: () => [node] };
  const dom = createDomEngine({ root });
  assert.equal(dom.one(".item"), node);
  assert.equal(dom.one(".item"), node);
  dom.invalidate();
  assert.equal(dom.one(".item"), node);
  assert.equal(calls, 3); // Without MutationObserver there is no cache.
  dom.dispose();
});
