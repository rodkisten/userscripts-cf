import assert from "node:assert/strict";
import { test as vitestTest } from "vitest";
import { Window } from "happy-dom";
import { build } from "vite";
let transformedModules = 0;
const fixture = await build({
  configFile: new URL("../vite.config.js", import.meta.url).pathname,
  define: {
    __ROD_FEATURE_HTTP__: "false",
    __ROD_FEATURE_DOM__: "false",
  },
  logLevel: "info",
  plugins: [
    {
      name: "runtime-test-build-progress",
      buildStart() {
        console.log("[runtime fixture] Compiling the runtime IIFE used by lifecycle tests.");
      },
      transform(_source, id) {
        transformedModules++;
        if (transformedModules % 25 === 0) {
          console.log(`[runtime fixture] Transformed ${transformedModules} modules.`);
        }
        return null;
      },
    },
  ],
  build: {
    write: false,
    lib: {
      entry: new URL("../src/core/runtime-react.tsx", import.meta.url).pathname,
      name: "RuntimeFixture",
      formats: ["iife"],
    },
  },
});
console.log("[runtime fixture] Vite build promise resolved; registering runtime tests.");
const runtimeCode = (Array.isArray(fixture) ? fixture : [fixture])
  .flatMap((result) => result.output)
  .find((chunk) => chunk.type === "chunk").code;
function createRuntime(definitions, bridge, host, beforeCreate) {
  console.log("[runtime fixture] enabling happy-dom evaluation");
  host.happyDOM.settings.enableJavaScriptEvaluation = true;
  host.happyDOM.settings.suppressInsecureJavaScriptEnvironmentWarning = true;
  host.process = process;
  console.log("[runtime fixture] evaluating compiled runtime");
  host.eval(runtimeCode);
  console.log("[runtime fixture] compiled runtime evaluated");
  beforeCreate?.(host);
  console.log("[runtime fixture] creating runtime instance");
  const app = host.RuntimeFixture.createRuntime(definitions, bridge, host);
  console.log("[runtime fixture] runtime instance created");
  return app;
}
import { matchURL } from "../src/core/match.js";
import { initializeRodFeatures } from "../src/core/runtime.js";

function test(name, callback) {
  vitestTest(name, async () => {
    console.log(`[runtime test] begin: ${name}`);
    try {
      return await callback();
    } finally {
      console.log(`[runtime test] end: ${name}`);
    }
  });
}

test("React menus are unavailable without a runtime-owned shared mount", async () => {
  const host = new Window({ url: "https://example.com/" });
  Object.defineProperty(host, "RodStorage", {
    configurable: true,
    value: { create: () => ({}) },
  });
  const legacyFeatures = initializeRodFeatures(host);
  assert.equal(legacyFeatures.menu, undefined);
  assert.equal(legacyFeatures.toaster, undefined);
  const reactFeatures = initializeRodFeatures(host, () => ({ update() {}, dispose() {} }));
  assert.equal(typeof reactFeatures.menu?.open, "function");
  assert.equal(typeof reactFeatures.menu?.dropdown, "function");
  assert.equal(typeof reactFeatures.toaster?.destroy, "function");
  await host.happyDOM.abort();
});

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
  host.__ROD_RUNTIME_TRACE__ = true;
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
          ctx.pageStyle("body { color: red; }");
          ctx.listen(host, "click", () => clicks++);
          return () => {
            stops++;
            console.log("[runtime test] SPA: module cleanup callback");
          };
        },
      },
    },
  ];
  console.log("[runtime test] SPA: creating runtime");
  const app = createRuntime(definitions, { call() {} }, host);
  console.log("[runtime test] SPA: awaiting ready");
  await app.ready;
  console.log("[runtime test] SPA: ready");
  host.history.pushState({}, "", "/search?q=abc");
  await app.navigate();
  console.log("[runtime test] SPA: search navigation complete");
  assert.equal(starts, 1);
  console.log("[runtime test] SPA: dispatching click");
  host.dispatchEvent(new host.Event("click"));
  console.log("[runtime test] SPA: click dispatched");
  assert.equal(clicks, 1);
  console.log("[runtime test] SPA: pushing settings route");
  host.history.pushState({}, "", "/settings");
  console.log("[runtime test] SPA: awaiting settings navigation");
  await Promise.race([
    app.navigate(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("SPA settings navigation did not settle after cleanup (5000ms)")),
        5000,
      ),
    ),
  ]);
  console.log("[runtime test] SPA: settings navigation complete");
  assert.equal(stops, 1);
  assert.equal(host.document.querySelector("style"), null);
  host.dispatchEvent(new host.Event("click"));
  assert.equal(clicks, 1);
  host.history.pushState({}, "", "/home");
  await app.navigate();
  console.log("[runtime test] SPA: home navigation complete");
  assert.equal(starts, 2);
  await app.dispose();
  console.log("[runtime test] SPA: runtime disposed");
  assert.equal(stops, 2);
  assert.equal(host.history.pushState, nativePush);
  await host.happyDOM.abort();
  console.log("[runtime test] SPA: happy-dom aborted");
});

test("context listeners preserve capture and are removed on SPA exit", async () => {
  const host = new Window({ url: "https://example.com/on" });
  let events = 0;
  const app = createRuntime(
    [
      {
        id: "capture-listener",
        matches: ["https://example.com/on"],
        module: {
          init(ctx) {
            ctx.listen(host, "click", () => events++, true);
          },
        },
      },
    ],
    { call() {} },
    host,
  );
  try {
    await app.ready;
    host.dispatchEvent(new host.Event("click"));
    assert.equal(events, 1);
    host.history.pushState({}, "", "/off");
    await app.navigate();
    host.dispatchEvent(new host.Event("click"));
    assert.equal(events, 1, "listener must be detached after route exit");
  } finally {
    await app.dispose();
    await host.happyDOM.abort();
  }
});

test("persistent storage is created only on first use and reused across SPA navigation", async () => {
  const host = new Window({ url: "https://example.com/on" });
  const created = [];
  let activeContext;
  const app = createRuntime(
    [
      {
        id: "lazy-storage",
        matches: ["https://example.com/on"],
        module: {
          init(ctx) {
            activeContext = ctx;
          },
        },
      },
    ],
    { call: async () => undefined },
    host,
    (window) => {
      const original = window.RodStorage;
      window.RodStorage = {
        ...original,
        create(options) {
          created.push(options.namespace);
          return {
            get: async () => undefined,
            set: async () => {},
            delete: async () => {},
            close: () => {},
          };
        },
      };
    },
  );
  await app.ready;
  assert.deepEqual(created, [], "creating a context must not open persistent storage");
  await activeContext.storage.get("missing");
  assert.deepEqual(created, ["userscripts-cf/lazy-storage"]);
  await activeContext.storage.set("key", "value");
  await activeContext.storage.delete("key");
  assert.equal(created.length, 1, "subsequent operations reuse the same store");
  host.history.pushState({}, "", "/off");
  await app.navigate();
  host.history.pushState({}, "", "/on");
  await app.navigate();
  await activeContext.storage.get("missing");
  assert.equal(created.length, 1, "SPA reentry reuses the store");
  await app.dispose();
  await host.happyDOM.abort();
});

test("event infrastructure is lazy, shared, and disposed across SPA transitions", async () => {
  const host = new Window({ url: "https://example.com/on" });
  let context;
  let abortListeners = 0;
  const nativeAdd = host.AbortSignal.prototype.addEventListener;
  host.AbortSignal.prototype.addEventListener = function (type, ...args) {
    if (type === "abort") abortListeners++;
    return nativeAdd.call(this, type, ...args);
  };
  try {
    const app = createRuntime(
      [
        {
          id: "events-lazy",
          matches: ["https://example.com/on"],
          module: {
            init(ctx) {
              context = ctx;
            },
          },
        },
      ],
      { call() {} },
      host,
    );
    await app.ready;
    const beforeAccess = abortListeners;
    const first = context.events;
    assert.equal(first, context.events, "event services are memoized within a context");
    assert.ok(abortListeners > beforeAccess, "event services register abort cleanup on demand");
    let observed = 0;
    first.on("message", () => observed++);
    first.emit("message", {});
    assert.equal(observed, 1);
    host.history.pushState({}, "", "/off");
    await app.navigate();
    assert.equal(first.size, 0, "leaving the URL disposes event listeners");
    host.history.pushState({}, "", "/on");
    await app.navigate();
    assert.notEqual(context.events, first, "SPA reentry creates a new scoped event bus");
    await app.dispose();
  } finally {
    host.AbortSignal.prototype.addEventListener = nativeAdd;
    await host.happyDOM.abort();
  }
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

test("ctx.query shares a lazy QueryClient between scripts and disposes on runtime shutdown", async () => {
  const host = new Window({ url: "https://x.com/home" });
  const clients = [];
  const definitions = ["first", "second"].map((id) => ({
    id,
    matches: ["https://x.com/*"],
    module: {
      init(ctx) {
        assert.equal(typeof ctx.query.createAsyncOptions, "function");
        clients.push(ctx.query.client);
      },
    },
  }));
  const app = createRuntime(definitions, { call() {} }, host);
  await app.ready;
  assert.equal(clients.length, 2);
  assert.strictEqual(clients[0], clients[1]);
  clients[0].setQueryData(["shared", "test"], { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(clients[1].getQueryData(["shared", "test"]))), { ok: true });
  await app.dispose();
  assert.equal(clients[0].getQueryData(["shared", "test"]), undefined);
});

test("runtime disposal releases the shared React toaster host", async () => {
  const host = new Window({ url: "https://example.com/" });
  const app = createRuntime(
    [
      {
        id: "toaster-owner",
        matches: ["https://example.com/*"],
        module: {
          init(ctx) {
            ctx.toaster?.success("runtime lifecycle");
          },
        },
      },
    ],
    { call: async () => undefined },
    host,
  );
  await app.ready;
  assert.ok(host.document.querySelector("[data-rod-toaster='sonner']"));
  await app.dispose();
  assert.equal(host.document.querySelector("[data-rod-toaster='sonner']"), null);
  await host.happyDOM.abort();
});
