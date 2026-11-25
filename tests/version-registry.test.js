import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundleInventory, loadVersionRegistry, versionForTarget } from "../build/version-registry.mjs";

describe("userscript version registry", () => {
  it("validates configured IDs and resolves individual target versions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "userscripts-version-registry-"));
    await fs.writeFile(
      path.join(root, "userscripts.versions.json"),
      JSON.stringify({ schemaVersion: 1, scripts: { alpha: { version: "1.2.3" } } }),
    );

    const registry = await loadVersionRegistry(root, [{ id: "alpha" }]);
    expect(versionForTarget("alpha", "8.0.0", registry)).toBe("1.2.3");
    expect(versionForTarget("standalone", "8.0.0", registry)).toBe("8.0.0");
    await fs.rm(root, { recursive: true, force: true });
  });

  it("writes standalone inventory after the userscript manifest", () => {
    const inventory = bundleInventory(
      { id: "standalone", definitions: [{ id: "alpha" }, { id: "beta" }] },
      { scripts: { alpha: { version: "1.2.3" }, beta: { version: "4.5.6" } } },
      "abcdef123456",
    );

    expect(inventory).toContain("// ==RodBundle==");
    expect(inventory).toContain("// @rod-includes alpha@1.2.3");
    expect(inventory).toContain("// @rod-includes beta@4.5.6");
    expect(inventory).toContain("// ==/RodBundle==");
  });
});
