import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformRodAst, rodAstPlugin } from "../build/rod-ast.mjs";
test("fixture is transformed and output is idempotent", () => {
  const source = readFileSync("tests/fixtures/rod-ast.input.tsx", "utf8");
  const result = transformRodAst(source, "fixture.tsx");
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.code, /ctx\.http\.fetch\("\/api\/posts"\)/);
  assert.match(result.code, /ctx\.events\.dom\.add\(document, "click", onClick\)/);
  assert.match(result.code, /ctx\.events\.dom\.remove\(document, "click", onClick\)/);
  assert.match(result.code, /return <button className=/);
  assert.equal(transformRodAst(result.code, "fixture.tsx").changed, false);
});
test("outside explicit ctx scope remains unchanged", () => {
  const code = 'export function ordinary() { return fetch("/api"); }';
  assert.equal(transformRodAst(code, "ordinary.ts").code, code);
});
test("shadowed fetch is not rewritten", () => {
  const code = 'function init(ctx: unknown) { const fetch = (x: string) => x; return fetch("ok"); }';
  assert.equal(transformRodAst(code, "shadow.ts").code, code);
});
test("optional Vite plugin is disabled unless registered", () => {
  const plugin = rodAstPlugin();
  assert.equal(plugin.name, "rod-ast");
  assert.equal(plugin.transform('fetch("/")', "file.ts"), null);
});
