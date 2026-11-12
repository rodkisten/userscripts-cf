import fs from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";

const fix = process.argv.includes("--fix");
const targets = [
  "src/userscripts/instagram-saved/index.ts",
  "src/userscripts/instagram-saved/core.ts",
];
let errors = 0;

for (const filename of targets) {
  const absolute = path.resolve(filename);
  let content;
  try {
    content = await fs.readFile(absolute, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      continue;
    }
    throw error;
  }
  const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];

  function add(start, end, replacement, message) {
    edits.push({ start, end, replacement, message });
  }

  function braces(body, label) {
    if (body && !ts.isBlock(body)) {
      add(body.getStart(source), body.getEnd(), `{\n${body.getText(source)}\n}`, `${label} requires braces`);
    }
  }

  function visit(node) {
    if (ts.isIfStatement(node)) {
      braces(node.thenStatement, "if");
      if (node.elseStatement && !ts.isIfStatement(node.elseStatement)) {
        braces(node.elseStatement, "else");
      }
    } else if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      braces(node.statement, ts.SyntaxKind[node.kind]);
    }

    const multiline = source.getLineAndCharacterOfPosition(node.getStart(source)).line <
      source.getLineAndCharacterOfPosition(node.getEnd()).line;
    const declaration = ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) ||
      ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node);
    const control = ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node) ||
      ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) ||
      ts.isSwitchStatement(node) || ts.isTryStatement(node);

    if (multiline && (declaration || control) && node.parent && ts.isSourceFile(node.parent)) {
      const end = node.getEnd();
      const remaining = content.slice(end);
      if (/^\r?\n[^\r\n\s]/.test(remaining) || /^\r?\n[ \t]+\S/.test(remaining)) {
        add(end, end, "\n", "blank line required after multiline declaration or control block");
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  errors += edits.length;
  if (fix && edits.length) {
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      content = content.slice(0, edit.start) + edit.replacement + content.slice(edit.end);
    }
    await fs.writeFile(absolute, content);
  }
  if (edits.length) {
    console.log(`${filename}: ${edits.length} style issue(s)${fix ? " fixed" : ""}`);
  }
}

if (errors && !fix) {
  process.exitCode = 1;
} else {
  console.log("Style check complete.");
}
