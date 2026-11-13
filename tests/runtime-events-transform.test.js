import test from "node:test";
import assert from "node:assert/strict";
import { runtimeHelpers } from "../build/runtime-helpers.mjs";
import { createGMBridge } from "../src/runtime/gm-bridge.js";

test("TypeScript AST rewrites context DOM listeners and GM calls", () => {
  const code = `function boot(ctx) {
    document.addEventListener("click", handler);
    document.removeEventListener("click", handler);
    GM_registerMenuCommand("Settings", handler);
  }`;
  const output = runtimeHelpers().transform(code, "/tmp/example.ts").code;
  assert.match(output, /ctx\.events\.dom\.add\.bind\(null, document\)/);
  assert.match(output, /ctx\.events\.dom\.remove\.bind\(null, document\)/);
  assert.match(output, /ctx\.gm\.legacy\.registerMenuCommand/);
});

test("GM wrapper calls original and mirrors registration and removal", () => {
  const emitted = [];
  const native = [];
  const host = {
    GM_registerMenuCommand: (...args) => { native.push(args); return 7; },
    GM_unregisterMenuCommand: (id) => native.push(["remove", id]),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    document: { dispatchEvent: (event) => emitted.push(event.detail) },
  };
  const gm = createGMBridge(host, "repl");
  const callback = () => {};
  assert.equal(gm.legacy.registerMenuCommand("Open", callback), 7);
  assert.equal(native.length, 1);
  assert.equal(emitted[0].moduleId, "repl");
  assert.equal(emitted[0].callback, callback);
  gm.legacy.unregisterMenuCommand(7);
  assert.deepEqual(native[1], ["remove", 7]);
  assert.equal(emitted[1].type, "unregister");
});

test("AST rewrites listeners on statically identified DOM elements", () => {
  const source = `function init(ctx) {
    const button = document.createElement("button");
    button.addEventListener("click", handler, { once: true });
    button.removeEventListener("click", handler);
  }`;
  const output = runtimeHelpers().transform(source, "/tmp/element.ts").code;
  assert.match(output, /ctx\\.events\\.dom\\.add\\.bind\\(null, button\\)/);
  assert.match(output, /ctx\\.events\\.dom\\.remove\\.bind\\(null, button\\)/);
});
