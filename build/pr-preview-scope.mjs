// Determine affected PR installers using transitive runtime dependencies.
// Unknown executable changes use the complete build for safety.
import { execFileSync } from "node:child_process";
import { analyzeRuntimeGraph } from "./runtime-graph.mjs";
import definitions from "../userscripts.config.js";

const all = ["standalone", ...definitions.map(({ id }) => id), "unified"];
const base = process.env.PR_BASE_SHA;
const head = process.env.PR_HEAD_SHA || "HEAD";
if (!base) throw Error("PR_BASE_SHA is required");
const files = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRT", base, head], { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
const source = files.filter((file) => file.startsWith("src/"));
const global = files.some((file) => /^(build\/|userscripts\.config\.js$|distribution\.config\.js$|package(-lock)?\.json$|vite\.config\.|tsconfig|\.github\/workflows\/pr-userscript-previews\.yml$)/.test(file));
const unknown = files.some((file) => /^(assets\/|public\/)/.test(file));
let targets = [];
let reason = "no-runtime-changes";
if (global || unknown) {
  targets = all;
  reason = "global-build-input";
} else if (source.length) {
  const affected = [];
  for (const definition of definitions) {
    const graph = await analyzeRuntimeGraph(definition.entry);
    if (source.some((file) => graph.files.includes(file))) affected.push(definition.id);
  }
  if (!affected.length) {
    targets = all;
    reason = "unresolved-source-dependency";
  } else {
    targets = [...new Set(["standalone", ...affected, ...(affected.some((id) => definitions.find((d) => d.id === id)?.unified !== false) ? ["unified"] : [])])];
    reason = "runtime-dependency-graph";
  }
}
process.stdout.write(JSON.stringify({ files, targets, reason, full: targets.length === all.length }) + "\n");
