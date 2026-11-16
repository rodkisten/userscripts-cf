import { describe, expect, it, vi } from "vitest";
import { compareVersions, createUpdateChecker } from "../src/core/update-checker.ts";

describe("runtime update checker", () => {
  it.each([
    ["1.0.0", "1.0.1", -1],
    ["1.2.0", "1.1.9", 1],
    ["1.0.0-beta.2", "1.0.0-beta.10", -1],
    ["1.0.0-rc.1", "1.0.0", -1],
    ["1.0.0", "1.0.0+build.2", 0],
    ["invalid", "1.0.0", null],
  ])("compares %s and %s", (installed, latest, expected) => {
    expect(compareVersions(installed, latest)).toBe(expected);
  });

  it("notifies with the exact published install URL and deduplicates checks", async () => {
    const notify = vi.fn();
    const fetchManifest = vi.fn(async () => ({
      version: "2.0.0",
      baseURL: "https://userscripts.migos.club",
      scripts: [{ id: "instagram-saved", name: "Instagram", file: "instagram-saved.user.js" }],
    }));
    const checker = createUpdateChecker({
      id: "instagram-saved",
      installedVersion: "1.0.0",
      manifestURL: "https://userscripts.migos.club/manifest.json",
      fetchManifest,
      notify,
    });
    const update = await checker.check(true);
    expect(update?.downloadURL).toBe("https://userscripts.migos.club/instagram-saved.user.js");
    expect(notify).toHaveBeenCalledTimes(1);
    await checker.check();
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    checker.stop();
  });

  it("does not notify for current versions or malformed manifests", async () => {
    const notify = vi.fn();
    const checker = createUpdateChecker({
      id: "unified",
      installedVersion: "2.0.0",
      manifestURL: "https://userscripts.migos.club/manifest.json",
      fetchManifest: async () => ({
        version: "2.0.0",
        scripts: [{ id: "unified", file: "unified.user.js" }],
      }),
      notify,
    });
    expect(await checker.check(true)).toBeNull();
    expect(notify).not.toHaveBeenCalled();
    checker.stop();
  });
});
