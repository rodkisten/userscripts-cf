import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function render(report, diff = "") {
  const dir = mkdtempSync(join(tmpdir(), "rod-ast-summary-"));
  try {
    const input = join(dir, "vitest.json");
    const patch = join(dir, "fixture.diff");
    const output = join(dir, "summary.md");
    if (report !== null) writeFileSync(input, JSON.stringify(report));
    writeFileSync(patch, diff);
    execFileSync(process.execPath, ["build/rod-ast-summary.mjs", input, patch, output], {
      cwd: process.cwd(),
      env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
    });
    return readFileSync(output, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("missing report never masquerades as zero successful tests", () => {
  const summary = render(null);
  assert.match(summary, /Report unavailable/);
  assert.match(summary, /0 passed does not mean success/);
});

test("failed assertions include diagnostics in a readable section", () => {
  const summary = render({
    success: false,
    testResults: [{ name: "rod-ast", assertionResults: [
      { fullName: "GM style migration", status: "failed", failureMessages: ["Expected ctx.ui.style"], duration: 4 },
      { fullName: "fixture", status: "passed", duration: 1 },
    ] }],
  });
  assert.match(summary, /1 passed/);
  assert.match(summary, /1 failed/);
  assert.match(summary, /Expected ctx.ui.style/);
});

test("diff preview is bounded while full artifact remains separate", () => {
  const summary = render({ success: true, testResults: [{ name: "fixture", assertionResults: [
    { fullName: "fixture", status: "passed" },
  ] }] }, Array.from({ length: 350 }, (_, i) => "+" + i).join("\n"));
  assert.match(summary, /truncated after 300 lines/);
  assert.doesNotMatch(summary, /\+349/);
});
