import { describe, expect, it } from "vitest";
import { instrumentErrorCallbacks } from "../build/instrument-errors.mjs";

const instrument = (source) =>
  instrumentErrorCallbacks(source, "/project/src/example.js", { root: "/project" });

describe("AST callback instrumentation", () => {
  it("wraps inline event handlers and attributes source", () => {
    const result = instrument('button.addEventListener("click", () => { throw new Error("boom"); });');
    expect(result.transformed).toBe(1);
    expect(result.code).toContain('"script":"src/example.js"');
    expect(result.code).toContain("__rodGuardCallback(");
  });

  it("leaves named handlers unchanged to preserve removeEventListener identity", () => {
    const source = 'button.addEventListener("click", handler); button.removeEventListener("click", handler);';
    expect(instrument(source)).toEqual({ code: source, transformed: 0 });
  });

  it("preserves this and callback arguments", () => {
    const result = instrument("setTimeout(function (a) { return this.value + a; }, 0);");
    expect(result.transformed).toBe(1);
    expect(result.code).toContain("fn.apply(this, args)");
  });

  it("does not transform strings or unrelated calls", () => {
    const source = 'const message = "setTimeout(() => fail())"; unrelated(() => 1);';
    expect(instrument(source)).toEqual({ code: source, transformed: 0 });
  });

  it("wraps nested callbacks", () => {
    const result = instrument('setTimeout(() => queueMicrotask(() => { throw Error("x"); }), 1);');
    expect(result.transformed).toBe(2);
    expect(result.code.match(/__rodGuardCallback\(/g)?.length).toBe(3);
  });
});
