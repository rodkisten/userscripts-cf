import { describe, it, expect } from "vitest";
import { analyzeStyleOwnership } from "../build/css-style-ownership.mjs";
describe("[TEMP] CSS ownership graph", () => {
  it("follows transitive CSS imports and shadow entrypoint ownership", () => {
    const report = analyzeStyleOwnership({
      "src/feature.tsx": 'import "./a.css"; ctx.ui.registerStyles(css);',
      "src/a.css": '@import "./b.css"; :host { color: red }',
      "src/b.css": ".button { color: red }",
    });
    expect(report.edges["src/a.css"]).toEqual(["src/b.css"]);
    expect(report.classifications["src/b.css"].status).toBe("shadow-candidate");
  });
  it("flags mixed page and shadow usage for manual review", () => {
    const report = analyzeStyleOwnership({
      "src/mixed.ts": 'import "./x.css"; ctx.pageStyle(css); ctx.ui.registerStyles(css);',
      "src/x.css": ".x { color: red }",
    });
    expect(report.classifications["src/x.css"].status).toBe("review");
  });
  it("flags root and document selectors for manual review", () => {
    const report = analyzeStyleOwnership({
      "src/feature.ts": 'import "./x.css"; ctx.style(css);',
      "src/x.css": ":root { --a: red } body { color: red }",
    });
    expect(report.classifications["src/x.css"].status).toBe("review");
  });
  it("does not assume orphaned CSS belongs to Shadow DOM", () => {
    const report = analyzeStyleOwnership({ "src/orphan.css": ".x { color: red }" });
    expect(report.classifications["src/orphan.css"].status).toBe("review");
  });
});
