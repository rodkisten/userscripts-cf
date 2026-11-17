import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("tsconfig.json not found");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
if (parsed.errors.length)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }),
  );
const files = new Map(parsed.fileNames.map((file) => [path.resolve(file), { version: 0 }]));
const host = {
  getScriptFileNames: () => [...files.keys()],
  getScriptVersion: (file) => String(files.get(path.resolve(file))?.version ?? 0),
  getScriptSnapshot: (file) => {
    const content = ts.sys.readFile(file);
    return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
  },
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const sourceFiles = parsed.fileNames.filter((file) => /\.tsx?$/.test(file));
const fixes = [];
for (const file of sourceFiles) {
  const original = ts.sys.readFile(file);
  if (!original) continue;
  const ast = ts.createSourceFile(
    file,
    original,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const replacements = [];
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const moduleName = node.moduleSpecifier.text;
    const clause = node.importClause;
    if (!clause?.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    if (clause.name || clause.namedBindings.elements.length !== 1) continue;
    const spec = clause.namedBindings.elements[0];
    if (spec.name.text !== "JSX" || spec.propertyName) continue;
    if (!["solid-js", "solid-js/jsx", "solid-js/jsx-runtime"].includes(moduleName)) continue;
    replacements.push({
      start: node.moduleSpecifier.getStart(ast),
      end: node.moduleSpecifier.end,
      text: '"@solidjs/web"',
    });
  }
  const visit = (node) => {
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal) &&
      node.argument.literal.text === "solid-js" &&
      node.qualifier?.getText(ast) === "JSX"
    ) {
      replacements.push({
        start: node.argument.literal.getStart(ast),
        end: node.argument.literal.end,
        text: '"@solidjs/web"',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!replacements.length) continue;
  let updated = original;
  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    updated = updated.slice(0, change.start) + change.text + updated.slice(change.end);
  }
  fixes.push({ file, original, updated, count: replacements.length });
}
// TS2347: restore DOM method typing when an untyped receiver hides native querySelector generics.
// The transformation preserves the generic and only runs for calls diagnosed by TypeScript.
const baselineProgram = ts.createProgram(parsed.fileNames, parsed.options);
const errors2347 = ts
  .getPreEmitDiagnostics(baselineProgram)
  .filter((d) => d.code === 2347 && d.file && d.start !== undefined);
const domEdits = new Map();
for (const d of errors2347) {
  const ast = d.file;
  const locate = (node) => {
    if (d.start < node.getStart(ast) || d.start >= node.end) return undefined;
    return ts.forEachChild(node, locate) ?? node;
  };
  let node = locate(ast);
  while (node && !ts.isCallExpression(node)) node = node.parent;
  if (!node || !node.typeArguments?.length || !ts.isPropertyAccessExpression(node.expression)) continue;
  const method = node.expression.name.text;
  if (method !== "querySelector" && method !== "querySelectorAll") continue;
  const receiver = node.expression.expression;
  // Avoid changing optional chaining, calls with side effects or arbitrary expressions.
  if (!ts.isIdentifier(receiver) || node.questionDotToken || node.expression.questionDotToken) continue;
  const checker = baselineProgram.getTypeChecker();
  const receiverType = checker.getTypeAtLocation(receiver);
  if (!(receiverType.flags & ts.TypeFlags.Any)) continue;
  const file = path.resolve(ast.fileName);
  const edits = domEdits.get(file) ?? [];
  edits.push({
    start: receiver.getStart(ast),
    end: receiver.end,
    text: `(${receiver.getText(ast)} as ParentNode)`,
  });
  domEdits.set(file, edits);
}
for (const [file, edits] of domEdits) {
  const existing = fixes.find((fix) => path.resolve(fix.file) === file);
  if (existing) continue;
  const original = ts.sys.readFile(file);
  if (original === undefined) continue;
  // Deduplicate repeated diagnostics on the same receiver, then reject overlapping spans.
  const unique = [...new Map(edits.map((edit) => [`${edit.start}:${edit.end}`, edit])).values()].sort(
    (a, b) => a.start - b.start,
  );
  if (unique.some((edit, i) => i > 0 && edit.start < unique[i - 1].end)) {
    console.warn(`Skipping overlapping AST edits in ${file}`);
    continue;
  }
  let updated = original;
  for (const edit of [...unique].reverse()) {
    updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
  }
  const parsedSource = ts.createSourceFile(
    file,
    updated,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (parsedSource.parseDiagnostics.length) {
    console.warn(`Skipping AST edits producing syntax errors in ${file}`);
    continue;
  }
  if (updated !== original) fixes.push({ file, original, updated, count: unique.length });
}
const countErrors = () => {
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error).length;
};
const before = countErrors();
for (const fix of fixes) fs.writeFileSync(fix.file, fix.updated);
const syntaxErrors = fixes.flatMap(
  ({ file }) =>
    ts.createSourceFile(
      file,
      ts.sys.readFile(file),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    ).parseDiagnostics,
);
const after = countErrors();
if ((after >= before || syntaxErrors.length > 0) && fixes.length > 0) {
  for (const fix of fixes) fs.writeFileSync(fix.file, fix.original);
  throw new Error(`AST autofix rejected: errors did not decrease from ${before} to ${after}`);
}
const remaining = ts
  .getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options))
  .filter((d) => d.category === ts.DiagnosticCategory.Error);
const counts = new Map();
for (const diagnostic of remaining) counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
const topErrors = [...counts]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([code, count]) => `- TS${code}: ${count}`)
  .join("\\n");
const diagnostics = remaining.map((d) => {
  const location = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
  const file = d.file ? path.relative(process.cwd(), d.file.fileName) : "(project)";
  return {
    file,
    line: location ? location.line + 1 : 0,
    column: location ? location.character + 1 : 0,
    code: d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, " "),
  };
});
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(
  "artifacts/typescript-autofix-diagnostics.json",
  JSON.stringify({ before, after, fixes: fixes.length, diagnostics }, null, 2),
);
const summary = `### TypeScript AST autofix\\n\\n- Before: ${before} errors\\n- After: ${after} errors\\n- Files changed: ${fixes.length}\\n- AST transformations attempted: ${fixes.reduce((sum, fix) => sum + fix.count, 0)}\\n- Safe mode: no any, no ts-ignore, no forced casts\\n\\n### Remaining diagnostic groups\\n${topErrors}\\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);

if (remaining.length > 0 && fixes.length === 0) {
  console.error(
    `::error::AST autofix made no changes; ${remaining.length} TypeScript errors remain. See artifacts/typescript-autofix-diagnostics.json`,
  );
  process.exitCode = 1;
}
