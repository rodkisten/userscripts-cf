import test from "node:test";
import assert from "node:assert/strict";
import { runtimeHelpers } from "../build/runtime-helpers.mjs";

const transform = (source) => runtimeHelpers().transform(source, "/src/example.ts")?.code ?? source;

test("rewrites native calls only inside a context-bound function", () => {
  const output = transform(`fetch("/outside"); function init(ctx) { fetch("/inside"); document.querySelector(".x"); document.querySelectorAll(".x"); }`);
  assert.match(output, /fetch\("\/outside"\)/);
  assert.match(output, /ctx\.http\.fetch\("\/inside"\)/);
  assert.match(output, /ctx\.dom\.querySelector\("\.x"\)/);
  assert.match(output, /ctx\.dom\.querySelectorAll\("\.x"\)/);
});

test("supports @keep single-line and multiline comments", () => {
  const output = transform(`function init(ctx) {
    // @keep
    fetch("/one");
    /* @keep */
    document.querySelector(".a");
    fetch("/two");
  }`);
  assert.match(output, /fetch\("\/one"\)/);
  assert.match(output, /document\.querySelector\("\.a"\)/);
  assert.match(output, /ctx\.http\.fetch\("\/two"\)/);
});
