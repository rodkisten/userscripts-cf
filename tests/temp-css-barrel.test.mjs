import { describe, it, expect } from "vitest";
import { verifyStyleRegistration } from "../build/css-style-registration.mjs";

describe("[TEMP] TS barrel CSS registration", () => {
  const ownership = { "src/Panel.module.css": { owners: ["src/entry.tsx"] } };
  it("resolves a named reexport from a CSS module", () => {
    const sources = {
      "src/entry.tsx": 'import { panelCSS } from "./barrel"; ctx.ui.registerStyles(panelCSS);',
      "src/barrel.ts": 'export { css as panelCSS } from "./Panel.module.css";',
      "src/Panel.module.css": ".panel { color: red }"
    };
    expect(verifyStyleRegistration(sources, ["src/Panel.module.css"], ownership).safe).toBe(true);
  });
  it("resolves imported bindings reexported by name", () => {
    const sources = {
      "src/entry.tsx": 'import { panelCSS } from "./barrel"; ctx.ui.registerStyles(panelCSS);',
      "src/barrel.ts": 'import { css as panelCSS } from "./Panel.module.css"; export { panelCSS };',
      "src/Panel.module.css": ".panel { color: red }"
    };
    expect(verifyStyleRegistration(sources, ["src/Panel.module.css"], ownership).safe).toBe(true);
  });
  it("rejects unresolved and cyclic reexports", () => {
    const sources = {
      "src/entry.tsx": 'import { panelCSS } from "./barrel"; ctx.ui.registerStyles(panelCSS);',
      "src/barrel.ts": 'export { panelCSS } from "./cycle";',
      "src/cycle.ts": 'export { panelCSS } from "./barrel";',
      "src/Panel.module.css": ".panel { color: red }"
    };
    expect(verifyStyleRegistration(sources, ["src/Panel.module.css"], ownership).safe).toBe(false);
  });
});
