import { describe, expect, it } from "vitest";
import { deduplicateCSS } from "../build/css-deduplicate.mjs";

describe("CSS deduplication and behavioral selectors", () => {
  it("combines adjacent identical rules without renaming event selectors", () => {
    const result = deduplicateCSS(".menu{padding:8px}.delete{padding:8px}");
    expect(result.merged).toBe(1);
    expect(result.css).toContain(".menu,.delete");
  });

  it("does not merge across intervening rules", () => {
    const result = deduplicateCSS(".a{color:red}.other{color:blue}.b{color:red}");
    expect(result.merged).toBe(0);
  });

  it("preserves declaration order and important flags", () => {
    expect(deduplicateCSS(".a{color:red!important}.b{color:red}").merged).toBe(0);
    expect(deduplicateCSS(".a{color:red;background:blue}.b{background:blue;color:red}").merged).toBe(0);
  });

  it("does not combine nested or scoped rules", () => {
    expect(deduplicateCSS(".a &{color:red}.b &{color:red}").merged).toBe(0);
    expect(deduplicateCSS("@scope (.root){.a{color:red}.b{color:red}}").merged).toBe(0);
    expect(deduplicateCSS("@starting-style{.a{opacity:0}.b{opacity:0}}").merged).toBe(0);
  });

  it("keeps media-query boundaries and keyframes intact", () => {
    const result = deduplicateCSS("@media(min-width:10px){.a{color:red}.b{color:red}}.c{color:red}");
    expect(result.merged).toBe(1);
    expect(result.css).toContain(".a,.b");
    expect(result.css).toContain(".c{color:red}");
    expect(deduplicateCSS("@keyframes spin{from{opacity:0}to{opacity:0}}").merged).toBe(0);
  });
});
