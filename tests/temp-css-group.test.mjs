import { describe, expect, it } from "vitest";
import { analyzeImportGraph } from "../build/css-import-graph.mjs";
import { rewriteShadowGroup } from "../build/css-semantic-group.mjs";

describe("[TEMP] AST import graph", () => {
  it("resolves TSX CSS module imports and TS barrel reexports", () => {
    const graph = analyzeImportGraph({
      "src/index.tsx": 'import { css } from "./view";',
      "src/view.ts": 'export { css } from "./Panel.module.css";',
      "src/Panel.module.css": ".panel { color: red }",
    });
    expect(graph.edges["src/index.tsx"][0].target).toBe("src/view.ts");
    expect(graph.edges["src/view.ts"][0].target).toBe("src/Panel.module.css");
  });
  it("reports missing relative modules", () => {
    expect(analyzeImportGraph({ "src/index.ts": 'import "./missing.css";' }).diagnostics[0].code).toBe(
      "unresolved-module",
    );
  });
});
describe("[TEMP] multi-file CSS Modules rewrite", () => {
  const input = {
    "src/tokens.css": ":host { --already: #123456; }",
    "src/Panel.module.css": ".panel { color: #123456; padding: 8px; }",
    "src/Dialog.module.css": ".dialog { color: #123456; padding: 8px; }",
  };
  it("shares tokens across CSS Modules without changing class names", () => {
    const result = rewriteShadowGroup(input);
    expect(result.changed.length).toBeGreaterThan(0);
    expect(result.files["src/Panel.module.css"]).toContain(".panel");
    expect(result.files["src/Dialog.module.css"]).toContain(".dialog");
    expect(result.files["src/Panel.module.css"]).toContain("var(--already)");
    expect(result.files["src/tokens.css"]).toContain("--rod-semantic-space-8px");
    expect(rewriteShadowGroup(result.files).changed).toEqual([]);
  });
  it("rejects groups without a known host token owner", () => {
    expect(rewriteShadowGroup({ "src/a.module.css": ".a { padding: 8px }" }).changed).toEqual([]);
  });
});
