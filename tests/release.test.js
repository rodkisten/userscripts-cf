import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateTag } from "../build/release.mjs";

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
  const files = ["manifest.json"];
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
    files.push(entry.file, entry.metaFile);
  }
  for (const file of files.sort()) {
    const source = await fs.readFile(new URL(file, dist));
    expectedSums.push(`${createHash("sha256").update(source).digest("hex")}  ${file}`);
  }
  assert.equal(await fs.readFile(new URL("SHA256SUMS", dist), "utf8"), expectedSums.join("\n") + "\n");
});
