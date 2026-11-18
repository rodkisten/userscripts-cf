#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { transformRodAst } from "./rod-ast.mjs";
import { migrateUserscriptIife } from "./rod-ast-iife.mjs";
const args = process.argv.slice(2);
const input = args.find((x) => !x.startsWith("--")) ?? "tests/fixtures/rod-ast.input.tsx";
const output = args.find((x) => x.startsWith("--out="))?.slice(6) ?? "artifacts/rod-ast.output.tsx";
const report = args.find((x) => x.startsWith("--report="))?.slice(9) ?? "artifacts/rod-ast-report.json";
const source = readFileSync(input, "utf8");
const result = args.includes("--iife")
  ? migrateUserscriptIife(source, input)
  : transformRodAst(source, input);
mkdirSync(dirname(resolve(output)), { recursive: true });
mkdirSync(dirname(resolve(report)), { recursive: true });
writeFileSync(output, result.code);
writeFileSync(
  report,
  JSON.stringify(
    {
      input,
      output,
      changed: result.changed,
      edits: result.edits,
      diagnostics: result.diagnostics,
      metadata: result.metadata ?? {},
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      input,
      output,
      changed: result.changed,
      replacements: result.edits.length,
      diagnostics: result.diagnostics,
    },
    null,
    2,
  ),
);
if (result.diagnostics.length) process.exitCode = 1;
