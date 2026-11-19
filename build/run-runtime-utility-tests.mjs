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
      if (allowed.test(entry.name) && !prohibited.test(relativePath)) {
        suites.push("tests/" + relativePath);
      }
    }
  }
}
await walk(root.pathname);
suites.sort();
if (!suites.length) {
  console.error("No eligible runtime/utility test suites found. Refusing silent success.");
  process.exit(1);
}
console.log("Runtime and utility suites:", suites.join(", "));
const timeoutMs = Number(process.env.RUNTIME_TEST_TIMEOUT_MS ?? 180_000);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000) {
  console.error("RUNTIME_TEST_TIMEOUT_MS must be a positive integer >= 1000");
  process.exit(2);
}
const startedAt = Date.now();
console.log(`Starting Vitest runtime/utility suites (timeout: ${timeoutMs}ms)`);
const result = spawnSync("npx", ["vitest", "run", "--maxWorkers=2", "--no-file-parallelism", ...suites], {
  stdio: "inherit",
  shell: process.platform === "win32",
  timeout: timeoutMs,
  killSignal: "SIGKILL",
});
const durationMs = Date.now() - startedAt;
console.log(`Vitest runtime/utility suites finished after ${durationMs}ms (exit: ${result.status ?? "none"}, signal: ${result.signal ?? "none"})`);
if (result.error) {
  console.error(`Vitest execution error: ${result.error.message}`);
  if (result.error.code === "ETIMEDOUT") {
    console.error(`Vitest exceeded its ${timeoutMs}ms timeout. Inspect tests for open handles or blocked workers.`);
  }
}
process.exit(result.status === 0 && !result.error ? 0 : 1);
