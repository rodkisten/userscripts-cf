import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function individualReleaseTag(id, version) {
  if (!/^[a-z][a-z0-9-]*$/.test(id) || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid independent release identity: ${id}@${version}`);
  }
  return `${id}-v${version}`;
}

export function collectIndividualReleases(manifest, plan) {
  return (plan.affected || []).map((id) => {
    const script = manifest.scripts.find((item) => item.id === id);
    const planned = plan.scripts?.[id];
    if (!script || !planned) throw new Error(`Missing manifest/plan entry for ${id}`);
    return {
      id,
      version: planned.next,
      tag: individualReleaseTag(id, planned.next),
      file: script.file,
      metaFile: script.metaFile,
    };
  });
}

export function publishIndividualReleases({ rootDir = root, run = defaultRun, manifest, plan }) {
  const commit = run("git", "rev-parse", "HEAD");
  const published = [];
  for (const release of collectIndividualReleases(manifest, plan)) {
    const args = ["--repo", "rodkisten/userscripts-cf"];
    let exists = false;
    try {
      run("gh", "release", "view", release.tag, ...args, "--json", "isDraft");
      exists = true;
    } catch {
      // Create the release below.
    }
    if (!exists) {
      run(
        "gh",
        "release",
        "create",
        release.tag,
        ...args,
        "--target",
        commit,
        "--title",
        `${release.id} ${release.tag}`,
        "--notes",
        `Independent userscript release for ${release.id}@${release.version}.`,
      );
    }
    run(
      "gh",
      "release",
      "upload",
      release.tag,
      ...args,
      "--clobber",
      path.join(rootDir, "dist", release.file),
      path.join(rootDir, "dist", release.metaFile),
    );
    published.push(release);
  }
  return published;
}

function defaultRun(...args) {
  return execFileSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "dist/manifest.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(root, "version-plan.json"), "utf8"));
  const published = publishIndividualReleases({ manifest, plan });
  console.log(`Published ${published.length} independent userscript release(s).`);
}
