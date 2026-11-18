import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { transformRodAst, rodAstPlugin } from "../build/rod-ast.mjs";
import { migrateUserscriptIife } from "../build/rod-ast-iife.mjs";
it("fixture is transformed and output is idempotent", () => {
  const source = readFileSync("tests/fixtures/rod-ast.input.tsx", "utf8");
  const result = transformRodAst(source, "fixture.tsx");
  expect(result.diagnostics).toEqual([]);
  expect(result.code).toMatch(/ctx\.http\.fetch\("\/api\/posts"\)/);
  expect(result.code).toMatch(/document\.addEventListener\("click", onClick\)/);
  expect(result.code).toMatch(/document\.removeEventListener\("click", onClick\)/);
  expect(result.code).toMatch(/return <button className=/);
  expect(transformRodAst(result.code, "fixture.tsx").changed).toBe(false);
});
it("outside explicit ctx scope remains unchanged", () => {
  const code = 'export function ordinary() { return fetch("/api"); }';
  expect(transformRodAst(code, "ordinary.ts").code).toBe(code);
});
it("shadowed fetch is not rewritten", () => {
  const code = 'function init(ctx: unknown) { const fetch = (x: string) => x; return fetch("ok"); }';
  expect(transformRodAst(code, "shadow.ts").code).toBe(code);
});
it("optional Vite plugin is disabled unless registered", () => {
  const plugin = rodAstPlugin();
  expect(plugin.name).toBe("rod-ast");
  expect(plugin.transform('fetch("/")', "file.ts")).toBeNull();
});

it("rewrites typed DOM query aliases and preserves NodeList semantics", () => {
  const input =
    'function init(ctx: ScriptContext) { const one = document.querySelector(".item"); const all = document.querySelectorAll(".item"); return all.item(0) ?? one; }';
  const result = transformRodAst(input, "fixture.ts");
  expect(result.diagnostics).toEqual([]);
  expect(result.code).toContain('ctx.dom.querySelector(".item")');
  expect(result.code).toContain('ctx.dom.querySelectorAll(".item")');
  expect(result.code).toContain("all.item(0)");
  expect(transformRodAst(result.code, "fixture.ts").changed).toBe(false);
});
it("never rewrites unsupported document.createElement", () => {
  const input = 'function init(ctx: ScriptContext) { return document.createElement("div"); }';
  expect(transformRodAst(input, "fixture.ts").code).toBe(input);
});
it("respects opt-out for DOM query rewriting", () => {
  const input = 'function init(ctx: ScriptContext) { return document.querySelector("main"); }';
  expect(transformRodAst(input, "fixture.ts", { domMethods: false }).code).toBe(input);
});

it("rewrites a standalone native listener to ctx.listen with the original target", () => {
  const source = 'function init(ctx: ScriptContext) { document.addEventListener("click", onClick); }';
  const result = transformRodAst(source, "listener.ts");
  expect(result.code).toContain('ctx.listen(document, "click", onClick)');
  expect(result.diagnostics).toEqual([]);
  expect(transformRodAst(result.code, "listener.ts").changed).toBe(false);
});
it("preserves native listeners when explicit removal is present", () => {
  const source =
    'function init(ctx: ScriptContext) { document.addEventListener("click", onClick); document.removeEventListener("click", onClick); }';
  expect(transformRodAst(source, "listener.ts").code).toBe(source);
});
it("rewrites global setInterval to ctx.interval", () => {
  const source = "function init(ctx: ScriptContext) { return setInterval(tick, 1000); }";
  const result = transformRodAst(source, "interval.ts");
  expect(result.code).toContain("ctx.interval(tick, 1000)");
  expect(transformRodAst(result.code, "interval.ts").changed).toBe(false);
});
it("preserves shadowed setInterval", () => {
  const source = "function init(ctx: ScriptContext) { const setInterval = () => 0; return setInterval(); }";
  expect(transformRodAst(source, "interval.ts").code).toBe(source);
});

it("preserves interval IDs when clearInterval is used", () => {
  const source =
    "function init(ctx: ScriptContext) { const id = setInterval(tick, 1000); clearInterval(id); }";
  expect(transformRodAst(source, "timer.ts").code).toBe(source);
});
it("does not rewrite React useContext into an arbitrary ctx variable", () => {
  const source = "function init(ctx: ScriptContext) { return useContext(); }";
  expect(transformRodAst(source, "react.tsx").code).toBe(source);
});
it("preserves MutationObserver until observer ownership is proven", () => {
  const source =
    "function init(ctx: ScriptContext) { const observer = new MutationObserver(callback); observer.observe(document.body, {childList: true}); observer.disconnect(); }";
  expect(transformRodAst(source, "observer.ts").code).toBe(source);
});

it("does not let unrelated function timer cleanup disable a safe transform", () => {
  const code =
    "function first(ctx: ScriptContext) { setInterval(tick, 1000); } function second(ctx: ScriptContext) { const id = setInterval(tock, 2000); clearInterval(id); }";
  const result = transformRodAst(code, "owners.ts");
  expect(result.code).toContain("ctx.interval(tick, 1000)");
  expect(result.code).toContain("setInterval(tock, 2000)");
  expect(result.code).toContain("clearInterval(id)");
});
it("does not let unrelated listener removal disable a safe transform", () => {
  const code =
    'function first(ctx: ScriptContext) { document.addEventListener("click", click); } function second(ctx: ScriptContext) { document.addEventListener("scroll", scroll); document.removeEventListener("scroll", scroll); }';
  const result = transformRodAst(code, "owners.ts");
  expect(result.code).toContain('ctx.listen(document, "click", click)');
  expect(result.code).toContain('document.addEventListener("scroll", scroll)');
});
it("detects cleanup inside nested disposal callbacks of the same owner", () => {
  const code =
    "function init(ctx: ScriptContext) { const id = setInterval(tick, 1000); ctx.onDispose(() => clearInterval(id)); }";
  expect(transformRodAst(code, "nested.ts").code).toBe(code);
});

const matrix = JSON.parse(readFileSync("tests/fixtures/rod-ast.matrix.json", "utf8"));
for (const entry of matrix) {
  it(`matrix: ${entry.name}`, () => {
    const id = entry.name === "jsx" ? "matrix.tsx" : "matrix.ts";
    const result = transformRodAst(entry.source, id);
    expect(result.diagnostics).toEqual([]);
    for (const value of entry.includes) expect(result.code).toContain(value);
    for (const value of entry.excludes) expect(result.code).not.toContain(value);
    expect(transformRodAst(result.code, id).changed).toBe(false);
  });
}

it("migrates classic Tampermonkey IIFE into the actual default init contract", () => {
  const source = `// ==UserScript==
// @name         Legacy Example
// @match        https://example.com/*
// @grant        GM_getValue
// ==/UserScript==
(function () {
  'use strict';
  const element = document.querySelector("main");
  window.addEventListener("load", () => console.log(element));
})();`;
  const result = migrateUserscriptIife(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.code).toContain("export default {");
  expect(result.code).toContain("init(ctx)");
  expect(result.code).toContain('ctx.dom.querySelector("main")');
  expect(result.code).toContain('ctx.listen(window, "load"');
  expect(result.metadata.match).toEqual(["https://example.com/*"]);
  expect(result.metadata.grant).toEqual(["GM_getValue"]);
});
it("preserves unrecognized IIFEs rather than changing behavior", () => {
  const source = '(function (window) { window.alert("hi"); })(window);';
  const result = migrateUserscriptIife(source);
  expect(result.changed).toBe(false);
  expect(result.diagnostics.length).toBeGreaterThan(0);
});
it("does not convert an existing ES module", () => {
  const source = "export default { init(ctx) { return ctx; } };";
  expect(migrateUserscriptIife(source).changed).toBe(false);
});
