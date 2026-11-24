import { describe, expect, it } from "vitest";
import { bumpVersion, createVersionPlan } from "../build/version-plan.mjs";

const definitions = [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }];
const registry = {
  scripts: { alpha: { version: "1.2.3" }, beta: { version: "2.0.0" }, gamma: { version: "3.1.4" } },
};
const graphs = {
  alpha: { files: ["src/shared.ts", "src/alpha.ts"] },
  beta: { files: ["src/shared.ts", "src/beta.ts"] },
  gamma: { files: ["src/gamma.ts"] },
};

describe("version plan", () => {
  it("bumps stable semver independently", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });
  it("fans out a shared AST module to every dependent script", () => {
    const plan = createVersionPlan({
      definitions,
      registry,
      graphs,
      changedFiles: ["./src/shared.ts", "docs/README.md"],
    });
    expect(plan.affected).toEqual(["alpha", "beta"]);
    expect(plan.scripts.alpha.next).toBe("1.2.4");
    expect(plan.scripts.beta.next).toBe("2.0.1");
    expect(plan.scripts.gamma.next).toBe("3.1.4");
  });
});
