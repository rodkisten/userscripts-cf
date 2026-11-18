import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parsePrCiScope, resolveTestSelectors } from "../build/pr-ci-scope.mjs";

describe("PR title CI scope", () => {
  it("defaults to automatic validation without a suffix", () => {
    expect(parsePrCiScope("fix: improve runtime")).toBeNull();
  });
  it("parses test and build selectors without splitting glob paths", () => {
    expect(
      parsePrCiScope(
        "feat: update (test: tests/runtime-helpers.test.js,tests/*.test.js | build: standalone,unified)",
      ),
    ).toEqual({
      test: ["tests/runtime-helpers.test.js", "tests/*.test.js"],
      build: ["standalone", "unified"],
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

describe("explicit scope validation safety", () => {
  const validator = readFileSync(new URL("../build/validate-changed.sh", import.meta.url), "utf8");

  it("never bypasses TypeScript and lint for explicit test/build scopes", () => {
    const explicit = validator.slice(
      validator.indexOf('if [[ "$explicit" == true ]]; then', validator.indexOf("  run)")),
    );
    expect(explicit).toContain("npm run typecheck");
    expect(explicit).toContain("npm run lint");
    expect(explicit.indexOf("npm run typecheck")).toBeLessThan(explicit.indexOf("npx vitest run"));
  });

  it("builds missing dist artifacts for explicit full and integration suites", () => {
    expect(validator).toContain('[[ "${scoped_tests[0]}" == all ]]');
    expect(validator).toContain("integration|integrated|boot|standalone|page-repl");
    expect(validator).toContain("[[ ! -f dist/manifest.json ]]");
    expect(validator).toContain("Build required by integration test scope");
  });

  it("retains full-suite release gates", () => {
    expect(validator).toContain("npm run test:lab");
    expect(validator).toContain("node build/hosting.mjs");
    expect(validator).toContain("Focused regression diagnostics");
  });
});
