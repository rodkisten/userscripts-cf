import { it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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

it("migrates the complete real-world legacy fixture and preserves metadata", () => {
  const input = readFileSync("tests/fixtures/rod-ast.legacy.user.js", "utf8");
  const result = migrateUserscriptIife(input, "rod-ast.legacy.user.js");
  expect(result.diagnostics).toEqual([]);
  expect(result.code).toContain("export default {");
  expect(result.code).toContain("init(ctx)");
  expect(result.code).toContain('ctx.http.fetch("/api/legacy")');
  expect(result.code).toContain('ctx.http.fetch("/api/window")');
  expect(result.code).toContain('self.fetch("/api/self")');
  expect(result.code).toContain('parent.fetch("/api/parent")');
  expect(result.code).toContain("new MutationObserver(");
  expect(result.code).toContain('ctx.gm.legacy.getValue("key")');
  expect(result.code).toContain('ctx.gm.legacy.setValue("key", read)');
  expect(result.metadata.match).toHaveLength(2);
  expect(result.metadata.grant).toEqual(["GM_getValue", "GM_setValue", "GM_addStyle"]);
  expect(result.metadata.require).toEqual(["https://cdn.example.com/library.js"]);
  expect(result.metadata.resource).toEqual(["ICON https://cdn.example.com/icon.svg"]);
  expect(result.metadata["run-at"]).toEqual(["document-start"]);
  expect(result.metadata.connect).toEqual(["api.example.com"]);
  expect(transformRodAst(result.code, "output.js").changed).toBe(false);
});

it("symbol analysis converts only the timer not manually cancelled", () => {
  const input =
    "function init(ctx) { const a = setInterval(one, 100); const b = setInterval(two, 200); clearInterval(a); }";
  const output = transformRodAst(input, "symbols.ts").code;
  expect(output).toContain("const a = setInterval(one, 100)");
  expect(output).toContain("const b = ctx.interval(two, 200)");
  expect(output).toContain("clearInterval(a)");
});
it("symbol analysis distinguishes identically named variables in nested scopes", () => {
  const input =
    "function init(ctx) { const id = setInterval(one, 100); { const id = setInterval(two, 200); clearInterval(id); } }";
  const output = transformRodAst(input, "symbols.ts").code;
  expect(output).toContain("const id = ctx.interval(one, 100)");
  expect(output).toContain("const id = setInterval(two, 200)");
});
it("dynamic clearInterval keeps all timers native", () => {
  const input = "function init(ctx) { const a = setInterval(one, 100); clearInterval(getTimer()); }";
  expect(transformRodAst(input, "symbols.ts").code).toBe(input);
});
it("native interval variadic arguments are preserved", () => {
  const input = "function init(ctx) { setInterval(tick, 100, 'extra'); }";
  expect(transformRodAst(input, "symbols.ts").code).toBe(input);
});

it("CLI migrates legacy IIFE and writes a valid JSON report", () => {
  const directory = mkdtempSync(join(tmpdir(), "rod-ast-cli-"));
  try {
    const output = join(directory, "migrated.js");
    const report = join(directory, "report.json");
    execFileSync(process.execPath, [
      "build/rod-ast-cli.mjs",
      "tests/fixtures/rod-ast.legacy.user.js",
      "--iife",
      `--out=${output}`,
      `--report=${report}`,
    ]);
    expect(existsSync(output)).toBe(true);
    const result = JSON.parse(readFileSync(report, "utf8"));
    expect(result.diagnostics).toEqual([]);
    expect(result.metadata.match).toHaveLength(2);
    expect(readFileSync(output, "utf8")).toContain("export default {");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("listener symbols: only the matching target and event stay native", () => {
  const input =
    'function init(ctx) { const handler = () => {}; document.addEventListener("click", handler); document.removeEventListener("click", handler); window.addEventListener("scroll", handler); }';
  const output = transformRodAst(input, "listener-symbols.ts").code;
  expect(output).toContain('document.addEventListener("click", handler)');
  expect(output).toContain('ctx.listen(window, "scroll", handler)');
});
it("listener symbols: distinct callbacks on same event remain independent", () => {
  const input =
    'function init(ctx) { const a = () => {}; const b = () => {}; document.addEventListener("click", a); document.removeEventListener("click", a); document.addEventListener("click", b); }';
  const output = transformRodAst(input, "listener-symbols.ts").code;
  expect(output).toContain('document.addEventListener("click", a)');
  expect(output).toContain('ctx.listen(document, "click", b)');
});
it("listener symbols: dynamic removal remains conservative", () => {
  const input =
    'function init(ctx) { const handler = () => {}; document.addEventListener("click", handler); document.removeEventListener(eventName, handler); }';
  expect(transformRodAst(input, "listener-symbols.ts").code).toBe(input);
});

it("listener symbols: unrelated event on same target can use context ownership", () => {
  const input =
    'function init(ctx) { const h = () => {}; document.addEventListener("click", h); document.removeEventListener("click", h); document.addEventListener("keydown", h); }';
  const output = transformRodAst(input, "listener-symbols.ts").code;
  expect(output).toContain('document.addEventListener("click", h)');
  expect(output).toContain('ctx.listen(document, "keydown", h)');
  expect(transformRodAst(output, "listener-symbols.ts").changed).toBe(false);
});

it("preserves explicit querySelectorAll generic arguments and inferred selectors", () => {
  const input =
    'function init(ctx: ScriptContext) { const a = document.querySelectorAll<HTMLButtonElement>(".action"); const b = document.querySelectorAll("a"); const c = document.querySelector("input"); }';
  const result = transformRodAst(input, "selector-types.ts");
  expect(result.diagnostics).toEqual([]);
  expect(result.code).toContain('ctx.dom.querySelectorAll<HTMLButtonElement>(".action")');
  expect(result.code).toContain('ctx.dom.querySelectorAll("a")');
  expect(result.code).toContain('ctx.dom.querySelector("input")');
  expect(transformRodAst(result.code, "selector-types.ts").changed).toBe(false);
});

it("rewrites direct legacy and modern GM calls to the context bridge", () => {
  const input =
    'function init(ctx) { GM_setValue("key", 1); GM_getValue("key"); GM.addStyle("body{}"); GM.xmlhttpRequest({ url: "/api" }); }';
  const output = transformRodAst(input, "gm.ts").code;
  expect(output).toContain('ctx.gm.legacy.setValue("key", 1)');
  expect(output).toContain('ctx.gm.legacy.getValue("key")');
  expect(output).toContain('ctx.gm.modern.addStyle("body{}")');
  expect(output).toContain('ctx.gm.modern.xmlhttpRequest({ url: "/api" })');
});
it("does not rewrite shadowed GM bindings or unknown GM methods", () => {
  const input = "function init(ctx) { const GM = { getValue: () => 1 }; GM.getValue(); GM_unknown(); }";
  expect(transformRodAst(input, "gm.ts").code).toBe(input);
});
it("preserves GM availability guards until the runtime provides equivalent fallback semantics", () => {
  const input = 'function init(ctx) { if (typeof GM_getValue === "function") GM_getValue("key"); }';
  const output = transformRodAst(input, "gm.ts").code;
  expect(output).toContain('typeof GM_getValue === "function"');
});
it("preserves synchronous localStorage try/catch until async migration can be proven safe", () => {
  const input =
    'function init(ctx) { try { return localStorage.getItem("key"); } catch (error) { return "fallback"; } }';
  expect(transformRodAst(input, "storage.ts").code).toBe(input);
});

it("GM rewrites remain idempotent and honor @keep", () => {
  const input = 'function init(ctx) { GM_setValue("x", 1); // @keep\n GM_getValue("y"); }';
  const once = transformRodAst(input, "gm-keep.ts");
  expect(once.diagnostics).toEqual([]);
  expect(once.code).toContain('ctx.gm.legacy.setValue("x", 1)');
  expect(once.code).toContain('GM_getValue("y")');
  expect(transformRodAst(once.code, "gm-keep.ts").changed).toBe(false);
});
it("GM availability checks retain both branches until fallback parity is proven", () => {
  const input =
    'function init(ctx) { if (typeof GM_getValue === "function") { return GM_getValue("x"); } return localStorage.getItem("x"); }';
  const result = transformRodAst(input, "gm-fallback.ts");
  expect(result.code).toBe(input);
});

it("GM opt-out disables all automatic GM rewrites", () => {
  const input = 'function init(ctx) { GM_getValue("x"); GM.setValue("x", 2); }';
  expect(transformRodAst(input, "gm-opt-out.ts", { gm: false }).code).toBe(input);
});

it("does not erase GM guards with missing-grant fallback", () => {
  const input =
    'function init(ctx) { if (typeof GM_setValue === "function") { GM_setValue("k", "v"); } else { localStorage.setItem("k", "v"); } }';
  const output = transformRodAst(input, "gm-guards.ts").code;
  expect(output).toBe(input);
});

it("does not rewrite already migrated context GM values", () => {
  const input = 'async function init(ctx) { const value = await ctx.gm.values.get("key", null); await ctx.gm.values.set("key", value); }';
  const result = transformRodAst(input, "gm-values.ts");
  expect(result.diagnostics).toEqual([]);
  expect(result.code).toBe(input);
});
