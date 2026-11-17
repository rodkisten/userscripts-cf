import { describe, expect, it } from "vitest";
import { reactJSX } from "../build/react-jsx.mjs";

const source = `export const App = () => <div className="hello">React</div>;`;

describe("React JSX build isolation", () => {
  it("compiles a configured React entrypoint", () => {
    const plugin = reactJSX(["/repo/src/userscripts/react-demo/index.tsx"]);
    const result = plugin.transform(source, "/repo/src/userscripts/react-demo/index.tsx");
    expect(result.code).toContain("react/jsx-runtime");
    expect(result.code).not.toContain("<div");
  });

  it("compiles *.react.tsx components", () => {
    const result = reactJSX().transform(source, "/repo/src/ui/widget.react.tsx");
    expect(result.code).toContain("react/jsx-runtime");
  });

  it("leaves Solid TSX untouched", () => {
    expect(reactJSX().transform(source, "/repo/src/ui/widget.tsx")).toBeNull();
  });

  it("leaves non-React TSX runtime modules untouched", () => {
    expect(reactJSX().transform(source, "/repo/src/core/runtime-solid.tsx")).toBeNull();
  });
});
