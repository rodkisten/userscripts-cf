import test from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/userscripts/page-repl/compiler.js";
import { createRunner } from "../src/userscripts/page-repl/runner.js";
import { createStrategies } from "../src/userscripts/page-repl/strategies.js";
import { Window } from "happy-dom";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function evaluate(source, ctx = { vars: {} }, knownNames = []) {
  const compiled = compile(source, { knownNames });
  const execute = new AsyncFunction("ctx", "console", "$", "$$", "$0", "_", compiled.code);
  return { value: await execute(ctx, console), ctx, compiled };
}

test("REPL persists declarations and closures, resolves previous names and returns final expression", async () => {
  const first = await evaluate("let n = 2; function next() { return ++n; } await Promise.resolve(); next()");
  assert.equal(first.value, 3);
  const second = await evaluate("next() + n", first.ctx, ["n", "next"]);
  assert.equal(second.value, 8);
  assert.equal(second.ctx.vars.n, 4);
  const destructured = await evaluate("const {a, b: value = 3} = {a: 4}; const [x] = [2]; ({a, value, x})");
  assert.deepEqual(destructured.value, { a: 4, value: 3, x: 2 });
});

test("REPL preserves local shadowing, hoisted functions and loop declarations", async () => {
  assert.equal((await evaluate("const x=10; function local(x) { return x + 1; } local(3) + x")).value, 14);
  assert.equal((await evaluate("const n = add(2); function add(x) { return x + 1; } n")).value, 3);
  assert.equal((await evaluate("let total = 0; for (var n of [1, 2, 3]) total += n; total")).value, 6);
  assert.throws(() => compile("const ctx = 1"), /reservado/);
});

test("runner receives values, console and context evidence, without duplicating transports", async () => {
  const host = new Window({
    url: "https://example.com",
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  const events = [];
  const runner = createRunner({ host, onEvent: (event) => events.push(event), timeout: 500 });
  try {
    const result = await runner.run(
      { id: "fixture", label: "fixture", world: "test", run: (source) => host.eval(source) },
      compile("const value=2; console.log(value); await Promise.resolve(value + 1)").code,
    );
    assert.equal(result.status, "OK");
    assert.equal(result.detail.value, 3);
    assert.equal(result.detail.evidence.href, "https://example.com/");
    assert.equal(events.filter((event) => event.type === "console").length, 1);
    assert.equal(events.filter((event) => event.type === "finished").length, 1);
  } finally {
    runner.dispose();
    await host.happyDOM.abort();
  }
});

test("unresolved loader promise does not prevent timeout or cancellation from completing", async () => {
  const host = new Window({ url: "https://example.com" });
  const runner = createRunner({ host, timeout: 20 });
  try {
    const result = await runner.run(
      { id: "blocked", label: "blocked", run: () => new Promise(() => {}) },
      "return 1",
    );
    assert.equal(result.status, "TIMEOUT");
    const controller = new AbortController();
    const pending = runner.run(
      { id: "cancelled", label: "cancelled", run: () => new Promise(() => {}) },
      "return 1",
      { signal: controller.signal },
    );
    controller.abort();
    assert.equal((await pending).status, "CANCELADO");
  } finally {
    runner.dispose();
    await host.happyDOM.abort();
  }
});

test("strategy inventory has 27 distinct methods and identifies optional JavaScript URLs", () => {
  const host = new Window();
  const methods = createStrategies(host);
  assert.equal(methods.length, 27);
  assert.equal(new Set(methods.map((item) => item.id)).size, 27);
  assert.equal(methods.find((item) => item.id === "javascript-url").advanced, true);
});

test("raw script mode preserves native global var without REPL declaration rewriting", async () => {
  const host = new Window({
    url: "https://example.com",
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  });
  const runner = createRunner({ host, timeout: 500 });
  try {
    const result = await runner.run(
      { id: "raw", label: "raw", world: "test", run: (source) => host.eval(source) },
      "var rawCounter = 7;",
      { raw: true },
    );
    assert.equal(result.status, "OK");
    assert.equal(host.rawCounter, 7);
    assert.equal(result.detail.value.mode, "script-global");
  } finally {
    runner.dispose();
    await host.happyDOM.abort();
  }
});
