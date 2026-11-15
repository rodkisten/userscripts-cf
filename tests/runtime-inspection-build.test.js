import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

describe("inspectable build artifacts", () => {
  it("emits plain JavaScript alongside every installable userscript", async () => {
    const dist = path.resolve("dist");
    const manifest = JSON.parse(await fs.readFile(path.join(dist, "manifest.json"), "utf8"));
    for (const script of manifest.scripts) {
      expect(script.debugFile).toBe(script.id + ".js");
      const debug = await fs.readFile(path.join(dist, script.debugFile), "utf8");
      const installable = await fs.readFile(path.join(dist, script.file), "utf8");
      expect(debug.length).toBeGreaterThan(0);
      expect(debug).not.toMatch(/^\/\/ ==UserScript==/);
      expect(installable).toMatch(/^\/\/ ==UserScript==/);
    }
    const audit = JSON.parse(await fs.readFile(path.join(dist, "runtime-feature-audit.json"), "utf8"));
    expect(Object.keys(audit.scripts).length).toBeGreaterThan(0);
    expect(audit.targets.standalone).toBeDefined();
    expect(audit.targets.unified).toBeDefined();
    for (const script of manifest.scripts) {
      const target = audit.targets[script.id];
      expect(target).toBeDefined();
      expect(target.features).toEqual([...target.features].sort());
      const hasDynamicAccess = target.scripts.some((id) => audit.scripts[id].dynamic);
      expect(target.treeShaken).toBe(script.id !== "standalone" && !hasDynamicAccess);
      expect(audit.bundles).toBeDefined();
      const expected = new Set(target.scripts.flatMap((id) => audit.scripts[id].features));
      expect(target.features).toEqual([...expected].sort());
    }
  });
});
