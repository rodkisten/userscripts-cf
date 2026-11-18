#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [reportPath = "artifacts/rod-ast-vitest.json", diffPath = "artifacts/rod-ast.diff", outputPath = "artifacts/rod-ast-summary.md"] = process.argv.slice(2);
const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "&#124;").replaceAll("\n", " ");
const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
let report = {};
try { report = JSON.parse(read(reportPath) || "{}"); } catch { /* Show missing/invalid report explicitly. */ }
const files = report.testResults ?? [];
const tests = files.flatMap((file) => (file.assertionResults ?? []).map((test) => ({ ...test, file: file.name ?? "unknown" })));
const passed = tests.filter((test) => test.status === "passed");
const failed = tests.filter((test) => test.status === "failed");
const pending = tests.filter((test) => !["passed", "failed"].includes(test.status));
const sections = [
  "## 🧬 Rod AST · Validation report",
  "",
  `**${passed.length} passed** · **${failed.length} failed** · **${pending.length} skipped/pending** · **${tests.length} total**`,
  "",
  "| Status | Check | Duration |",
  "| :-- | :-- | --: |",
  ...tests.map((test) => `| ${test.status === "passed" ? "✅" : test.status === "failed" ? "❌" : "⏭️"} | \`${escape(test.fullName ?? test.title)}\` | ${Number(test.duration ?? 0)} ms |`),
  "",
];
if (!tests.length) sections.push("> ⚠️ Vitest JSON report missing or empty. Check the unit-test step.", "");
if (failed.length) {
  sections.push("### 🔥 Failed tests", "");
  for (const test of failed) {
    sections.push(`<details open><summary>❌ ${escape(test.fullName ?? test.title)}</summary>`, "", "~~~text");
    sections.push(...(test.failureMessages ?? ["No failure details were provided."]).map((line) => String(line).replace(/\x1b\[[0-9;]*m/g, "")));
    sections.push("~~~", "", "</details>", "");
  }
}
const diff = read(diffPath);
sections.push("### 🔎 Generated fixture · highlighted diff", "", "<details open><summary>Expand full source diff</summary>", "", "~~~diff", diff || "No diff available.", "~~~", "", "</details>", "");
const result = sections.join("\n");
writeFileSync(outputPath, result);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, result + "\n");
}
console.log(`Rod AST report: ${passed.length} passed, ${failed.length} failed, ${pending.length} skipped`);
