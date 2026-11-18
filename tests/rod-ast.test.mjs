import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { transformRodAst, rodAstPlugin } from "../build/rod-ast.mjs";
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
  const input = 'function init(ctx: ScriptContext) { const one = document.querySelector(".item"); const all = document.querySelectorAll(".item"); return all.item(0) ?? one; }';
  const result = transformRodAst(input, "fixture.ts");
  expect(result.diagnostics).toEqual([]);
  expect(result.code).toContain('ctx.dom.querySelector(".item")');
  expect(result.code).toContain('ctx.dom.querySelectorAll(".item")');
  expect(result.code).toContain('all.item(0)');
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
