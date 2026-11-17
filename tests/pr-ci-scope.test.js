import { describe, expect, it } from "vitest";
import { parsePrCiScope, resolveTestSelectors } from "../build/pr-ci-scope.mjs";

describe("PR title CI scope", () => {
  it("defaults to automatic validation without a suffix", () => {
    expect(parsePrCiScope("fix: improve runtime")).toBeNull();
  });
  it("parses test and build selectors without splitting glob paths", () => {
    expect(parsePrCiScope("feat: update (test: tests/runtime-helpers.test.js,tests/*.test.js | build: standalone,reddit)")).toEqual({
      test: ["tests/runtime-helpers.test.js", "tests/*.test.js"],
      build: ["standalone", "reddit"],
    });
  });
  it("rejects unsafe test paths and unknown targets", () => {
    expect(() => parsePrCiScope("fix: x (test: ../secrets.test.js)")).toThrow();
    expect(() => parsePrCiScope("fix: x (build: does-not-exist)")).toThrow();
  });
  it("rejects duplicate categories and mixed none", () => {
    expect(() => parsePrCiScope("fix: x (test: none | test: all)")).toThrow();
    expect(() => parsePrCiScope("fix: x (build: none,reddit)")).toThrow();
  });
  it("expands explicit glob selectors into real tests", async () => {
    expect(await resolveTestSelectors(["tests/pr-ci-scope.test.js"])).toContain("tests/pr-ci-scope.test.js");
  });
});
