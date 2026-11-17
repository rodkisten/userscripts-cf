// Explicit PR-title validation scope. No directive means the existing change detector wins.
// Example: feat: bookmarks (test: tests/foo.test.js,tests/userscripts/reddit/*.test.js | build: standalone,reddit)
import { glob } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import definitions from "../userscripts.config.js";

const validTargets = new Set(["standalone", "unified", ...definitions.map((item) => item.id)]);
const allowedTestRoot = /^tests\/(?:[a-zA-Z0-9_./*-]+)\.test\.[cm]?[jt]sx?$/;
const safeGlob = /^[a-zA-Z0-9_./*-]+$/;

export function parsePrCiScope(title) {
  const match = title.match(/\((test|build)\s*:[^()]+(?:\|\s*(?:test|build)\s*:[^()]+)*\)\s*$/i);
  if (!match) return null;
  const raw = match[0].slice(1, -1);
  const result = {};
  for (const section of raw.split("|")) {
    const colon = section.indexOf(":");
    if (colon < 0) throw new Error("Invalid PR CI scope section: " + section);
    const kind = section.slice(0, colon).trim().toLowerCase();
    if (!["test", "build"].includes(kind) || Object.hasOwn(result, kind))
      throw new Error("Duplicate or unknown PR CI scope: " + kind);
    const values = section
      .slice(colon + 1)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!values.length) throw new Error("Empty PR CI scope: " + kind);
    if (values.includes("none") && values.length !== 1)
      throw new Error("'none' must be the only " + kind + " selector");
    if (kind === "build") {
      for (const value of values)
        if (value !== "none" && value !== "all" && !validTargets.has(value))
          throw new Error("Unknown build target: " + value);
    } else {
      for (const value of values)
        if (
          value !== "none" &&
          value !== "all" &&
          (!safeGlob.test(value) ||
            value.includes("..") ||
            value.startsWith("/") ||
            !(value.startsWith("tests/") && allowedTestRoot.test(value)))
        )
          throw new Error(
            "Unsafe or unsupported test selector: " + value + ". Use tests/**/*.test.js paths.",
          );
    }
    result[kind] = [...new Set(values)];
  }
  return result;
}

export async function resolveTestSelectors(selectors) {
  if (!selectors || selectors.includes("none")) return [];
  if (selectors.includes("all")) return ["all"];
  const found = new Set();
  for (const selector of selectors) {
    let count = 0;
    for await (const file of glob(selector)) {
      if (!file.startsWith("tests/") || !/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
      found.add(file);
      count++;
    }
    if (!count) throw new Error("Test selector matched no files: " + selector);
  }
  return [...found].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const parsed = parsePrCiScope(process.env.PR_TITLE || "");
  const tests = parsed?.test ? await resolveTestSelectors(parsed.test) : null;
  const builds = parsed?.build ? (parsed.build.includes("all") ? ["all"] : parsed.build) : null;
  const matrix = builds?.filter((item) => item !== "none" && item !== "all") ?? [];
  process.stdout.write(JSON.stringify({ explicit: Boolean(parsed), tests, builds, matrix }) + "\n");
}
