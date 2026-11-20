#!/usr/bin/env node
/**
 * Syntax-only guard for React/TypeScript source files.
 * Uses TypeScript's real parser, not regex-based source rewriting.
 * No test suites, compilation or output files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import ts from "typescript";

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("Usage: node build/check-react-syntax.mjs <file.tsx|file.ts> [...]");
  process.exit(2);
}
let failures = 0;
for (const file of targets) {
  const source = readFileSync(resolve(file), "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = parsed.parseDiagnostics;
  // Literal backslash-n outside comments/strings/templates is invalid source.
  // TypeScript parser reports it; this extra diagnostic makes the cause explicit.
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, kind, source);
  let token;
  while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.Unknown && scanner.getTokenText() === "\\") {
      const pos = scanner.getTokenPos();
      if (source.slice(pos, pos + 2) === "\\n") {
        const where = parsed.getLineAndCharacterOfPosition(pos);
        console.error(`${file}:${where.line + 1}:${where.character + 1}: literal \\n outside a string; use an actual newline`);
        failures++;
      }
    }
  }
  for (const diagnostic of diagnostics) {
    const where = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    console.error(`${file}:${where.line + 1}:${where.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
    failures++;
  }
  if (!diagnostics.length) console.log(`✓ Syntax parsed: ${file}`);
}
process.exitCode = failures ? 1 : 0;
