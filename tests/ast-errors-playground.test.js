import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { instrumentErrorCallbacks } from "../build/instrument-errors.mjs";

const html = readFileSync(new URL("../playground/ast-errors.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../playground/ast-errors-app.js", import.meta.url), "utf8");
const hosting = readFileSync(new URL("../build/hosting.mjs", import.meta.url), "utf8");

describe("AST errors playground", () => {
  it("is exposed through the hosting worker", () => {
    expect(hosting).toContain('assets["playground/ast-errors.html"]');
    expect(hosting).toContain('assets["playground/ast-errors.js"]');
    expect(html).toContain('src="/playground/ast-errors.js"');
  });

  it("has editors, language selection, diff and copy actions", () => {
    for (const id of ["input", "output", "language", "diff", "transform", "copy", "status"]) {
      expect(html).toContain('id="' + id + '"');
    }
    for (const lang of ["js", "ts", "tsx"]) expect(html).toContain('value="' + lang + '"');
    expect(app).toContain("instrumentErrorCallbacks");
    expect(app).toContain("diffLines(");
    expect(app).toContain("EditorView");
  });

  it.each([
    ["ts", 'const wait = (ms: number): void => { setTimeout(() => console.log(ms), ms); };'],
    ["tsx", 'export function Demo() { return <button onClick={() => setTimeout(() => console.log("hi"), 1)}>Hi</button>; }'],
  ])("compiles %s before AST instrumentation", (language, source) => {
    const compiled = ts.transpileModule(source, {
      fileName: language === "tsx" ? "example.tsx" : "example.ts",
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    const result = instrumentErrorCallbacks(compiled.outputText, "/playground/example.js", { root: "/playground" });
    expect(result.transformed).toBeGreaterThan(0);
    expect(result.code).toContain("__rodGuardCallback");
  });
});
