import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';

// Shared resolver for Vite and the import codemod.
export const root = path.resolve('src');
const scriptsRoot = path.join(root, 'userscripts');
const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];

export function scriptRoot(importer) {
  const file = path.resolve(importer);
  const rel = path.relative(scriptsRoot, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const name = rel.split(path.sep)[0];
  return name ? path.join(scriptsRoot, name) : null;
}

export function resolveAlias(specifier, importer) {
  const base = specifier.startsWith('~/') ? root : specifier.startsWith('@/') ? scriptRoot(importer) : null;
  if (!base) return null;
  const target = path.resolve(base, specifier.slice(2));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Alias escapes root: ' + specifier);
  return extensions.some(ext => fs.existsSync(target + ext)) ? target : null;
}

export function scopedAliases() {
  return {
    name: 'scoped-userscript-aliases',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || (!source.startsWith('@/') && !source.startsWith('~/'))) return null;
      const resolved = resolveAlias(source, importer.split('?')[0]);
      if (!resolved) throw new Error('Unresolved scoped alias: ' + source + ' in ' + importer);
      return resolved;
    },
  };
}

function rewrite(file, content) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const ast = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  const edits = [];
  function visit(node) {
    let literal = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) literal = node.moduleSpecifier;
    if (ts.isCallExpression(node) && node.arguments.length === 1 && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require')) literal = node.arguments[0];
    if (literal && ts.isStringLiteral(literal)) {
      const spec = literal.text;
      if (spec.startsWith('.')) {
        const absolute = path.resolve(path.dirname(file), spec);
        const local = scriptRoot(file);
        const base = local && (absolute === local || absolute.startsWith(local + path.sep)) ? local : root;
        if (absolute === base || absolute.startsWith(base + path.sep)) {
          const alias = base === local ? '@/' : '~/';
          const next = alias + path.relative(base, absolute).split(path.sep).join('/');
          if (next !== spec) edits.push({start: literal.getStart(ast) + 1, end: literal.getEnd() - 1, value: next});
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return edits.sort((a,b) => b.start-a.start).reduce((s,e) => s.slice(0,e.start)+e.value+s.slice(e.end), content);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : /\.[cm]?[jt]sx?$/.test(e.name) ? [path.join(dir,e.name)] : []);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const write = process.argv.includes('--write');
  const files = walk(root);
  let changed = 0;
  for (const file of files) {
    const before = fs.readFileSync(file,'utf8');
    const after = rewrite(file,before);
    if (before !== after) { changed++; console.log(path.relative(process.cwd(),file)); if(write) fs.writeFileSync(file,after); }
  }
  console.log(changed + ' files ' + (write ? 'rewritten' : 'need rewriting'));
  if (!write && changed) process.exitCode = 1;
}
