#!/usr/bin/env node
/**
 * Run only runtime and framework-independent utility tests.
 * Never execute UI/component/userscript rendering suites.
 * See docs/testing-policy.md.
 */
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const testsDir = join(root, "tests");
const testFile = /\.test\.[cm]?[jt]sx?$/;
const allowed = /(?:^|[-_.])(runtime|context|rod-ast|ast|codemod|parser|storage|event|http|intercept|clipboard|gm|css|style|build|bundle|config|scope|selector|transform|utility|util|cache|network|worker|type|lockfile|deploy|release|security|sanitize)(?:[-_.]|$)/i;
const forbidden = /(?:^|[-_.])(component|render|ui|visual|snapshot|playground|instagram|reddit|gonewild|soundgasm|twitter|rodx|reel|page-repl|github-tools|studio|button|dialog|menu|toast|dock|form|browser|integration|integrated|boot|standalone)(?:[-_.]|$)/i;
const benchmark = /runtime-startup-benchmark/;
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    if (!entry.isFile() || !testFile.test(entry.name)) return [];
    const name = entry.name;
    if (benchmark.test(name) || forbidden.test(name) || !allowed.test(name)) return [];
    return [relative(root, path).split(sep).join("/")];
  });
}
const selected = collect(testsDir).sort();
if (!selected.length) {
  console.error("No permitted runtime/utility tests found. Refusing to report a green run.");
  process.exit(1);
}
console.log("Runtime/utility suites:", selected.join(", "));
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...selected, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
