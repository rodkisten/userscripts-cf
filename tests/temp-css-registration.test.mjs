import { describe, expect, it } from "vitest";
import { verifyStyleRegistration } from "../build/css-style-registration.mjs";
const group = ["src/tokens.css", "src/Panel.module.css"];
const ownership = Object.fromEntries(group.map(file => [file, { owners: ["src/entry.tsx"] }]));
describe("[TEMP] direct ShadowRoot registration proof", () => {
  it("accepts direct imported css exports registered on ctx.ui", () => {
    const sources = {
      "src/entry.tsx": 'import { css as tokens } from "./tokens.css"; import styles, { css as panel } from "./Panel.module.css"; ctx.ui.registerStyles(tokens, panel);',
      "src/tokens.css": ":host { --x: red }",
      "src/Panel.module.css": ".panel { color: red }"
    };
    expect(verifyStyleRegistration(sources, group, ownership).safe).toBe(true);
  });
  it("blocks imports that are not actually registered", () => {
    const sources = {
      "src/entry.tsx": 'import { css as tokens } from "./tokens.css"; import { css as panel } from "./Panel.module.css"; ctx.ui.registerStyles(panel);',
      "src/tokens.css": ":host {}",
      "src/Panel.module.css": ".panel {}"
    };
    expect(verifyStyleRegistration(sources, group, ownership).failures.some(x => x.filename === "src/tokens.css")).toBe(true);
  });
  it("blocks page-style registration", () => {
    const sources = {
      "src/entry.tsx": 'import { css as tokens } from "./tokens.css"; import { css as panel } from "./Panel.module.css"; ctx.pageStyle(tokens); ctx.ui.registerStyles(panel);',
      "src/tokens.css": ":host {}",
      "src/Panel.module.css": ".panel {}"
    };
    expect(verifyStyleRegistration(sources, group, ownership).safe).toBe(false);
  });
});
