#!/usr/bin/env node
/**
 * Repository-wide TypeScript/TSX syntax validation and conservative repair.
 * Only replaces literal backslash-n tokens outside strings/comments when the
 * TypeScript scanner identifies an invalid standalone backslash.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname, relative } from "node:path";
import process from "node:process";
import ts from "typescript";

const fix = process.argv.includes("--fix");
const selected = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ignored = new Set([".git", "node_modules", "dist", "coverage", ".next", ".cache", "artifacts"]);
const extensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignored.has(entry.name) || entry.name.startsWith(".git")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && extensions.has(extname(entry.name)) && !entry.name.endsWith(".d.ts")) yield path;
  }
}
const files = selected.length ? selected : [...walk(".")];
let errors = 0;
let repaired = 0;
for (const file of files) {
  let source = readFileSync(file, "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parse = (content) => ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  const original = parse(source);
  if (fix && original.parseDiagnostics.length) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, kind, source);
    const offsets = [];
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.Unknown && scanner.getTokenText() === "\\" && source.slice(scanner.getTokenPos(), scanner.getTokenPos() + 2) === "\\n") {
        offsets.push(scanner.getTokenPos());
      }
    }
    if (offsets.length) {
      let candidate = source;
      for (const offset of offsets.reverse()) candidate = candidate.slice(0, offset) + "\n" + candidate.slice(offset + 2);
      if (parse(candidate).parseDiagnostics.length === 0 && candidate !== source) {
        writeFileSync(file, candidate);
        source = candidate;
        repaired++;
        console.log("🔧 Repaired:", file);
      }
    }
  }
  const parsed = parse(source);
  for (const diagnostic of parsed.parseDiagnostics) {
    const pos = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    console.error("❌", relative(".", file) + ":" + (pos.line + 1) + ":" + (pos.character + 1), ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    errors++;
  }
}
console.log("🧬 Syntax scan:", files.length, "files;", repaired, "repaired;", errors, "errors");
process.exitCode = errors ? 1 : 0;
