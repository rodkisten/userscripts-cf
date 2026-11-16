import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import distribution from "../distribution.config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

export function validateTag(tag, version) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || "") || tag !== `v${version}`) {
    throw Error("Release tag must equal v + package.json version");
  }
}

export function pendingSourceChanges(run) {
  // Build and deployment create untracked artifacts (including hosting/worker.mjs).
  // The release validates every published asset against its manifest and SHA-256.
  // Only modifications to already tracked source files should block publication.
  return run(
    "git",
    "status",
    "--porcelain",
    "--untracked-files=no",
    "--",
    "src",
    "build",
    "tests",
    "studio",
    "hosting",
    "package.json",
    "package-lock.json",
    "distribution.config.js",
    ".github",
    "tsconfig.repl.json",
    "tsconfig.rodx.json",
    "tsconfig.instagram.json",
    "tsconfig.integrations.json",
  );
}

export async function release(tag) {
  const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  validateTag(tag, version);
  const manifest = JSON.parse(await fs.readFile(path.join(dist, "manifest.json"), "utf8"));
  if (manifest.version !== version) throw Error("Build is stale; run npm test before releasing");
  const run = (...args) =>
    execFileSync(args[0], args.slice(1), {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const pending = pendingSourceChanges(run);
  if (pending) throw Error(`Commit tracked source changes before releasing:\\n${pending}`);
  const commit = run("git", "rev-parse", "HEAD");
  run("gh", "auth", "status");
  const files = ["manifest.json", "SHA256SUMS"];
  for (const item of manifest.scripts) {
    for (const [file, expected] of [
      [item.file, item.sha256],
      [item.metaFile, item.metaSha256],
    ]) {
      if (!/^[a-z][a-z0-9-]*\.(user|meta)\.js$/.test(file)) throw Error("Invalid asset path");
      const code = await fs.readFile(path.join(dist, file));
      if (createHash("sha256").update(code).digest("hex") !== expected) throw Error(`Invalid hash: ${file}`);
      files.push(file);
    }
  }
  // SHA256SUMS covers the entire dist tree, not just GitHub Release assets.
  const inventory = await fs.readFile(path.join(dist, "SHA256SUMS"), "utf8");
  const seen = new Set();
  for (const line of inventory.trimEnd().split("\n")) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || match[2].startsWith("/") || match[2].split("/").includes("..") || seen.has(match[2])) {
      throw Error(`Invalid checksum inventory entry: ${line}`);
    }
    seen.add(match[2]);
    const code = await fs.readFile(path.join(dist, match[2]));
    if (createHash("sha256").update(code).digest("hex") !== match[1]) {
      throw Error(`Checksum mismatch: ${match[2]}`);
    }
  }
  for (const file of files.filter((file) => file !== "SHA256SUMS")) {
    if (!seen.has(file)) throw Error(`Missing checksum entry: ${file}`);
  }
  const args = ["--repo", distribution.repository];
  let existing;
  try {
    existing = JSON.parse(run("gh", "release", "view", tag, ...args, "--json", "isDraft"));
  } catch {
    /* Creating below also fails safely on authentication/network errors. */
  }
  if (existing && !existing.isDraft) throw Error("Release already published; bump package version");
  if (!existing)
    run(
      "gh",
      "release",
      "create",
      tag,
      ...args,
      "--draft",
      "--target",
      commit,
      "--title",
      `Userscripts ${tag}`,
      "--notes",
      `Vite bundles from commit ${commit}. Install standalone.user.js for all modules, unified.user.js for RodX, or individual scripts. Includes update metadata and SHA-256 checksums.`,
    );
  // Upload to a draft first. Failed uploads do not replace the latest published release.
  run("gh", "release", "upload", tag, ...args, "--clobber", ...files.map((file) => path.join(dist, file)));
  const url = run("gh", "release", "edit", tag, ...args, "--draft=false", "--latest");
  console.log(url || `https://github.com/${distribution.repository}/releases/tag/${tag}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await release(process.argv[2] || process.env.RELEASE_TAG);
}
