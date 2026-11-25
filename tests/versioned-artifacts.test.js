import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { materializeVersionedArtifacts } from "../build/versioned-artifacts.mjs";

describe("versioned artifacts", () => {
  it("creates immutable per-script and metadata URLs", async () => {
    const dist = await fs.mkdtemp(path.join(os.tmpdir(), "userscripts-artifacts-"));
    await fs.writeFile(path.join(dist, "alpha.user.js"), "// user\n");
    await fs.writeFile(path.join(dist, "alpha.meta.js"), "// meta\n");
    const created = await materializeVersionedArtifacts(dist, {
      scripts: [
        { id: "alpha", version: "1.2.3", file: "alpha.user.js", metaFile: "alpha.meta.js" },
        { id: "standalone", version: "8.0.0", file: "standalone.user.js", metaFile: "standalone.meta.js" },
      ],
    });
    expect(created).toEqual(["releases/alpha/1.2.3/alpha.meta.js", "releases/alpha/1.2.3/alpha.user.js"]);
    await expect(fs.readFile(path.join(dist, created[1]), "utf8")).resolves.toBe("// user\n");
    await fs.rm(dist, { recursive: true, force: true });
  });
});
