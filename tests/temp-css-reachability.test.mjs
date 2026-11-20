import { describe, it, expect } from "vitest";
import { validateTokenReachability } from "../build/css-token-reachability.mjs";

describe("[TEMP] token bundle reachability", () => {
  const files = {
    "src/entry.tsx": 'import "./tokens.css"; import "./Panel.module.css"; ctx.ui.registerStyles(css);',
    "src/tokens.css": ":host { --accent: #123456; }",
    "src/Panel.module.css": ".panel { color: #123456 }",
  };
  const ownership = {
    "src/tokens.css": { owners: ["src/entry.tsx"] },
    "src/Panel.module.css": { owners: ["src/entry.tsx"] },
  };
  it("accepts a group with one statically reachable token owner", () => {
    expect(validateTokenReachability(files, ["src/tokens.css", "src/Panel.module.css"], ownership).safe).toBe(
      true,
    );
  });
  it("blocks when host tokens are not imported by a consumer", () => {
    const changed = { ...files, "src/entry.tsx": 'import "./Panel.module.css"; ctx.ui.registerStyles(css);' };
    expect(
      validateTokenReachability(
        changed,
        ["src/tokens.css", "src/Panel.module.css"],
        ownership,
      ).diagnostics.some((d) => d.code === "host-not-reachable"),
    ).toBe(true);
  });
  it("blocks multiple host token owners", () => {
    const changed = { ...files, "src/extra.css": ":host { --other: red }" };
    expect(validateTokenReachability(changed, ["src/tokens.css", "src/extra.css"], ownership).safe).toBe(
      false,
    );
  });
});
