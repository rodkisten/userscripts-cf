import { describe, it, expect } from "vitest";
import fs from "node:fs";
const read = file => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
describe("Rod UI Design System Studio contract", () => {
  it("publishes the studio and its compiled real component bundle", () => {
    const index = read("hosting/index.html");
    const hosting = read("build/hosting.mjs");
    const page = read("hosting/design-system.html");
    expect(index).toContain('/design-system.html');
    expect(hosting).toContain('design-system.js');
    expect(hosting).toContain('build/design-system.mjs');
    expect(page).toContain('src="/design-system.js"');
    expect(page).toContain('id="menuLive"');
    expect(page).toContain('id="tree"');
  });
  it("uses actual runtime instances instead of mock-only previews", () => {
    const entry = read("studio/entry.tsx");
    expect(entry).toContain('import { RodMenu }');
    expect(entry).toContain('import { ObjectInspector }');
    expect(entry).toContain('RodMenu.open(');
    expect(entry).toContain('<ObjectInspector');
  });
  it("offers searchable live examples backed by RodMenu schemas", () => {
    const examples = read("studio/examples.ts");
    const entry = read("studio/entry.tsx");
    const page = read("hosting/design-system.html");
    expect(examples).toContain("schemaForExample");
    expect(examples).toContain("media-picker");
    expect(examples).toContain("request-log");
    expect(entry).toContain("RodMenu.open(schemaForExample(");
    expect(page).toContain('id="examplesCatalog"');
    expect(page).toContain('id="examplesSearch"');
  });
  it("documents and renders advanced menu and inspector controls", () => {
    const examples = read("studio/examples.ts");
    const entry = read("studio/entry.tsx");
    const page = read("hosting/design-system.html");
    for (const id of ["tabs", "sections", "validation", "conditional", "persistence", "gestures", "stack", "focus", "theme", "drawer", "popover", "async-action"]) {
      expect(examples).toContain(`id: "${id}"`);
    }
    expect(entry).toContain("inspectorControls");
    expect(entry).toContain("setInspectorOptions");
    expect(page).toContain('id="inspectorAdvanced"');
    expect(page).toContain('id="inspectorReset"');
  });
  it("uses the custom hostname as the canonical distribution URL", () => {
    expect(read("distribution.config.js")).toContain("https://userscripts.migos.club");
  });
  it("documents the mandatory feature update workflow", () => {
    const docs = read("studio/README.md");
    expect(docs).toContain("Mandatory feature documentation policy");
    expect(docs).toContain("studio/entry.tsx");
    expect(read("build/check-design-system-changes.mjs")).toContain("Runtime UI changed");
  });
});
