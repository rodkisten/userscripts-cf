import { describe, it, expect } from "vitest";
import fs from "node:fs";
const read = (file) => fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
describe("Rod UI React Studio contract", () => {
  it("ships a minimal React shell and compiled bundle", () => {
    const html = read("hosting/design-system.html");
    expect(html).toContain('id="studio-root"');
    expect(html).toContain('src="/design-system.js"');
    expect(read("build/hosting.mjs")).toContain("design-system.js");
    expect(read("build/design-system.mjs")).toContain("studio/entry.tsx");
  });
  it("has exactly one root and uses React portals", () => {
    const entry = read("studio/entry.tsx");
    expect(entry).toContain("createRoot(mount).render(<Studio />)");
    expect(entry).toContain("<RodMenuHost />");
    expect(entry).toContain("RodMenu.open(schema)");
    expect((entry.match(/createRoot\\(/g) ?? []).length).toBe(1);
    expect(entry).not.toMatch(/solid-js|@solidjs|runtime\\/solid-ui/);
  });
  it("uses only supported React menu fields and real controls", () => {
    const entry = read("studio/entry.tsx");
    for (const field of ["text", "email", "password", "search", "url", "tel", "number", "range", "textarea", "select", "switch", "checkbox"]) expect(entry).toContain('"' + field + '"');
    expect(entry).toContain("setSurface");
    expect(entry).toContain("setPersist");
    expect(entry).toContain("setDevice");
    expect(entry).toContain("<ObjectInspector");
  });
  it("preserves CodeMirror 6 and responsive styles", () => {
    expect(read("studio/entry.tsx")).toContain('import("@codemirror/view")');
    expect(read("studio/studio.css")).toContain("@media(max-width:850px)");
    expect(read("studio/studio.css")).toContain("studio-device");
  });
  it("documents the mandatory feature update workflow", () => {
    expect(read("studio/README.md")).toContain("Mandatory feature documentation policy");
    expect(read("build/check-design-system-changes.mjs")).toContain("Runtime UI changed");
  });
});
