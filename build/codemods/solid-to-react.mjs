#!/usr/bin/env node
/**
 * Conservative Solid/DOM JSX -> React JSX codemod.
 * Uses TypeScript's AST and reports unsupported Solid semantics instead of
 * silently converting signals/effects into invalid React hooks.
 *
 * Usage: node build/codemods/solid-to-react.mjs [--write] [--typecheck] [paths...]
 */
import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const write = args.includes("--write");
const typecheck = args.includes("--typecheck");
const roots = args.filter((arg) => !arg.startsWith("--"));
const targets = roots.length ? roots : ["src"];
const jsxAttrs = new Map([
  ["class", "className"],
  ["for", "htmlFor"],
  ["tabindex", "tabIndex"],
  ["maxlength", "maxLength"],
  ["minlength", "minLength"],
  ["autocomplete", "autoComplete"],
  ["autofocus", "autoFocus"],
  ["spellcheck", "spellCheck"],
  ["readonly", "readOnly"],
  ["inputmode", "inputMode"],
  ["srcset", "srcSet"],
  ["crossorigin", "crossOrigin"],
  ["contenteditable", "contentEditable"],
]);
const solidNames = new Set([
  "createSignal",
  "createEffect",
  "createMemo",
  "createStore",
  "onCleanup",
  "onMount",
  "For",
  "Show",
  "Switch",
  "Match",
  "Index",
  "createResource",
  "batch",
  "untrack",
]);
const reports = [];
function walk(path, output) {
  const info = statSync(path);
  if (info.isDirectory()) {
    if (["node_modules", "dist", "build-output", ".git"].includes(path.split("/").at(-1))) return;
    for (const name of readdirSync(path)) walk(resolve(path, name), output);
  } else if ([".tsx", ".jsx"].includes(extname(path))) output.push(path);
}
const files = [];
for (const target of targets) walk(resolve(target), files);
for (const file of files) {
  const original = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    original,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
  );
  const edits = [];
  const blockers = [];
  const booleanAttrs = new Set(['spellCheck','readOnly','autoFocus','contentEditable','disabled','checked','required','multiple']);
  const numericAttrs = new Set(['maxLength','minLength','rows','cols','size','tabIndex','colSpan','rowSpan']);
  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      const before = node.name.text;
      const after = jsxAttrs.get(before);
      if (after) edits.push({ start: node.name.getStart(sf), end: node.name.getEnd(), text: after });
      const name = after || before;
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        const value = node.initializer.text;
        if (numericAttrs.has(name) && /^-?\\d+$/.test(value)) edits.push({start:node.initializer.getStart(sf),end:node.initializer.getEnd(),text:'{' + value + '}'});
        if (booleanAttrs.has(name) && /^(true|false)$/i.test(value)) edits.push({start:node.initializer.getStart(sf),end:node.initializer.getEnd(),text:'{' + value.toLowerCase() + '}'});
      }
      if (before === 'textContent') blockers.push({line:sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1,kind:'Requires React children conversion',name:before});
      if (before.startsWith("on:") || before.startsWith("use:"))
        blockers.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          kind: "Solid JSX directive",
          name: before,
        });
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /^(solid-js|@solidjs\/web)(\/|$)/.test(node.moduleSpecifier.text)
    ) {
      blockers.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        kind: "Solid import requires semantic migration",
        name: node.moduleSpecifier.text,
      });
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      solidNames.has(node.expression.text)
    ) {
      blockers.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        kind: "Solid primitive requires lifecycle review",
        name: node.expression.text,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  let updated = original;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
  if (write && updated !== original) writeFileSync(file, updated);
  const changed = updated !== original;
  if (edits.length || blockers.length)
    reports.push({ file: relative(process.cwd(), file), replacements: edits.length, blockers });
}
const changedFiles = reports.filter(item=>item.changed).length;
const total = reports.reduce((sum, item) => sum + item.replacements, 0);
console.log(
  JSON.stringify(
    { mode: write ? "write" : "dry-run", files: files.length, changedFiles, replacements: total, reports },
    null,
    2,
  ),
);
if (typecheck) {
  const result = spawnSync("npm", ["run", "typecheck:react"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
