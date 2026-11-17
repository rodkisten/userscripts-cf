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
const before = service.getProgram()?.getSemanticDiagnostics() ?? [];
const allowed = new Set([6133, 6192, 6196, 6198]);
const changes = new Map();
let fixes = 0;
for (const file of parsed.fileNames) {
  const diagnostics = service.getSemanticDiagnostics(file).filter((d) => allowed.has(d.code));
  for (const diagnostic of diagnostics) {
    if (diagnostic.start === undefined || diagnostic.length === undefined) continue;
    const candidates = service.getCodeFixesAtPosition(file, diagnostic.start, diagnostic.start + diagnostic.length, [diagnostic.code], {}, {});
    const safe = candidates.find((fix) =>
      /remove unused|delete unused/i.test(fix.description) &&
      fix.changes.length === 1 &&
      path.resolve(fix.changes[0].fileName) === path.resolve(file)
    );
    if (!safe) continue;
    const current = changes.get(file) ?? ts.sys.readFile(file);
    if (current === undefined) continue;
    const edits = safe.changes[0].textChanges;
    // Only apply non-overlapping edits from the original snapshot once per file.
    if (changes.has(file)) continue;
    let updated = current;
    for (const edit of [...edits].sort((a,b) => b.span.start - a.span.start)) {
      updated = updated.slice(0, edit.span.start) + edit.newText + updated.slice(edit.span.start + edit.span.length);
    }
    changes.set(file, updated);
    fixes++;
  }
}
for (const [file, content] of changes) {
  fs.writeFileSync(file, content);
  files.get(path.resolve(file)).version++;
}
const after = service.getProgram()?.getSemanticDiagnostics() ?? [];
if (after.length > before.length) {
  for (const [file] of changes) {
    // Refuse to leave a regression: the workflow will not publish these edits.
    console.error(`::error file=${file}::Automatic fixes increased TypeScript errors (${before.length} -> ${after.length})`);
  }
  process.exitCode = 1;
}
const summary = `### TypeScript safe autofix\n\n- Before: ${before.length} semantic errors\n- After: ${after.length} semantic errors\n- Candidate files: ${changes.size}\n- Applied fixes: ${fixes}\n- Scope: unused declarations only (TS6133/6192/6196/6198)\n\nOther type errors require manual review; no type assertions or suppression comments are generated.\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
