import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, getObjectPreview, normalizeOptions, safePreviewTokens } from "../src/runtime/solid-ui/object-inspector/core";

describe("ObjectInspector syntax highlighting", () => {
  it("enables highlighting by default and allows disabling it", () => {
    expect(DEFAULT_OPTIONS.syntaxHighlighting).toBe(true);
    expect(normalizeOptions({ syntaxHighlighting: false }).syntaxHighlighting).toBe(false);
  });
  it("tokenizes keys, strings, numbers, booleans and null without HTML", () => {
    const preview = getObjectPreview({ name: "Rod", count: 42, active: true, empty: null });
    const tokens = safePreviewTokens(preview);
    expect(tokens.map(token => token.text).join("")).toBe(preview);
    expect(tokens.some(token => token.type === "key")).toBe(true);
    expect(tokens.some(token => token.type === "string")).toBe(true);
    expect(tokens.some(token => token.type === "number")).toBe(true);
    expect(tokens.some(token => token.type === "boolean")).toBe(true);
    expect(tokens.some(token => token.type === "null")).toBe(true);
  });
  it("preserves untrusted text verbatim for Solid to escape", () => {
    const source = '{ value: "<img src=x onerror=alert(1)>" }';
    expect(safePreviewTokens(source).map(token => token.text).join("")).toBe(source);
  });
  it("supports circular object previews without recursing", () => {
    const value = { self: null as unknown };
    value.self = value;
    expect(() => safePreviewTokens(getObjectPreview(value))).not.toThrow();
  });
});
