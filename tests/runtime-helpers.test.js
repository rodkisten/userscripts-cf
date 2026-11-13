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

test("does not rewrite shadowed browser globals", () => {
  const output = transform(`function init(ctx) {
    { const fetch = customFetch; fetch("/local"); }
    { const document = localDocument; document.querySelector(".local"); }
    fetch("/global");
    document.querySelectorAll(".global");
  }`);
  assert.match(output, /fetch\("\/local"\)/);
  assert.match(output, /document\.querySelector\("\.local"\)/);
  assert.match(output, /ctx\.http\.fetch\("\/global"\)/);
  assert.match(output, /ctx\.dom\.querySelectorAll\("\.global"\)/);
});

test("does not rewrite calls when context is shadowed by a nested function", () => {
  const output = transform(`function init(ctx) {
    function inner(ctx) { fetch("/inner"); }
    fetch("/outer");
  }`);
  assert.match(output, /ctx\.http\.fetch\("\/outer"\)/);
});

test("rewrites inferred element queries without changing unrelated objects", () => {
  const output = transform(`function init(ctx) {
    const container = document.querySelector("#app");
    const item = container.querySelector(".item");
    const items = container.querySelectorAll(".item");
    const service = createService();
    service.querySelector(".custom");
  }`);
  assert.match(output, /ctx\.dom\.scope\(container\)\.querySelector\("\.item"\)/);
  assert.match(output, /ctx\.dom\.scope\(container\)\.querySelectorAll\("\.item"\)/);
  assert.match(output, /service\.querySelector\("\.custom"\)/);
});
