import assert from "node:assert/strict";
import { test, afterEach } from "vitest";
import { Window } from "happy-dom";
import { matchURL } from "../src/core/match.js";
import { initializeRodFeatures } from "../src/core/runtime.js";
import { createRuntime } from "../src/core/runtime-react.tsx";

/** @type {Window[]} */
const activeHosts = [];

function createTestHost(url = "https://example.com/") {
  const host = new Window({
    url,
    settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  // Each isolated Happy DOM window needs the storage bridge installed by the browser bundle.
  Object.defineProperty(host, "RodStorage", {
    configurable: true,
    value: { create: () => ({}) },
  });
  activeHosts.push(host);
  return host;
}

function setupRuntime(definitions, bridge, host, beforeCreate) {
  beforeCreate?.(host);
  return createRuntime(definitions, bridge, host);
}

afterEach(async () => {
  while (activeHosts.length > 0) {
    const host = activeHosts.pop();
    await host.happyDOM.abort();
  }
});

test("React menus are unavailable without a runtime-owned shared mount", () => {
  const host = createTestHost("https://example.com/");
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
  const host = createTestHost("https://x.com/home");
  let starts = 0;
  let stops = 0;
  let clicks = 0;
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
          };
        },
      },
    },
  ];

  const app = setupRuntime(definitions, { call() {} }, host);
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
});

test("context listeners preserve capture and are removed on SPA exit", async () => {
  const host = createTestHost("https://example.com/on");
  let events = 0;

  const app = setupRuntime(
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
  }
});

test("persistent storage is created only on first use and reused across SPA navigation", async () => {
  const host = createTestHost("https://example.com/on");
  const created = [];
  let activeContext;

  const app = setupRuntime(
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

  try {
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
  } finally {
    await app.dispose();
  }
});

test("event infrastructure is lazy, shared, and disposed across SPA transitions", async () => {
  const host = createTestHost("https://example.com/on");
  let context;
  let abortListeners = 0;
  const nativeAdd = host.AbortSignal.prototype.addEventListener;

  host.AbortSignal.prototype.addEventListener = function (type, ...args) {
    if (type === "abort") abortListeners++;
    return nativeAdd.call(this, type, ...args);
  };

  try {
    const app = setupRuntime(
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
  }
});

test("navigation during asynchronous initialization cleans the stale instance", async () => {
  const host = createTestHost("https://example.com/on");
  let release;
  let starts = 0;
  let stops = 0;
  const gate = new Promise((resolve) => (release = resolve));

  const app = setupRuntime(
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

  try {
    await Promise.resolve();
    host.history.pushState({}, "", "/off");
    const settling = app.navigate();
    release();
    await settling;

    assert.equal(starts, 1);
    assert.equal(stops, 1);
    assert.deepEqual([...app.active], []);
  } finally {
    await app.dispose();
  }
});

test("ctx.query shares a lazy QueryClient between scripts and disposes on runtime shutdown", async () => {
  const host = createTestHost("https://x.com/home");
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

  const app = setupRuntime(definitions, { call() {} }, host);
  try {
    await app.ready;
    assert.equal(clients.length, 2);
    assert.strictEqual(clients[0], clients[1]);

    clients[0].setQueryData(["shared", "test"], { ok: true });
    assert.deepEqual(JSON.parse(JSON.stringify(clients[1].getQueryData(["shared", "test"]))), { ok: true });

    await app.dispose();
    assert.equal(clients[0].getQueryData(["shared", "test"]), undefined);
  } finally {
    await app.dispose();
  }
});

test("runtime disposal releases the shared React toaster host", async () => {
  const host = createTestHost("https://example.com/");
  const app = setupRuntime(
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

  try {
    await app.ready;
    assert.ok(host.document.querySelector("[data-rod-toaster='sonner']"));
    await app.dispose();
    assert.equal(host.document.querySelector("[data-rod-toaster='sonner']"), null);
  } finally {
    await app.dispose();
  }
});
