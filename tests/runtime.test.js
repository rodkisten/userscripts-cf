import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { build } from "vite";
const fixture = await build({
  configFile: new URL("../vite.config.js", import.meta.url).pathname,
  logLevel: "silent",
  build: {
    write: false,
    lib: {
      entry: new URL("../src/core/runtime.js", import.meta.url).pathname,
      name: "RuntimeFixture",
      formats: ["iife"],
    },
  },
});
const runtimeCode = (Array.isArray(fixture) ? fixture : [fixture])
  .flatMap((result) => result.output)
  .find((chunk) => chunk.type === "chunk").code;
function createRuntime(definitions, bridge, host) {
  host.happyDOM.settings.enableJavaScriptEvaluation = true;
  host.happyDOM.settings.suppressInsecureJavaScriptEnvironmentWarning = true;
  host.eval(runtimeCode);
  return host.RuntimeFixture.createRuntime(definitions, bridge, host);
}
import { matchURL } from "../src/core/match.js";

test("URL patterns use hostname boundaries, paths, query and exclusions", () => {
  assert.equal(matchURL("https://*.example.com/*", "https://example.com/a"), true);
  assert.equal(matchURL("https://*.example.com/*", "https://sub.example.com/a"), true);
  assert.equal(matchURL("https://*.example.com/*", "https://evil-example.com/a"), false);
  assert.equal(matchURL("https://x.com/*", "https://x.com.evil/a"), false);
  assert.equal(matchURL("*://x.com/search*", "http://x.com/search?q=a"), true);
  assert.equal(matchURL("https://x.com/search*", "https://x.com/home"), false);
});

test("SPA enters once, retains matching module, disposes events and styles on exit", async () => {
  const host = new Window({ url: "https://x.com/home" });
  let starts = 0,
    stops = 0,
    clicks = 0;
  const nativePush = host.history.pushState;
  const definitions = [
    {
      id: "test",
      matches: ["https://x.com/*"],
      exclude: ["https://x.com/settings*"],
      module: {
        init(ctx) {
          starts++;
          ctx.style("body { color: red; }");
          ctx.listen(host, "click", () => clicks++);
          return () => stops++;
        },
      },
    },
  ];
  const app = createRuntime(definitions, { call() {} }, host);
  await app.ready;
  host.history.pushState({}, "", "/search?q=abc");
  await app.navigate();
  assert.equal(starts, 1);
  host.dispatchEvent(new host.Event("click"));
  assert.equal(clicks, 1);
  host.history.pushState({}, "", "/settings");
  await app.navigate();
  assert.equal(stops, 1);
  assert.equal(host.document.querySelector("style"), null);
  host.dispatchEvent(new host.Event("click"));
  assert.equal(clicks, 1);
  host.history.pushState({}, "", "/home");
  await app.navigate();
  assert.equal(starts, 2);
  await app.dispose();
  assert.equal(stops, 2);
  assert.equal(host.history.pushState, nativePush);
  await host.happyDOM.abort();
});

test("navigation during asynchronous initialization cleans the stale instance", async () => {
  const host = new Window({ url: "https://example.com/on" });
  let release,
    starts = 0,
    stops = 0;
  const gate = new Promise((resolve) => (release = resolve));
  const app = createRuntime(
    [
      {
        id: "slow",
        matches: ["https://example.com/on"],
        module: {
          async init(ctx) {
            starts++;
            ctx.onDispose(() => stops++);
            await gate;
          },
        },
      },
    ],
    { call() {} },
    host,
  );
  await Promise.resolve();
  host.history.pushState({}, "", "/off");
  const settling = app.navigate();
  release();
  await settling;
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  assert.deepEqual([...app.active], []);
  await app.dispose();
  await host.happyDOM.abort();
});
