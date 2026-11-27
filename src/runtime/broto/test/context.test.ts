import { describe, expect, it } from "vitest";
import {
  createOwner,
  createReactiveContext,
  createRequiredContext,
  createRoot,
  hasContext,
  inspectOwnerGraph,
  provide,
  provideReactiveContext,
  requireContext,
  runWithOwner,
  useReactiveContext,
} from "@rodkisten/broto";

describe("Broto context architecture", () => {
  it("throws a descriptive error for missing required contexts", () => {
    const Session = createRequiredContext<{ userId: string }>("Session");

    expect(() => requireContext(Session)).toThrow(
      'Missing provider for required context "Session"',
    );
  });

  it("resolves the nearest provider and exposes context diagnostics", () => {
    const Theme = createRequiredContext<string>("Theme");

    const [result, dispose] = createRoot((_dispose, root) => {
      provide(Theme, "dark");
      const child = createOwner({ name: "Child" });

      const value = runWithOwner(child, () => {
        expect(hasContext(Theme)).toBe(true);
        return requireContext(Theme);
      });

      return { value, snapshot: inspectOwnerGraph(root) };
    }, { name: "Root" });

    expect(result.value).toBe("dark");
    expect(result.snapshot?.contexts).toEqual([
      { description: "Theme", required: true, kind: "context" },
    ]);

    dispose();
  });

  it("provides writable signals through reactive contexts", () => {
    const Theme = createReactiveContext("light", "ReactiveTheme");

    const [state, dispose] = createRoot(() => {
      provideReactiveContext(Theme, "dark");
      return useReactiveContext(Theme);
    });

    expect(state()).toBe("dark");
    state.set("light");
    expect(state()).toBe("light");

    dispose();
  });
});
