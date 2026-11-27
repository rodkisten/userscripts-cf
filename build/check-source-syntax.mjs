#!/usr/bin/env node
/** Scan every tracked JavaScript/TypeScript source file, safely repairing literal \n tokens. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const fix = process.argv.includes("--fix");
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file) && !file.endsWith(".d.ts"));
let errors = 0;
let repaired = 0;
for (const file of files) {
  let source = readFileSync(file, "utf8");
  const kind = /\.tsx$/.test(file)
    ? ts.ScriptKind.TSX
    : /\.jsx$/.test(file)
      ? ts.ScriptKind.JSX
      : /\.[cm]?ts$/.test(file)
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
  const parse = (content) => ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  if (fix && parse(source).parseDiagnostics.length) {
    const variant =
      kind === ts.ScriptKind.TSX || kind === ts.ScriptKind.JSX
        ? ts.LanguageVariant.JSX
        : ts.LanguageVariant.Standard;
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, variant, source);
    const positions = [];
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (
        token === ts.SyntaxKind.Unknown &&
        scanner.getTokenText() === "\\" &&
        source.slice(scanner.getTokenPos(), scanner.getTokenPos() + 2) === "\\n"
      ) {
        positions.push(scanner.getTokenPos());
      }
    }
    if (positions.length) {
      let candidate = source;
      for (const pos of positions.reverse())
        candidate = candidate.slice(0, pos) + "\n" + candidate.slice(pos + 2);
      if (!parse(candidate).parseDiagnostics.length) {
        writeFileSync(file, candidate);
        source = candidate;
        repaired++;
        console.log("🔧", file);
      }
    }
  }
  const parsed = parse(source);
  for (const diagnostic of parsed.parseDiagnostics) {
    const loc = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    console.error(
      file + ":" + (loc.line + 1) + ":" + (loc.character + 1),
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
    errors++;
  }
}
console.log("🧬 Scanned:", files.length, "files; repaired:", repaired, "; errors:", errors);
process.exitCode = errors ? 1 : 0;
