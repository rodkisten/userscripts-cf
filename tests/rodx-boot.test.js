import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Window } from "happy-dom";
import { IDBFactory } from "fake-indexeddb";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function boot(file, { direct = true } = {}) {
  const host = new Window({
    url: "https://x.com/home",
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  const values = new Map(),
    errors = [];
  host.TextEncoder = TextEncoder;
  host.TextDecoder = TextDecoder;
  host.Headers = Headers;
  host.Request = Request;
  host.Response = Response;
  host.ReadableStream = ReadableStream;
  host.indexedDB = new IDBFactory();
  if (direct) host.unsafeWindow = host;
  host.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  host.GM_setValue = (key, value) => values.set(key, value);
  host.GM_deleteValue = (key) => values.delete(key);
  host.GM_registerMenuCommand = () => {};
  host.fetch = async () => new Response('{"data":{}}', { headers: { "content-type": "application/json" } });
  host.console.error = (...args) => errors.push(args.map(String).join(" "));
  host.document.body.innerHTML = '<main role="main"><div data-testid="primaryColumn"></div></main>';
  const source = await fs.readFile(new URL("../dist/" + file, import.meta.url), "utf8");
  host.eval(source);
  await sleep(450);
  return { host, errors, source, values };
}

for (const [file, key, direct] of [
  ["rodx-studio.user.js", "rodx-studio:sandbox", true],
  ["unified.user.js", "unified:sandbox", false],
]) {
  test(`${file} boots full RodX with GM sandbox, list repository and network bridge`, async () => {
    const { host, errors, source } = await boot(file, { direct });
    try {
      assert.deepEqual(errors, []);
      assert.equal(host.__rodxStudioV3, true);
      assert.equal(host.__rodxStudioNetworkV3 !== undefined, true);
      assert.deepEqual([...host.__userscriptsCF[key].active], ["rodx-studio"]);
      assert.ok(host.document.getElementById("rodx-search-deck-root"));
      assert.ok(host.document.getElementById("x-lists-studio-root"));
      const root = host.document.getElementById("rodx-search-deck-root");
      host.eval(source);
      await sleep(30);
      assert.equal(host.document.getElementById("rodx-search-deck-root"), root);
      host.history.pushState({}, "", "/search?q=list%3A123%20filter%3Anative_video");
      await host.__userscriptsCF[key].navigate();
      assert.deepEqual(errors, []);
      assert.equal(host.document.querySelectorAll("#rodx-search-deck-root").length, 1);
    } finally {
      await host.happyDOM.abort();
    }
  });
}
