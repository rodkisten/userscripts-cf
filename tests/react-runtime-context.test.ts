import { describe, expect, it } from "vitest";
import { bindRuntime } from "../src/core/runtime-context-react.js";
import type { ReactScriptContext } from "../src/core/react-context-contract.js";

function context(id: string) {
  const controller = new AbortController();
  const ctx: ReactScriptContext = {
    id,
    signal: controller.signal,
    events: { shared: { owner: id } },
  };
  return { controller, ctx };
}

describe("React runtime instance ownership", () => {
  it("keeps callbacks bound to the correct instance", () => {
    const first = context("first");
    const second = context("second");
    const a = bindRuntime(first.ctx);
    const b = bindRuntime(second.ctx);

    expect(a.useContext()).toBe(first.ctx);
    expect(b.useRuntime()).toBe(second.ctx);
    expect(a.useRuntimeWorld()).toEqual({ owner: "first" });
    expect(b.useRuntimeWorld()).toEqual({ owner: "second" });
  });

  it("rejects access after disposal without invalidating another instance", () => {
    const first = context("first");
    const second = context("second");
    const a = bindRuntime(first.ctx);
    const b = bindRuntime(second.ctx);

    first.controller.abort();

    expect(() => a.useContext()).toThrow("ScriptContext has been disposed");
    expect(() => a.useRuntimeWorld()).toThrow("ScriptContext has been disposed");
    expect(b.useContext()).toBe(second.ctx);
  });

  it("does not assume shared events are enabled", () => {
    const controller = new AbortController();
    const ctx: ReactScriptContext = { id: "minimal", signal: controller.signal };
    expect(bindRuntime(ctx).useRuntimeWorld()).toBeUndefined();
  });
});
