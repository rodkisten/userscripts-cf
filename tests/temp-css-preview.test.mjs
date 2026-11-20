import { describe, expect, it } from "vitest";
import { previewSemanticMigration } from "../build/css-semantic-preview.mjs";

describe("[TEMP] safe semantic preview integration", () => {
  const sources = {
    "src/tokens.css": ":host { --existing: #123456; }",
    "src/a.module.css": ".a { color: #123456; padding: 8px; }",
    "src/b.module.css": ".b { color: #123456; padding: 8px; }",
    "src/index.tsx": 'import { css as tokens } from "./tokens.css"; import { css as a } from "./a.module.css"; import { css as b } from "./b.module.css"; ctx.ui.registerStyles(tokens, a, b);'
  };
  it("previews an explicitly selected ShadowRoot group and preserves class selectors", () => {
    const result = previewSemanticMigration(sources, [["src/tokens.css", "src/a.module.css", "src/b.module.css"]]);
    expect(result.previews[0].status).toBe("preview");
    expect(result.previews[0].output["src/a.module.css"]).toContain(".a");
    expect(result.previews[0].output["src/a.module.css"]).toContain("var(--existing)");
  });
  it("blocks orphaned styles and mixed page styles", () => {
    const input = { ...sources, "src/page.css": "body { color: red }" };
    expect(previewSemanticMigration(input, [["src/page.css"]]).previews[0].status).toBe("blocked");
  });
  it("blocks overlapping groups", () => {
    const result = previewSemanticMigration(sources, [["src/tokens.css", "src/a.module.css"], ["src/tokens.css", "src/b.module.css"]]);
    expect(result.previews[1].status).toBe("blocked");
  });
});
