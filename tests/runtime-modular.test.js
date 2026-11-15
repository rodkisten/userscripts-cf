import { describe, expect, it } from "vitest";
import { analyzeRuntimeUsage } from "../build/runtime-usage.mjs";

describe("runtime feature selection", () => {
  it("selects only referenced context features", () => {
    expect(analyzeRuntimeUsage('ctx.menu.open(); ctx["toaster"].success("ok");')).toEqual({
      features: ["menu", "toaster"],
      dynamic: false,
    });
  });
  it("recognizes destructuring", () => {
    expect(analyzeRuntimeUsage("const { menu, storage: settings } = ctx;").features).toEqual(["menu", "storage"]);
  });
  it("fails closed on computed keys", () => {
    expect(analyzeRuntimeUsage("ctx[featureName].open()").dynamic).toBe(true);
  });
  it("ignores text and unrelated property access", () => {
    expect(analyzeRuntimeUsage('const text = "ctx.menu"; other.menu.open();').features).toEqual([]);
  });
  it("parses TSX and JSX contexts without treating JSX markup as dynamic access", () => {
    expect(analyzeRuntimeUsage("const view = <button onClick={() => ctx.menu.open({})}>Open</button>;", "widget.tsx")).toEqual({ features: ["menu"], dynamic: false });
    expect(analyzeRuntimeUsage("const view = <button onClick={() => ctx.toaster.success(\"ok\")}>Open</button>;", "widget.jsx")).toEqual({ features: ["toaster"], dynamic: false });
  });
});
