import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import worker from "./worker.mjs";
import { Window } from "happy-dom";
const source = fs.readFileSync(new URL("./RodX-Remote-Release-Lab.user.js", import.meta.url), "utf8");
const response = await worker.fetch(new Request("https://lab/manifest.json"));
const manifest = await response.json();
assert.equal(manifest.release, "A");
assert.equal(response.headers.get("cache-control"), "no-store");
const mod = await worker.fetch(new Request("https://lab" + manifest.module.path));
const code = await mod.text();
assert.equal(crypto.createHash("sha256").update(code).digest("hex"), manifest.module.sha256);
assert.match(mod.headers.get("cache-control"), /immutable/);
assert.equal((await worker.fetch(new Request("https://lab/manifest-unavailable.json"))).status, 503);
console.log("PASS published fixture structure, SHA-256, cache headers and controlled HTTP 503");
const store = new Map();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function realm() {
  const w = new Window({
    url: "https://x.com/home",
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  w.TextEncoder = TextEncoder;
  w.GM_getValue = (k, f) => store.get(k) ?? f;
  w.GM_setValue = (k, v) => store.set(k, v);
  w.GM_deleteValue = (k) => store.delete(k);
  w.GM_registerMenuCommand = () => {};
  w.GM_xmlhttpRequest = (details) => {
    void worker
      .fetch(new Request(details.url))
      .then(async (response) =>
        details.onload({
          status: response.status,
          responseText: await response.text(),
        }),
      )
      .catch(details.onerror);
  };
  w.eval(source);
  await pause(80);
  return w;
}
let w = await realm();
let panel = w.document.getElementById("rodx-release-lab").shadowRoot;
panel.querySelector('[data-action="stage"]').click();
await pause(200);
let db = JSON.parse(store.get("rodx:remote-loader-lab:v1"));
assert.equal(db.pending.version, "A");
assert.equal(db.stable, undefined);
await w.happyDOM.abort();
w = await realm();
panel = w.document.getElementById("rodx-release-lab").shadowRoot;
db = JSON.parse(store.get("rodx:remote-loader-lab:v1"));
assert.equal(db.stable.version, "A");
assert.equal(db.pending, null);
assert.match(panel.querySelector("pre").textContent, /pending-from-GM/);
console.log("PASS candidate hash/init tested, snapshot saved, actual new realm activates A from GM");
panel.querySelector('[data-action="broken"]').click();
await pause(200);
assert.match(panel.querySelector("pre").textContent, /Candidato quebrado remoto/);
assert.equal(JSON.parse(store.get("rodx:remote-loader-lab:v1")).stable.version, "A");
console.log("PASS failed candidate keeps stable release");
panel.querySelector('[data-action="failure"]').click();
await pause(30);
await w.happyDOM.abort();
w = await realm();
panel = w.document.getElementById("rodx-release-lab").shadowRoot;
assert.match(panel.querySelector("pre").textContent, /HTTP 503/);
assert.match(panel.querySelector("pre").textContent, /stable-from-GM/);
assert.equal(JSON.parse(store.get("rodx:remote-loader-lab:v1")).stable.version, "A");
console.log("PASS controlled HTTP error on next realm falls back to cached A");
await w.happyDOM.abort();
