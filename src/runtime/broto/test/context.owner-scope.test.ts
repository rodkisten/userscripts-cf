import { describe, expect, it } from "vitest";
import {
  captureOwner,
  createContext,
  createOwnerScope,
  createRequiredContext,
  createRoot,
  hasContext,
  provide,
  provideToOwner,
  requireContext,
  resolveContext,
  runWithCapturedOwner,
  useContext,
} from "@rodkisten/broto";

describe("Broto persistent owner scopes", () => {
  it("restores nested owners through a stack", () => {
    const seen: Array<string | undefined> = [];

    const [, dispose] = createRoot((_dispose, root) => {
      seen.push(captureOwner()?.name);

      const child = createOwnerScope({ name: "child", parent: root });
      child.run(() => seen.push(captureOwner()?.name));
      seen.push(captureOwner()?.name);
      child.dispose();
    }, { name: "root" });

    expect(seen).toEqual(["root", "child", "root"]);
    dispose();
  });

  it("resolves the nearest typed context from a reusable scope", () => {
    const Theme = createRequiredContext<"light" | "dark">("Theme");
    const root = createOwnerScope({ name: "root" });
    const child = root.run(() => createOwnerScope({ name: "child" }));

    root.run(() => provide(Theme, "dark"));

    child.run(() => {
      expect(hasContext(Theme)).toBe(true);
      expect(requireContext(Theme)).toBe("dark");
      expect(resolveContext(Theme).owner).toBe(root.owner);
    });

    child.dispose();
    root.dispose();
  });

  it("supports explicit owner provisioning for independently mounted roots", () => {
    const Runtime = createRequiredContext<{ id: string }>("Runtime");
    const root = createOwnerScope({ name: "application" });
    const panel = root.run(() => createOwnerScope({ name: "panel" }));

    provideToOwner(root.owner, Runtime, { id: "shared" });

    const value = runWithCapturedOwner(panel.owner, () => requireContext(Runtime));
    expect(value).toEqual({ id: "shared" });

    panel.dispose();
    root.dispose();
  });

  it("keeps optional defaults separate from required lookup", () => {
    const Locale = createContext("pt-BR", "Locale");
    const Missing = createRequiredContext<string>("Missing");
    const scope = createOwnerScope({ name: "scope" });

    scope.run(() => {
      expect(useContext(Locale)).toBe("pt-BR");
      expect(() => requireContext(Missing)).toThrow(
        '[Broto] Missing provider for required context "Missing".',
      );
    });

    scope.dispose();
  });
});
