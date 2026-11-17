import { describe, expect, it } from "vitest";
import config from "../vite.config.js";

const plugin = config.plugins.find((item) => item.name && item.name.includes("solid"));

describe("framework-specific Vite JSX configuration", () => {
  it("loads the Vite configuration without syntax errors", () => {
    expect(config.plugins.some((item) => item.name === "userscripts-cf:react-jsx")).toBe(true);
  });
  it("keeps React and Solid compilers in the same pipeline", () => {
    expect(config.plugins.length).toBeGreaterThan(3);
    expect(plugin).toBeDefined();
  });
});
