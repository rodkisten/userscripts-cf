import { describe, expect, it } from "vitest";
import { SHARED_FIELD_TYPES, isSharedFieldType } from "../src/runtime/solid-ui/form-controls/field-types";
import {
  appendTwitterToken,
  parseTwitterSearch,
  removeTwitterToken,
  replaceTwitterToken,
} from "../src/runtime/solid-ui/form-controls/twitter-search";

describe("29 shared field variants", () => {
  it("has exactly 29 distinct discriminants", () => {
    expect(SHARED_FIELD_TYPES).toHaveLength(29);
    expect(new Set(SHARED_FIELD_TYPES).size).toBe(29);
    for (const type of SHARED_FIELD_TYPES) expect(isSharedFieldType(type)).toBe(true);
  });
  it("does not capture RodMenu media and diagnostic extensions", () => {
    for (const type of [
      "media-preview",
      "media-picker",
      "provider-status",
      "request-log",
      "debug-json",
      "channel-picker",
    ]) {
      expect(isSharedFieldType(type)).toBe(false);
    }
  });
});
describe("Twitter search visual/raw round trip", () => {
  it("preserves source positions and whitespace when editing", () => {
    const query = "typescript  filter:videos  -filter:replies";
    const tokens = parseTwitterSearch(query);
    expect(tokens.map((token) => token.value)).toEqual(["typescript", "filter:videos", "-filter:replies"]);
    expect(replaceTwitterToken(query, tokens[1], "filter:images")).toBe(
      "typescript  filter:images  -filter:replies",
    );
  });
  it("classifies boolean, negative and phrase tokens", () => {
    expect(parseTwitterSearch('("hello world" OR -filter:replies)').map((token) => token.kind)).toEqual([
      "boolean",
      "phrase",
      "boolean",
      "negative",
      "boolean",
    ]);
  });
  it("supports append and removal without dropping adjacent tokens", () => {
    const query = appendTwitterToken("lang:pt", "filter:videos");
    expect(query).toBe("lang:pt filter:videos");
    expect(removeTwitterToken(query, parseTwitterSearch(query)[1])).toBe("lang:pt");
  });
});
