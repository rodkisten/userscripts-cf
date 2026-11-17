import assert from "node:assert/strict";
import { test } from "vitest";
import { Window } from "happy-dom";
import { build } from "vite";

// Exercise the actual Solid runtime and RuntimeProvider, not a mock provider.
const fixture = await build({
  configFile: new URL("../vite.config.js", import.meta.url).pathname,
  logLevel: "silent",
  build: {
    write: false,
    lib: {
      entry: new URL("../src/core/runtime-solid.ts", import.meta.url).pathname,
      name: "SolidRuntimeFixture",
      formats: ["iife"],
    },
  },
});
const code = (Array.isArray(fixture) ? fixture : [fixture])
  .flatMap((result) => result.output)
  .find((chunk) => chunk.type === "chunk").code;

test("Solid provider binds two concurrent script contexts and disposes each on navigation", async () => {
  const host = new Window({ url: "https://example.com/on" });
  host.happyDOM.settings.enableJavaScriptEvaluation = true;
  host.happyDOM.settings.suppressInsecureJavaScriptEnvironmentWarning = true;
  host.process = process;
  host.eval(code);
  const observed = new Map();
  const contexts = new Map();
  const definitions = ["reddit-a", "reddit-b"].map((id) => ({
    id,
    matches: ["https://example.com/on"],
    module: {
      init(ctx) {
        contexts.set(id, ctx);
        ctx.ui.mountSolid(() => {
          const resolved = host.useContext();
          observed.set(id, resolved);
          const node = host.document.createElement("span");
          node.textContent = resolved.id;
          return node;
        });
      },
    },
  }));
  try {
    const app = host.SolidRuntimeFixture.createRuntime(definitions, { call: async () => undefined }, host);
    await app.ready;
    assert.equal(observed.size, 2);
    for (const id of ["reddit-a", "reddit-b"]) {
      assert.equal(observed.get(id), contexts.get(id));
      assert.equal(observed.get(id).id, id);
    }
    assert.notEqual(observed.get("reddit-a"), observed.get("reddit-b"));
    host.history.pushState({}, "", "/off");
    await app.navigate();
    for (const ctx of contexts.values()) assert.equal(ctx.signal.aborted, true);
    await app.dispose();
  } finally {
    await host.happyDOM.abort();
  }
});
