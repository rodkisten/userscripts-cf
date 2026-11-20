import { describe, expect, it } from "vitest";
import { rewriteShadowCSS } from "../build/css-semantic-rewrite.mjs";

describe("[TEMP] semantic CSS utility", () => {
  it("reuses existing host tokens and is idempotent", () => {
    const input =
      ":host { --accent: #123456; }\n.a { color: #123456; padding: 8px; }\n.b { color: #123456; padding: 8px; }";
    const first = rewriteShadowCSS(input);
    expect(first.changed).toBe(true);
    expect(first.css).toContain("var(--accent)");
    expect(first.css).toContain("--rod-semantic-space-8px");
    expect(rewriteShadowCSS(first.css).changed).toBe(false);
  });
  it("does not migrate unverified page styles", () => {
    const input = "body { color: #123456 } .x { color: #123456 }";
    expect(rewriteShadowCSS(input).css).toBe(input);
  });
  it("does not rewrite conditional values", () => {
    const input = ":host {} @media (min-width: 600px) { .x { padding: 8px } .y { padding: 8px } }";
    expect(rewriteShadowCSS(input).changed).toBe(false);
  });
  it("does not rewrite CSS imports without ownership resolution", () => {
    const input = '@import "./base.css"; :host {} .x { padding: 8px } .y { padding: 8px }';
    expect(rewriteShadowCSS(input).changed).toBe(false);
  });
});
