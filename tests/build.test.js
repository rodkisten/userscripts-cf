import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Window } from "happy-dom";

const dist = new URL("../dist/", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function run(file, url, values = new Map()) {
  const host = new Window({
    url,
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  host.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  host.GM_setValue = (key, value) => values.set(key, value);
  host.GM_deleteValue = (key) => values.delete(key);
  host.eval(await fs.readFile(new URL(file, dist), "utf8"));
  await sleep(100);
  return host;
}

test("build manifests hashes, IIFE outputs and installable metadata", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("manifest.json", dist), "utf8"));
  assert.deepEqual(
    manifest.scripts.map((item) => item.id),
    ["x-foundation", "example-site", "unified"],
  );
  for (const entry of manifest.scripts) {
    const source = await fs.readFile(new URL(entry.file, dist), "utf8");
    assert.match(source, /^\/\/ ==UserScript==/);
    assert.match(source, /@run-at\s+document-start/);
    assert.doesNotMatch(source, /\bimport\s*\(/);
    assert.equal(createHash("sha256").update(source).digest("hex"), entry.sha256);
  }
});

test("unified generated userscript executes npm dependency and cleans demo on excluded SPA route", async () => {
  const host = await run("unified.user.js", "https://example.com/");
  assert.deepEqual([...host.__userscriptsCF.unified.active], ["example-site"]);
  assert.match(host.document.querySelector("aside").textContent, /Vite \+ npm/);
  host.history.pushState({}, "", "/disabled/demo");
  await host.__userscriptsCF.unified.navigate();
  assert.equal(host.document.querySelector("aside"), null);
  assert.equal(host.document.querySelector("style"), null);
  await host.__userscriptsCF.unified.dispose();
  await host.happyDOM.abort();
});

test("standalone and unified share per-module GM storage across fresh realms", async () => {
  const values = new Map();
  let host = await run("x-foundation.user.js", "https://x.com/home", values);
  assert.equal(values.get("userscripts-cf:v1:x-foundation:activations"), 1);
  await host.__userscriptsCF["x-foundation"].dispose();
  await host.happyDOM.abort();
  host = await run("unified.user.js", "https://x.com/home", values);
  assert.equal(values.get("userscripts-cf:v1:x-foundation:activations"), 2);
  assert.deepEqual([...host.__userscriptsCF.unified.active], ["x-foundation"]);
  assert.equal(host.document.querySelector("aside"), null);
  await host.__userscriptsCF.unified.dispose();
  await host.happyDOM.abort();
});
