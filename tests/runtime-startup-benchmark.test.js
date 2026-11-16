import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { Window } from "happy-dom";
import { build } from "vite";

// Diagnostic benchmark, intentionally without fragile time-based pass/fail
// thresholds. Run on the same machine/runner when comparing commits.
const result = await build({
  configFile: new URL("../vite.config.js", import.meta.url).pathname,
  logLevel: "silent",
  build: {
    write: false,
    lib: {
      entry: new URL("../src/core/runtime.js", import.meta.url).pathname,
      name: "RuntimeBenchmark",
      formats: ["iife"],
    },
  },
});
const code = (Array.isArray(result) ? result : [result])
  .flatMap((item) => item.output)
  .find((item) => item.type === "chunk").code;

describe("runtime startup and SPA diagnostic", () => {
  it("reports cold bootstrap, warm navigation and context teardown", async () => {
    const host = new Window({ url: "https://example.com/on" });
    host.happyDOM.settings.enableJavaScriptEvaluation = true;
    host.happyDOM.settings.suppressInsecureJavaScriptEnvironmentWarning = true;
    host.eval(code);
    let starts = 0;
    let stops = 0;
    const definition = {
      id: "bench",
      matches: ["https://example.com/on"],
      module: {
        init(ctx) {
          starts++;
          ctx.onDispose(() => {
            stops++;
          });
        },
      },
    };
    const started = performance.now();
    const runtime = host.RuntimeBenchmark.createRuntime([definition], { call: async () => undefined }, host);
    await runtime.ready;
    const coldBootstrapMs = performance.now() - started;
    const iterations = 25;
    const navigateStarted = performance.now();
    for (let i = 0; i < iterations; i++) {
      host.history.pushState({}, "", "/off");
      await runtime.navigate();
      host.history.pushState({}, "", "/on");
      await runtime.navigate();
    }
    const spaRoundTripMs = (performance.now() - navigateStarted) / iterations;
    const disposeStarted = performance.now();
    await runtime.dispose();
    const teardownMs = performance.now() - disposeStarted;
    expect(starts).toBe(iterations + 1);
    expect(stops).toBe(starts);
    expect(coldBootstrapMs).toBeGreaterThanOrEqual(0);
    expect(spaRoundTripMs).toBeGreaterThanOrEqual(0);
    console.table([
      {
        coldBootstrapMs: +coldBootstrapMs.toFixed(3),
        spaRoundTripMs: +spaRoundTripMs.toFixed(3),
        teardownMs: +teardownMs.toFixed(3),
        iterations,
      },
    ]);
    await host.happyDOM.abort();
  });
});
