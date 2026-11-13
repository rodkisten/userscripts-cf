import { test } from "vitest";
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

test("rewrites modern and legacy GM calls but honors @keep", () => {
  const output = transform(`function init(ctx) {
    GM.getValue("token");
    GM_setValue("token", "value");
    GM.xmlHttpRequest({ url: "/api" });
    // @keep
    GM_getValue("native");
  }`);
  assert.match(output, /ctx\.gm\.modern\.getValue\("token"\)/);
  assert.match(output, /ctx\.gm\.legacy\.setValue\("token", "value"\)/);
  assert.match(output, /ctx\.gm\.modern\.xmlHttpRequest\(/);
  assert.match(output, /GM_getValue\("native"\)/);
});

test("rewrites GM aliases and optional calls", () => {
  const output = transform(`function init(ctx) {
    const read = GM.getValue;
    const legacyRead = GM_getValue;
    GM?.setValue?.("key", 1);
    GM_getValue?.("key");
  }`);
  assert.match(output, /const read = ctx\.gm\.modern\.getValue/);
  assert.match(output, /const legacyRead = ctx\.gm\.legacy\.getValue/);
  assert.match(output, /ctx\.gm\.modern\?\.setValue\?\.\("key", 1\)/);
  assert.match(output, /ctx\.gm\.legacy\.getValue\?\.\("key"\)/);
});

test("does not rewrite shadowed GM bindings", () => {
  const output = transform(`function init(ctx) {
    { const GM = custom; GM.getValue("local"); }
    { const GM_getValue = custom; GM_getValue("local"); }
    GM.getValue("native");
  }`);
  assert.match(output, /GM\.getValue\("local"\)/);
  assert.match(output, /GM_getValue\("local"\)/);
  assert.match(output, /ctx\.gm\.modern\.getValue\("native"\)/);
});

test("rewrites GM object destructuring and preserves property names", () => {
  const output = transform(`function init(ctx) {
    const { getValue, setValue: write } = GM;
    const api = GM;
    const options = { GM_getValue: true };
    const read = GM_getValue;
  }`);
  assert.match(output, /\{ getValue, setValue: write \} = ctx\.gm\.modern/);
  assert.match(output, /const api = ctx\.gm\.modern/);
  assert.match(output, /\{ GM_getValue: true \}/);
  assert.match(output, /const read = ctx\.gm\.legacy\.getValue/);
});
