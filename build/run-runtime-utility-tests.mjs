import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../tests/", import.meta.url);
const allowed =
  /(?:^|[-_.])(runtime|utilities|utility|utils|parser|codemod|ast|storage|config|build|pr-ci-scope)(?:[-_.]|$)/i;
const prohibited =
  /(?:component|userscript|solid|react-ui|design-system|visual|render|integration|boot|feature|benchmark|playground|shadow-mount|inspection-build|summary)/i;
const suites = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) {
      const relativePath = relative(root.pathname, path).replaceAll("\\", "/");
      if (allowed.test(entry.name) && !prohibited.test(relativePath) && relativePath !== "build.test.js") {
        suites.push("tests/" + relativePath);
      }
    }
  }
}
await walk(root.pathname);
suites.sort();
// Explicit paths are restricted to the runtime/utility allowlist.
const candidates = process.argv.slice(2).includes("--candidates");
const requested = [
  ...new Set(
    process.argv
      .slice(2)
      .filter((arg) => arg !== "--candidates")
      .map((path) => path.replace(/^\.\//, "").replaceAll("\\", "/")),
  ),
];
const selected = candidates
  ? requested.filter((path) => suites.includes(path))
  : requested.length
    ? requested
    : suites;
if (candidates && !selected.length) {
  console.log("No eligible runtime/utility candidates.");
  process.exit(0);
}
const invalid = selected.filter((path) => !suites.includes(path));
if (invalid.length || !selected.length) {
  console.error("Invalid or empty runtime/utility suite selection:", invalid.join(", "));
  process.exit(2);
}
const runnable = process.env.AST_UNIT_DELEGATED === "true"
  ? selected.filter((path) => path !== "tests/rod-ast.test.mjs")
  : selected;
if (runnable.length !== selected.length) console.log("AST unit suite delegated to required ast-tests job.");
if (!runnable.length) process.exit(0);
console.log("Runtime and utility suites:", runnable.join(", "));
const startedAt = Date.now();
const result = spawnSync("npx", ["--no-install", "vitest", "run", ...runnable], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) console.error(result.error.message);
console.log(`Vitest finished in ${Date.now() - startedAt}ms (exit: ${result.status ?? "none"})`);
process.exit(result.status ?? 1);
