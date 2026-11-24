import { test } from "vitest";
import assert from "node:assert/strict";
import { compile } from "../src/userscripts/page-repl/compiler.js";
import { createRunner } from "../src/userscripts/page-repl/runner.js";
import { createStrategies, automaticCandidates } from "../src/userscripts/page-repl/strategies.js";
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

test("REPL scope resolver keeps local bindings local while persisting globals", async () => {
  const first = await evaluate("const saved = 5; var outer = 2; ({ saved, outer })");
  assert.deepEqual(first.value, { saved: 5, outer: 2 });

  const second = await evaluate(
    "(() => { const saved = 9; { let outer = 7; if (outer !== 7) throw Error('shadow'); } return saved; })() + saved + outer",
    first.ctx,
    ["saved", "outer"],
  );
  assert.equal(second.value, 16);

  const blockVar = await evaluate("{ var persisted = 4; } persisted");
  assert.equal(blockVar.value, 4);
  assert.equal(blockVar.ctx.vars.persisted, 4);

  const blockLet = await evaluate("{ let privateValue = 7; } typeof privateValue");
  assert.equal(blockLet.value, "undefined");
  assert.equal("privateValue" in blockLet.ctx.vars, false);
});

test("REPL scope resolver preserves implicit arguments and class-local names", async () => {
  const ctx = { vars: { arguments: 100 } };
  const args = await evaluate("function count() { return arguments.length; } count(1, 2, 3)", ctx, [
    "arguments",
  ]);
  assert.equal(args.value, 3);

  const klass = await evaluate(
    "class Box { static self() { return Box; } value() { return 4; } } Box.self() === Box && new Box().value()",
  );
  assert.equal(klass.value, 4);
});

test("REPL range emitter preserves source syntax while rewriting persistent bindings", async () => {
  const result = await evaluate(
    "const key = 'x'; const obj = {key, [key]: key, method() { return key; }}; `value:${obj.method()}:${obj.x}`",
  );
  assert.equal(result.value, "value:x:x");

  const sequence = await evaluate("let a = 1, b = 2; for (var n of [3, 4]) a += n; a + b + n");
  assert.equal(sequence.value, 14);

  const previous = await evaluate("const a = 3; ({a})");
  const reused = await evaluate("({a, label: a})", previous.ctx, ["a"]);
  assert.deepEqual(reused.value, { a: 3, label: 3 });
});

test("REPL range emitter preserves function hoisting and class identity", async () => {
  const fn = await evaluate("const n = twice(4); function twice(value) { return value * 2; } n");
  assert.equal(fn.value, 8);

  const klass = await evaluate(
    "class Box { static self() { return Box; } constructor(value) { this.value = value; } } new Box(5).value",
  );
  assert.equal(klass.value, 5);
});

test("Lezer compiler preserves persistent bindings through native lexical scope", async () => {
  const first = await evaluate("let n = 2; function inc(step = 1) { n += step; return n; } inc()");
  assert.equal(first.value, 3);

  const second = await evaluate(
    "(() => { let n = 10; return n; })() + inc(2) + n",
    first.ctx,
    ["n", "inc"],
  );
  assert.equal(second.value, 20);
  assert.equal(second.ctx.vars.n, 5);
});

test("Lezer compiler handles destructuring, bare var and for bindings", async () => {
  const destructured = await evaluate(
    "const {a, nested: {b}, c = 4} = {a: 1, nested: {b: 2}}; const [x, ...rest] = [3, 4, 5]; ({a, b, c, x, rest})",
  );
  assert.deepEqual(destructured.value, { a: 1, b: 2, c: 4, x: 3, rest: [4, 5] });

  const bare = await evaluate("var empty; empty");
  assert.equal(bare.value, undefined);
  assert.equal(Object.hasOwn(bare.ctx.vars, "empty"), true);

  const loop = await evaluate("let total = 0; for (var item of [1, 2, 3]) total += item; total + item");
  assert.equal(loop.value, 9);
});

test("Lezer compiler keeps reserved names out of the persistent with scope", async () => {
  const result = await evaluate("const value = typeof console.log; value");
  assert.equal(result.value, "function");
  assert.throws(() => compile("const console = 1"), /reservado/);
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

test("automatic selection covers every expected page strategy, including Trusted Types", () => {
  const host = new Window();
  const methods = createStrategies(host).filter((method) => !method.advanced);
  const candidates = automaticCandidates(methods);
  assert.ok(candidates.some((method) => method.id === "script-trusted-types"));
  assert.ok(candidates.some((method) => method.id === "gm-modern-script"));
  assert.ok(candidates.some((method) => method.id === "page-import-blob"));
  assert.ok(!candidates.some((method) => method.id === "sandbox-eval-global"));
  assert.equal(candidates[0].id, "gm-script");
});
