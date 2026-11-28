import { describe, expect, it, vi } from "vitest";
import { createRuntimeCleanupScope } from "../src/core/disposal.js";

describe("runtime cleanup scope", () => {
  it("runs cleanup callbacks once in reverse registration order", async () => {
    const calls: number[] = [];
    const scope = createRuntimeCleanupScope();
    scope.add(() => {
      calls.push(1);
    });
    scope.add(() => {
      calls.push(2);
    });
    scope.add(() => {
      calls.push(3);
    });

    await scope.dispose();

    expect(calls).toEqual([3, 2, 1]);
    expect(scope.disposed).toBe(true);
  });

  it("shares one promise across concurrent dispose calls", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const cleanup = vi.fn(() => gate);
    const scope = createRuntimeCleanupScope();
    scope.add(cleanup);

    const first = scope.dispose();
    const second = scope.dispose();

    expect(second).toBe(first);
    expect(cleanup).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("executes callbacks registered after disposal starts immediately", async () => {
    const calls: string[] = [];
    const scope = createRuntimeCleanupScope();
    await scope.dispose();

    scope.add(() => {
      calls.push("late");
    });
    await Promise.resolve();

    expect(calls).toEqual(["late"]);
  });

  it("continues cleanup after a callback rejects", async () => {
    const errors: unknown[] = [];
    const calls: string[] = [];
    const scope = createRuntimeCleanupScope((error) => errors.push(error));
    scope.add(() => {
      calls.push("first");
    });
    scope.add(() => {
      throw new Error("cleanup failed");
    });
    scope.add(() => {
      calls.push("last");
    });

    await expect(scope.dispose()).resolves.toBeUndefined();

    expect(calls).toEqual(["last", "first"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ message: "cleanup failed" });
  });

  it("rejects non-function cleanup registrations", () => {
    const scope = createRuntimeCleanupScope();
    expect(() => scope.add(null as never)).toThrow("Cleanup must be a function");
  });
});
