import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { Window } from "happy-dom";
import { parse } from "acorn";
import definitions from "../userscripts.config.js";

const dist = new URL("../dist/", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function run(file, url, values = new Map()) {
  const host = new Window({
    url,
    settings: {
      enableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
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
    [...definitions.map((item) => item.id), "unified"],
  );
  for (const entry of manifest.scripts) {
    const source = await fs.readFile(new URL(entry.file, dist), "utf8");
    assert.match(source, /^\/\/ ==UserScript==/);
    assert.match(source, /@run-at\s+document-start/);
    // Inspect syntax: storage.import() and the menu's optional loader string
    // are not unresolved bundle imports.
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      assert.notEqual(node.type, "ImportDeclaration");
      if (entry.id !== "page-repl") assert.notEqual(node.type, "ImportExpression");
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else visit(value);
      }
    };
    visit(parse(source, { ecmaVersion: "latest", sourceType: "script" }));
    assert.equal(createHash("sha256").update(source).digest("hex"), entry.sha256);
  }
});

test("individual generated userscript executes npm dependency and cleans demo on excluded SPA route", async () => {
  const host = await run("example-site.user.js", "https://example.com/");
  assert.deepEqual([...host.__userscriptsCF["example-site"].active], ["example-site"]);
  assert.match(
    host.document.querySelector("[data-userscripts-cf-ui=example-site]").shadowRoot.querySelector("aside")
      .textContent,
    /Vite \+ npm/,
  );
  host.history.pushState({}, "", "/disabled/demo");
  await host.__userscriptsCF["example-site"].navigate();
  assert.equal(host.document.querySelector("[data-userscripts-cf-ui=example-site]"), null);
  assert.equal(host.document.querySelector("style"), null);
  await host.__userscriptsCF["example-site"].dispose();
  await host.happyDOM.abort();
});

test("RodX individual and unified preserve original Tampermonkey identity and dependencies", async () => {
  for (const file of ["rodx-studio.user.js", "unified.user.js"]) {
    const source = await fs.readFile(new URL(file, dist), "utf8");
    const header = source.slice(0, source.indexOf("// ==/UserScript=="));
    assert.match(header, /@name\s+RodX Studio — X\/Twitter mobile-first/);
    assert.match(header, /@namespace\s+https:\/\/rodx.local\/userscripts/);
    assert.match(header, /@grant\s+GM_xmlhttpRequest/);
    assert.match(header, /@grant\s+unsafeWindow/);
    assert.match(header, /@require\s+https:\/\/rod.migos.club\/menu\/dist\/menu.iife.min.js/);
    assert.match(header, /@require\s+https:\/\/code.migos.club\/api\/cdn\?package=@videojs/);
    assert.ok(source.length > 800000);
  }
});
