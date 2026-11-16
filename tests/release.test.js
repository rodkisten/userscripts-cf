import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateTag, pendingSourceChanges } from "../build/release.mjs";

test("release rejects mismatched tags and shell fragments", () => {
  validateTag("v0.2.0", "0.2.0");
  for (const tag of ["v0.1.0", "0.2.0", "v0.2.0; echo bad", "-x", "v0.2.0-beta"]) {
    assert.throws(() => validateTag(tag, "0.2.0"));
  }
});

test("update metadata and downloads have matching versions and stable release URLs", async () => {
  const dist = new URL("../dist/", import.meta.url);
  const manifest = JSON.parse(await fs.readFile(new URL("manifest.json", dist), "utf8"));
  const { version } = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const expectedSums = [];
  for (const entry of manifest.scripts) {
    const source = await fs.readFile(new URL(entry.file, dist), "utf8");
    const meta = await fs.readFile(new URL(entry.metaFile, dist), "utf8");
    assert.equal(
      source.slice(0, source.indexOf("// ==/UserScript==") + "// ==/UserScript==".length) + "\n",
      meta,
    );
    assert.ok(meta.includes(`// @version      ${version}`));
    assert.ok(meta.includes(`// @updateURL    ${manifest.baseURL}/${entry.metaFile}`));
    assert.ok(meta.includes(`// @downloadURL  ${manifest.baseURL}/${entry.file}`));
    assert.equal(createHash("sha256").update(meta).digest("hex"), entry.metaSha256);
  }
  async function collectChecksums(directory, prefix = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "SHA256SUMS" && !prefix) continue;
      const relative = prefix ? prefix + "/" + entry.name : entry.name;
      const url = new URL(relative, dist);
      if (entry.isDirectory()) await collectChecksums(url, relative);
      else if (entry.isFile()) {
        const source = await fs.readFile(url);
        expectedSums.push(`${createHash("sha256").update(source).digest("hex")}  ${relative}`);
      }
    }
  }
  await collectChecksums(dist);
  assert.equal(await fs.readFile(new URL("SHA256SUMS", dist), "utf8"), expectedSums.join("\n") + "\n");
});

test("release checks tracked source but ignores generated deployment artifacts", () => {
  const calls = [];
  const run = (...args) => {
    calls.push(args);
    return "";
  };
  assert.equal(pendingSourceChanges(run), "");
  assert.deepEqual(calls[0].slice(0, 5), [
    "git", "status", "--porcelain", "--untracked-files=no", "--",
  ]);
  assert.ok(calls[0].includes("src"));
  assert.ok(calls[0].includes("package.json"));
  assert.equal(pendingSourceChanges(() => " M src/runtime/index.ts"), " M src/runtime/index.ts");
});
