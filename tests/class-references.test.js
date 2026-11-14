import { describe, expect, it } from "vitest";
import { analyzeClassReferences } from "../build/class-references.mjs";

describe("class references AST", () => {
  it("detects behavioral class names in DOM APIs", () => {
    const result = analyzeClassReferences(`
      node.classList.add("active", "selected");
      node.classList.contains("menuButton");
      node.querySelector(".deleteButton > .icon");
      node.closest(".toolbar");
      node.getElementsByClassName("foo bar");
      node.setAttribute("class", "ready");
    `);
    expect(result.classes).toEqual([
      "active", "bar", "deleteButton", "foo", "icon", "menuButton",
      "ready", "selected", "toolbar",
    ]);
    expect(result.dynamic).toEqual([]);
  });
  it("detects JSX and direct className assignments", () => {
    const result = analyzeClassReferences(`
      const button = <button class="menu active" />;
      const other = <div className={"selected"} />;
      element.className = "ready busy";
      element.className = state;
      const dynamic = <div class={state} />;
    `);
    expect(result.classes).toEqual(["active", "busy", "menu", "ready", "selected"]);
    expect(result.dynamic).toEqual(["className", "jsx-class"]);
  });
  it("tracks Solid classList keys and flags computed keys", () => {
    const result = analyzeClassReferences(`
      const element = <div classList={{ active: enabled(), "menu-open": expanded(), [dynamic]: true }} />;
      node.class = "ready";
    `);
    expect(result.classes).toEqual(["active", "menu-open", "ready"]);
    expect(result.dynamic).toEqual(["jsx-classList"]);
  });
  it("flags computed selectors rather than guessing their class names", () => {
    const result = analyzeClassReferences(`
      element.matches(".item-" + state);
      element.classList.toggle(name);
      element.querySelector(\`.item-\${id}\`);
    `);
    expect(result.dynamic).toEqual(["matches", "toggle", "querySelector"]);
  });
});
