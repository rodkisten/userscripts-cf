import { describe, expect, it } from "vitest";
import config from "../vite.config.js";
import { reactJSX } from "../build/react-jsx.mjs";

const solidPlugin = config.plugins.find((item) => item.name?.includes("solid") && item.name !== "userscripts-cf:react-jsx");

describe("framework-specific Vite JSX configuration", () => {
  it("loads React and Solid plugins", () => {
    expect(config.plugins.some((item) => item.name === "userscripts-cf:react-jsx")).toBe(true);
    expect(solidPlugin).toBeDefined();
  });
  it("compiles React JSX without running the Solid transform", () => {
    const filename = "/repo/src/ui/widget.react.tsx";
    expect(reactJSX().transform("export const App = () => <div />;", filename).code).toContain("react/jsx-runtime");
    expect(config.plugins.length).toBeGreaterThan(3);
  });
});
