import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("tsconfig.json not found");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getCanonicalFileName: (name) => name,
  getNewLine: () => "\n",
}));
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
  const ast = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
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
    replacements.push({ start: node.moduleSpecifier.getStart(ast), end: node.moduleSpecifier.end, text: '"@solidjs/web"' });
  }
  const visit = (node) => {
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal) &&
        node.argument.literal.text === "solid-js" && node.qualifier?.getText(ast) === "JSX") {
      replacements.push({start: node.argument.literal.getStart(ast),end:node.argument.literal.end,text:'"@solidjs/web"'});
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!replacements.length) continue;
  let updated = original;
  for (const change of replacements.sort((a,b) => b.start-a.start)) {
    updated = updated.slice(0,change.start)+change.text+updated.slice(change.end);
  }
  fixes.push({file,original,updated,count:replacements.length});
}
const countErrors = () => {
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error).length;
};
const before = countErrors();
for (const fix of fixes) fs.writeFileSync(fix.file,fix.updated);
const after = countErrors();
if (after > before) {
  for (const fix of fixes) fs.writeFileSync(fix.file,fix.original);
  throw new Error(`AST autofix rejected: errors increased from ${before} to ${after}`);
}
const remaining = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options)).filter((d) => d.category === ts.DiagnosticCategory.Error);
const counts = new Map();
for (const diagnostic of remaining) counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
const topErrors = [...counts].sort((a,b) => b[1]-a[1]).slice(0,12).map(([code,count]) => `- TS${code}: ${count}`).join("\\n");
const diagnostics = remaining.map((d) => {
  const location = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
  const file = d.file ? path.relative(process.cwd(), d.file.fileName) : "(project)";
  return { file, line: location ? location.line + 1 : 0, column: location ? location.character + 1 : 0, code: d.code, message: ts.flattenDiagnosticMessageText(d.messageText, " ") };
});
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/typescript-autofix-diagnostics.json", JSON.stringify({before,after,fixes:fixes.length,diagnostics},null,2));
const summary = `### TypeScript AST autofix\\n\\n- Before: ${before} errors\\n- After: ${after} errors\\n- Files changed: ${fixes.length}\\n- AST JSX import repairs: ${fixes.reduce((sum,fix)=>sum+fix.count,0)}\\n- Safe mode: no any, no ts-ignore, no forced casts\\n\\n### Remaining diagnostic groups\\n${topErrors}\\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
console.log(summary);

if (remaining.length > 0 && fixes.length === 0) {
  console.error(`::error::AST autofix made no changes; ${remaining.length} TypeScript errors remain. See artifacts/typescript-autofix-diagnostics.json`);
  process.exitCode = 1;
}
