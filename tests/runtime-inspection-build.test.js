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
    expect(audit.repeatedRenderedModules.length).toBeGreaterThan(0);
    expect(audit.summary.repeatedRenderedModules).toBe(audit.repeatedRenderedModules.length);
    for (const entry of audit.repeatedRenderedModules) {
      expect(entry.bundles.length).toBeGreaterThan(1);
      expect(entry.aggregateRenderedBytes).toBe(entry.bundles.reduce((sum, item) => sum + item.renderedBytes, 0));
      expect(entry.maxRenderedBytes).toBe(Math.max(...entry.bundles.map((item) => item.renderedBytes)));
    }
    expect(audit.repeatedRenderedModules.map((item) => item.aggregateRenderedBytes)).toEqual(
      [...audit.repeatedRenderedModules.map((item) => item.aggregateRenderedBytes)].sort((a, b) => b - a)
    );
    for (const script of manifest.scripts) {
      const target = audit.targets[script.id];
      expect(target).toBeDefined();
      expect(target.features).toEqual([...target.features].sort());
      const hasDynamicAccess = target.scripts.some((id) => audit.scripts[id].dynamic);
      expect(target.treeShaken).toBe(script.id !== "standalone" && !hasDynamicAccess);
      expect(audit.bundles).toBeDefined();
      expect(target.output.bytes).toBeGreaterThan(0);
      expect(target.output.gzipBytes).toBeGreaterThan(0);
      expect(target.output.gzipBytes).toBeLessThan(target.output.bytes);
      expect(target.output.runtimes.length).toBeGreaterThan(0);
      // Assert the actual Rolldown module graph, not merely the requested flags.
      // A disabled feature must contribute zero rendered bytes to the output.
      const optionalModules = {
        __ROD_FEATURE_MENU__: "src/runtime/modular/features/menu.ts",
        __ROD_FEATURE_TOASTER__: "src/runtime/modular/features/toaster.ts",
        __ROD_FEATURE_CLIPBOARD__: "src/runtime/modular/features/clipboard.ts",
        __ROD_FEATURE_GM__: "src/runtime/modular/features/gm.ts",
        __ROD_FEATURE_DOM__: "src/runtime/modular/features/dom.ts",
        __ROD_FEATURE_UI__: "src/runtime/modular/features/ui.ts",
        __ROD_FEATURE_HTTP__: "src/runtime/modular/features/http.ts",
      };
      for (const runtime of target.output.runtimes) {
        const report = audit.bundles[script.id + ":" + runtime.world];
        expect(report).toBeDefined();
        for (const [flag, module] of Object.entries(optionalModules)) {
          if (runtime.featureDefines[flag] !== false) continue;
          const retained = report.modules.filter((item) => item.id.endsWith(module) && item.renderedBytes > 0);
          expect(retained, `Disabled ${flag} retained ${module} in ${script.id}:${runtime.world}`).toEqual([]);
        }
      }
      for (const runtime of target.output.runtimes) {
        expect(runtime.includedModuleCount).toBeGreaterThan(0);
        expect(runtime.topModules.length).toBeGreaterThan(0);
        expect(runtime.topModules.every((module) => module.renderedBytes > 0)).toBe(true);
      }
      const expected = new Set(target.scripts.flatMap((id) => audit.scripts[id].features));
      expect(target.features).toEqual([...expected].sort());
    }
  });
});
