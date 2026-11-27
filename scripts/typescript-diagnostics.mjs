import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";

const dir = "artifacts/typescript-diagnostics";
mkdirSync(dir, { recursive: true });
const result = spawnSync(process.execPath, [
  "node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json",
], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const raw = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
const errors = [];
for (const line of raw.split(/\r?\n/)) {
  const match = line.match(/^(?:(.*?)\((\d+),(\d+)\):\s*)?error (TS\d+):\s*(.*)$/);
  if (match) {
    errors.push({ file: match[1] || null, line: match[2] ? Number(match[2]) : null, column: match[3] ? Number(match[3]) : null, code: match[4], message: match[5] });
  } else if (line.trim() && errors.length && /^\s/.test(line)) {
    errors.at(-1).message += "\n" + line.trim();
  }
}
const groups = Map.groupBy(errors, e => e.file || "(global)");
const codes = Object.fromEntries([...Map.groupBy(errors, e => e.code)].map(([code, items]) => [code, items.length]));
const report = [...groups].map(([file, items]) => file + "\n" + items.map(e => "  " + (e.line ?? "-") + ":" + (e.column ?? "-") + " " + e.code + ": " + e.message).join("\n")).join("\n\n");
const output = "TypeScript errors: " + errors.length + " | exit: " + result.status + "\n" + JSON.stringify(codes) + "\n\n" + report;
writeFileSync(dir + "/raw.txt", raw);
writeFileSync(dir + "/errors.txt", output);
writeFileSync(dir + "/errors.json", JSON.stringify({ exitCode: result.status, codes, errors }, null, 2));
console.log(output);
if (result.error || (result.status !== 0 && !errors.length)) console.error(raw);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## TypeScript diagnostics\n\n" + output.slice(0, 900000).split("\n").map(line => "    " + line).join("\n") + "\n");
process.exitCode = result.status === 0 ? 0 : 1;
