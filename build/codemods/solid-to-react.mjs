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
  ["colspan", "colSpan"],
  ["rowspan", "rowSpan"],
  ["cellpadding", "cellPadding"],
  ["cellspacing", "cellSpacing"],
  ["allowfullscreen", "allowFullScreen"],
  ["frameborder", "frameBorder"],
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
  const addBlocker = (node, kind, name, suggestion) => blockers.push({
    line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    kind, name, suggestion,
  });
  if (sf.parseDiagnostics.length)
    blockers.push(
      ...sf.parseDiagnostics.map((d) => ({
        line: sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1,
        kind: "Parse diagnostic",
        name: ts.flattenDiagnosticMessageText(d.messageText, " "),
      })),
    );
  const booleanAttrs = new Set([
    "spellCheck",
    "readOnly",
    "autoFocus",
    "contentEditable",
    "disabled",
    "checked",
    "required",
    "multiple",
  ]);
  const numericAttrs = new Set([
    "maxLength",
    "minLength",
    "rows",
    "cols",
    "size",
    "tabIndex",
    "colSpan",
    "rowSpan",
  ]);
  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      const before = node.name.text;
      const after = jsxAttrs.get(before);
      if (after) edits.push({ start: node.name.getStart(sf), end: node.name.getEnd(), text: after });
      const name = after || before;
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        const value = node.initializer.text;
        if (numericAttrs.has(name) && /^-?\d+$/.test(value))
          edits.push({
            start: node.initializer.getStart(sf),
            end: node.initializer.getEnd(),
            text: "{" + value + "}",
          });
        if (booleanAttrs.has(name) && /^(true|false)$/i.test(value))
          edits.push({
            start: node.initializer.getStart(sf),
            end: node.initializer.getEnd(),
            text: "{" + value.toLowerCase() + "}",
          });
      }
      if (before === "textContent")
        blockers.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          kind: "Requires React children conversion",
          name: before,
        });
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
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName) && ["For", "Show", "Switch", "Match", "Index"].includes(node.tagName.text)) {
        addBlocker(node, "Solid control-flow JSX", node.tagName.text,
          node.tagName.text === "Show" ? "Review conditional rendering, fallback and render-prop semantics before using a React ternary." :
          node.tagName.text === "For" ? "Review array mapping, stable keys and reactive source semantics before converting to .map()." :
          "Review branching, ownership and reactive semantics before migrating to React JSX.");
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      solidNames.has(node.expression.text)
    ) {
      const primitive = node.expression.text;
      const suggestion = ({
        createSignal: "Candidate for useState only inside a React component or hook; update accessor reads and functional setters.",
        createEffect: "Review reactive dependencies and cleanup before converting to useEffect; never invoke hooks in init(ctx).",
        createMemo: "Review dependency tracking and memoized value reads before converting to useMemo.",
        onCleanup: "Attach cleanup to the owning useEffect or ctx.onDispose, depending on lifecycle ownership.",
        onMount: "Use a mount-only useEffect inside React, or ctx lifecycle APIs outside React.",
        createStore: "Preserve per-instance ctx.store; bridge React via useSyncExternalStore.",
      })[primitive] || "Requires semantic migration with instance-owned ctx lifecycle preserved.";
      addBlocker(node, "Solid primitive requires lifecycle review", primitive, suggestion);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  const canWrite = sf.parseDiagnostics.length === 0;
  let updated = original;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
  const changed = updated !== original;
  const postParse = changed ? ts.createSourceFile(file, updated, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX) : sf;
  const outputValid = postParse.parseDiagnostics.length === 0;
  if (!outputValid && canWrite) addBlocker(sf, "Generated JSX failed parsing", "parse", "Changes skipped; review overlapping or invalid AST edits.");
  const written = write && changed && canWrite && outputValid;
  if (written) writeFileSync(file, updated);
  if (edits.length || blockers.length)
    reports.push({ file: relative(process.cwd(), file), changed, written, skipped: changed && (!canWrite || !outputValid), replacements: edits.length, blockers });
}
const changedFiles = reports.filter((item) => item.changed).length;
const writtenFiles = reports.filter((item) => item.written).length;
const skippedFiles = reports.filter((item) => item.skipped).length;
const blockerCount = reports.reduce((sum, item) => sum + item.blockers.length, 0);
const total = reports.reduce((sum, item) => sum + item.replacements, 0);
console.log(
  JSON.stringify(
    { mode: write ? "write" : "dry-run", files: files.length, changedFiles, writtenFiles, skippedFiles, blockerCount, replacements: total, reports },
    null,
    2,
  ),
);
if (typecheck) {
  const result = spawnSync("npm", ["run", "typecheck:react"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
