import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const checks = [
  ["React only", ["build/check-react-only.mjs"]],
  ["React root ownership", ["build/check-react-root-ownership.mjs"]],
  ["TypeScript", ["node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json"]],
];

const results = [];
for (const [name, args] of checks) {
  if (process.env.GITHUB_ACTIONS) console.log("::group::" + name);
  else console.log("\n=== " + name + " ===");
  const start = Date.now();
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  const passed = result.status === 0 && !result.error;
  if (result.error) console.error(result.error.message);
  if (result.signal) console.error("Interrupted by " + result.signal);
  results.push({ name, passed, ms: Date.now() - start });
  if (process.env.GITHUB_ACTIONS) console.log("::endgroup::");
}
const summary = [
  "## Typecheck",
  "",
  "| Check | Result | Duration |",
  "| --- | --- | --- |",
  ...results.map(({ name, passed, ms }) => "| " + name + " | " + (passed ? "PASS" : "FAIL") + " | " + ms + " ms |"),
].join("\n");
console.log("\n" + summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
process.exitCode = results.every(({ passed }) => passed) ? 0 : 1;
