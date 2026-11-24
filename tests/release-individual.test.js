import { describe, expect, it } from "vitest";
import { collectIndividualReleases, individualReleaseTag } from "../build/release-individual.mjs";

describe("independent release tags", () => {
  it("uses a stable id-version tag", () => {
    expect(individualReleaseTag("rodx-studio", "8.0.1")).toBe("rodx-studio-v8.0.1");
  });

  it("publishes only affected manifest entries", () => {
    const releases = collectIndividualReleases(
      { scripts: [{ id: "alpha", version: "1.2.4", file: "alpha.user.js", metaFile: "alpha.meta.js" }] },
      { affected: ["alpha"], scripts: { alpha: { next: "1.2.4" } } },
    );
    expect(releases).toEqual([
      {
        id: "alpha",
        version: "1.2.4",
        tag: "alpha-v1.2.4",
        file: "alpha.user.js",
        metaFile: "alpha.meta.js",
      },
    ]);
  });
});
