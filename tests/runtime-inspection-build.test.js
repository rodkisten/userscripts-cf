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
      expect(entry.aggregateRenderedBytes).toBe(
        entry.bundles.reduce((sum, item) => sum + item.renderedBytes, 0),
      );
      expect(entry.maxRenderedBytes).toBe(Math.max(...entry.bundles.map((item) => item.renderedBytes)));
    }
    expect(audit.repeatedRenderedModules.map((item) => item.aggregateRenderedBytes)).toEqual(
      [...audit.repeatedRenderedModules.map((item) => item.aggregateRenderedBytes)].sort((a, b) => b - a),
    );
    const editors = JSON.parse(await fs.readFile(path.join(dist, "editor-dependency-audit.json"), "utf8"));
    expect(editors.schema).toBe(1);
    for (const [target, stats] of Object.entries(editors.bundles)) {
      const source = audit.bundles[target];
      expect(source, target).toBeDefined();
      const modules = Object.values(stats.families).flatMap((family) => family.modules);
      expect(stats.totalEditorRenderedBytes).toBe(modules.reduce((sum, item) => sum + item.renderedBytes, 0));
      for (const item of modules) {
        expect(
          source.modules.some(
            (module) => module.id === item.id && module.renderedBytes === item.renderedBytes,
          ),
        ).toBe(true);
      }
    }
    expect(editors.bundles["dom-inspector:sandbox"].families.codemirror.renderedBytes).toBeGreaterThan(0);
    expect(editors.bundles["github-color-studio:sandbox"].families.codemirror.renderedBytes).toBeGreaterThan(0);
    expect(editors.bundles["page-repl:sandbox"].families.codemirror.renderedBytes).toBeGreaterThan(0);
    expect(editors.bundles["page-repl:sandbox"].families.acorn.renderedBytes).toBeGreaterThan(0);
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
        __ROD_FEATURE_TOASTER__: "src/runtime/modular/features/toaster.tsx",
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
          const retained = report.modules.filter(
            (item) => item.id.endsWith(module) && item.renderedBytes > 0,
          );
          expect(retained, `Disabled ${flag} retained ${module} in ${script.id}:${runtime.world}`).toEqual(
            [],
          );
        }
      }
      for (const runtime of target.output.runtimes) {
        if (runtime.featureDefines.__ROD_FEATURE_MENU__ !== false) continue;
        const report = audit.bundles[script.id + ":" + runtime.world];
        const retainedRuntimeMenu = report.modules.filter(
          (item) =>
            item.renderedBytes > 0 &&
            (item.id.endsWith("src/runtime/modular/features/menu.ts") ||
              item.id.endsWith("src/runtime/modular/features/menu-view.tsx")),
        );
        expect(
          retainedRuntimeMenu,
          `Disabled __ROD_FEATURE_MENU__ retained runtime menu modules in ${script.id}:${runtime.world}`,
        ).toEqual([]);
      }

      for (const runtime of target.output.runtimes) {
        if (runtime.featureDefines.__ROD_FEATURE_TOASTER__ !== false) continue;
        const report = audit.bundles[script.id + ":" + runtime.world];
        const retainedSonner = report.modules.filter(
          (item) => item.id.includes("node_modules/sonner/") && item.renderedBytes > 0,
        );
        expect(
          retainedSonner,
          `Disabled __ROD_FEATURE_TOASTER__ retained Sonner in ${script.id}:${runtime.world}`,
        ).toEqual([]);
      }

      for (const runtime of target.output.runtimes) {
        if (runtime.featureDefines.__ROD_FEATURE_QUERY__ !== false) continue;
        const report = audit.bundles[script.id + ":" + runtime.world];
        const retainedQueryCore = report.modules.filter(
          (item) => item.id.includes("node_modules/@tanstack/query-core/") && item.renderedBytes > 0,
        );
        expect(
          retainedQueryCore,
          `Disabled __ROD_FEATURE_QUERY__ retained @tanstack/query-core in ${script.id}:${runtime.world}`,
        ).toEqual([]);
      }

      for (const runtime of target.output.runtimes) {
        if (runtime.featureDefines.__ROD_FEATURE_STORAGE__ !== false) continue;
        const report = audit.bundles[script.id + ":" + runtime.world];
        const retainedStorage = report.modules.filter(
          (item) =>
            item.renderedBytes > 0 &&
            (item.id.endsWith("src/runtime/modular/features/storage.ts") ||
              item.id.endsWith("src/runtime/vendor/storage.ts")),
        );
        expect(
          retainedStorage,
          `Disabled __ROD_FEATURE_STORAGE__ retained RodStorage in ${script.id}:${runtime.world}`,
        ).toEqual([]);
      }

      if (script.id === "tiktok-cleaner" || script.id === "example-site") {
        for (const runtime of target.output.runtimes) {
          expect(runtime.featureDefines.__ROD_FEATURE_MENU__).toBe(false);
          expect(runtime.featureDefines.__ROD_FEATURE_TOASTER__).toBe(false);
          expect(runtime.featureDefines.__ROD_FEATURE_CSS__).toBe(false);

          const report = audit.bundles[script.id + ":" + runtime.world];
          const leakedMenuOrToastStack = report.modules.filter(
            (item) =>
              item.renderedBytes > 0 &&
              (item.id.endsWith("src/runtime/modular/features/menu-view.tsx") ||
                item.id.includes("node_modules/@radix-ui/react-select/") ||
                item.id.includes("node_modules/@radix-ui/react-menu/") ||
                item.id.includes("node_modules/@floating-ui/") ||
                item.id.includes("node_modules/sonner/") ||
                item.id === "src/styles/core.css?inline"),
          );
          expect(
            leakedMenuOrToastStack,
            `Lightweight bundle retained menu/toast stack in ${script.id}:${runtime.world}`,
          ).toEqual([]);
        }
      }

      for (const runtime of target.output.runtimes) {
        const report = audit.bundles[script.id + ":" + runtime.world];
        const expectsReact = runtime.featureDefines.__ROD_FEATURE_REACT__ !== false;
        expect(runtime.reactRootAudit?.roots).toBe(expectsReact ? 1 : 0);
        expect(runtime.reactRootAudit?.owner).toBe(expectsReact ? "src/core/runtime-react.tsx" : null);

        if (expectsReact) continue;

        const retainedReactRuntime = report.modules.filter(
          (item) =>
            item.renderedBytes > 0 &&
            (item.id.includes("node_modules/react-dom/") || item.id.endsWith("src/core/runtime-react.tsx")),
        );
        expect(
          retainedReactRuntime,
          `Vanilla runtime retained React DOM in ${script.id}:${runtime.world}`,
        ).toEqual([]);
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
