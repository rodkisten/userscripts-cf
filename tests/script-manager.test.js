import { describe, it, expect } from "vitest";
import { matches, readScriptRules, saveScriptRules } from "../src/core/script-manager.js";

const definition = {
  id: "example",
  matches: ["https://example.com/*"],
  exclude: ["https://example.com/private/*"],
};

describe("Script Manager URL rules", () => {
  it("uses manifest matches by default", () => {
    expect(matches(definition, "https://example.com/home")).toBe(true);
    expect(matches(definition, "https://other.test/home")).toBe(false);
  });
  it("allows custom includes without bypassing mandatory excludes", () => {
    const preference = { includes: ["https://other.test/*", "https://example.com/private/*"] };
    expect(matches(definition, "https://other.test/home", preference)).toBe(true);
    expect(matches(definition, "https://example.com/private/data", preference)).toBe(false);
  });
  it("prioritizes user exclusions and disabled state", () => {
    expect(matches(definition, "https://example.com/home", { excludes: ["https://example.com/*"] })).toBe(false);
    expect(matches(definition, "https://example.com/home", { enabled: false })).toBe(false);
  });
  it("persists preferences and recovers malformed JSON", () => {
    const memory = new Map();
    const storage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
    };
    saveScriptRules(storage, { example: { enabled: false } });
    expect(readScriptRules(storage).example.enabled).toBe(false);
    storage.setItem("userscripts-cf:script-manager:v1", "{");
    expect(readScriptRules(storage)).toEqual({});
  });
});
