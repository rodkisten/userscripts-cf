import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inlineCSSModules } from "../build/css-modules.mjs";

describe("CSS Modules integration", () => {
  it("keeps distinct module class identities for behavioral event checks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rod-css-"));
    try {
      const file = path.join(dir, "buttons.module.css");
      await writeFile(file, ".menuButton{padding:8px}.deleteButton{padding:8px}");
      const output = await inlineCSSModules().load(file + ".js");
      const classes = JSON.parse(output.match(/export default (\{[^;]+\});/)[1]);
      const css = JSON.parse(output.match(/export const css = ("(?:\\.|[^"\\])*");/)[1]);
      expect(classes.menuButton).not.toBe(classes.deleteButton);
      expect(css).toContain(classes.menuButton);
      expect(css).toContain(classes.deleteButton);
      expect(css).not.toContain(".menuButton");
      expect(css).not.toContain(".deleteButton");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
