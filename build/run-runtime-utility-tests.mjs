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
// The compiled-runtime fixture performs a Vite build during module initialization.
// Run it first in a single worker so it cannot inherit memory pressure from other suites.
const compiledRuntimeSuite = "tests/runtime.test.js";
const compiledRuntimeIndex = suites.indexOf(compiledRuntimeSuite);
if (compiledRuntimeIndex !== -1) {
  suites.splice(compiledRuntimeIndex, 1);
  suites.unshift(compiledRuntimeSuite);
}
if (process.env.RUNTIME_TEST_SKIP_DIST === "true") {
  const index = suites.indexOf("tests/build.test.js");
  if (index !== -1) suites.splice(index, 1);
  console.log("Skipping dist-dependent build tests because no full distribution was built.");
}
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
const isolateSuites = process.env.RUNTIME_TEST_ISOLATE_SUITES !== "false";
const batches = isolateSuites ? suites.map((suite) => [suite]) : [suites];
for (const [index, batch] of batches.entries()) {
  const batchStartedAt = Date.now();
  console.log(
    `::group::Vitest runtime suite ${index + 1}/${batches.length}: ${batch.join(", ")}`,
  );
  const workers = batch.includes(compiledRuntimeSuite) ? 1 : 2;
  console.log(
    `Starting Vitest (timeout: ${timeoutMs}ms, workers: ${workers}, isolated: ${isolateSuites})`,
  );
  const args = [
    "vitest",
    "run",
    `--maxWorkers=${workers}`,
    "--no-file-parallelism",
    ...(batch.includes(compiledRuntimeSuite) ? ["--reporter=verbose", "--testTimeout=10000"] : []),
    ...batch,
  ];
  const result = spawnSync(
    "npx",
    args,
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    },
  );
  console.log(
    `Vitest batch finished after ${Date.now() - batchStartedAt}ms ` +
      `(exit: ${result.status ?? "none"}, signal: ${result.signal ?? "none"})`,
  );
  if (result.error) {
    console.error(`Vitest execution error: ${result.error.message}`);
    if (result.error.code === "ETIMEDOUT") {
      console.error(`Vitest exceeded ${timeoutMs}ms on: ${batch.join(", ")}`);
    }
  }
  console.log("::endgroup::");
  if (result.status !== 0 || result.error) {
    console.error(
      `Runtime suite failed: ${batch.join(", ")} ` +
        `(total elapsed: ${Date.now() - startedAt}ms)`,
    );
    process.exit(1);
  }
}
console.log(`All ${suites.length} runtime/utility suites passed in ${Date.now() - startedAt}ms`);
