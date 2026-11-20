import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = process.cwd();
const ignored = new Set(["node_modules", ".git", "dist", "coverage", "build", "tests"]);
const extensions = /\.(css|tsx?|jsx?)$/;
const cssExt = /\.css$/;
const imports = /(?:@import\s+(?:url\()?\s*["']([^"']+)|(?:import|export)\s+(?:[^"'\n]*?\s+from\s+)?["']([^"']+\.css(?:\?[^"']*)?)["']|import\(\s*["']([^"']+\.css(?:\?[^"']*)?)["']\s*\))/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (extensions.test(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}
function resolveImport(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec.split("?")[0]);
  for (const candidate of [base, base + ".css", path.join(base, "index.css")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}
const files = walk(path.join(root, "src"));
const graph = new Map();
const css = [];
const diagnostics = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const deps = [];
  for (const match of source.matchAll(imports)) {
    const spec = match[1] || match[2] || match[3];
    const resolved = resolveImport(file, spec);
    if (resolved) deps.push(path.relative(root, resolved));
    else if (spec.startsWith(".")) diagnostics.push({ file: path.relative(root, file), code: "unresolved-import", spec });
  }
  graph.set(path.relative(root, file), [...new Set(deps)]);
  if (!cssExt.test(file)) continue;
  const ast = postcss.parse(source, { from: file });
  const tokens = [];
  ast.walkDecls(decl => {
    if (decl.prop.startsWith("--")) tokens.push({ name: decl.prop, value: decl.value, line: decl.source.start.line });
  });
  css.push({ file: path.relative(root, file), tokens });
}
const report = { files: css.length, graph: Object.fromEntries(graph), stylesheets: css, diagnostics };
const output = JSON.stringify(report, null, 2) + "\n";
if (process.argv.includes("--write-report")) {
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(root, "artifacts/css-semantic-audit.json"), output);
}
console.log(JSON.stringify({ stylesheets: css.length, dependencies: [...graph.values()].reduce((n, a) => n + a.length, 0), diagnostics: diagnostics.length }));
if (process.argv.includes("--strict") && diagnostics.length) process.exitCode = 1;
