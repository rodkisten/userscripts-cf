import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const norm = file => file.replaceAll("\\", "/");
const cssImport = /(?:import|export)\s+(?:[^"'\n]*?\s+from\s+)?["']([^"']+\.css(?:\?[^"']*)?)["']|import\(\s*["']([^"']+\.css(?:\?[^"']*)?)["']\s*\)/g;
const styleAPIs = /\bctx\.(?:pageStyle|style)\s*\(|\bctx\.ui\.(?:style|registerStyles)\s*\(/g;
const directCSS = /\b(?:document\.head\.appendChild|insertRule|adoptedStyleSheets)\b/g;
function relativeResolve(from, spec, exists) {
  if (!spec.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split("?")[0]));
  for (const candidate of [base, base + ".css", base + ".module.css", base + "/index.css"]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}
export function analyzeStyleOwnership(sources) {
  const files = new Map(Object.entries(sources).map(([name, value]) => [norm(name), value]));
  const edges = new Map();
  const reverse = new Map();
  const entrypoints = new Map();
  const diagnostics = [];
  for (const [filename, content] of files) {
    const deps = new Set();
    if (filename.endsWith(".css")) {
      const ast = postcss.parse(content, { from: filename });
      ast.walkAtRules("import", rule => {
        const match = rule.params.match(/^\s*(?:url\(\s*)?["']([^"']+)["']/);
        if (match) {
          const resolved = relativeResolve(filename, match[1], f => files.has(f));
          if (resolved) deps.add(resolved);
          else diagnostics.push({ file: filename, code: "unresolved-css-import", spec: match[1] });
        }
      });
    } else {
      for (const match of content.matchAll(cssImport)) {
        const spec = match[1] || match[2];
        const resolved = relativeResolve(filename, spec, f => files.has(f));
        if (resolved) deps.add(resolved);
        else if (spec.startsWith(".")) diagnostics.push({ file: filename, code: "unresolved-css-import", spec });
      }
      const apiCalls = [...content.matchAll(styleAPIs)].map(match => match[0]);
      const page = apiCalls.some(call => call.includes("pageStyle"));
      const shadow = apiCalls.some(call => !call.includes("pageStyle"));
      if (page || shadow) entrypoints.set(filename, { page, shadow });
      if (directCSS.test(content)) diagnostics.push({ file: filename, code: "manual-global-style-review" });
      directCSS.lastIndex = 0;
    }
    edges.set(filename, [...deps].sort());
    for (const dep of deps) {
      if (!reverse.has(dep)) reverse.set(dep, new Set());
      reverse.get(dep).add(filename);
    }
  }
  const classifications = {};
  for (const filename of files.keys()) {
    if (!filename.endsWith(".css")) continue;
    const visited = new Set();
    const queue = [filename];
    const owners = new Set();
    while (queue.length) {
      const next = queue.shift();
      if (visited.has(next)) continue;
      visited.add(next);
      for (const parent of reverse.get(next) || []) {
        if (entrypoints.has(parent)) owners.add(parent);
        queue.push(parent);
      }
    }
    const text = files.get(filename);
    const ast = postcss.parse(text, { from: filename });
    let host = false, documentSelector = false, rootSelector = false;
    ast.walkRules(rule => {
      const selector = rule.selector;
      if (/(^|[,\s]):host(?:\b|\()/i.test(selector)) host = true;
      if (/(^|[,\s])(?:html|body)(?:\b|[.#:\[])/i.test(selector)) documentSelector = true;
      if (/(^|[,\s]):root\b/i.test(selector)) rootSelector = true;
    });
    const ownership = [...owners].map(owner => entrypoints.get(owner));
    const page = ownership.some(x => x.page);
    const shadow = ownership.some(x => x.shadow);
    const ambiguous = !owners.size || (page && shadow) || documentSelector || rootSelector;
    classifications[filename] = {
      status: ambiguous ? "review" : shadow && !page ? "shadow-candidate" : "review",
      owners: [...owners].sort(), host, documentSelector, rootSelector
    };
    if (ambiguous) diagnostics.push({ file: filename, code: "manual-ownership-review" });
  }
  return { edges: Object.fromEntries(edges), classifications, diagnostics };
}
export function auditRepository(directory = "src") {
  const sources = {};
  const scan = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) scan(path.join(dir, entry.name));
      else if (/\.(?:css|tsx?|jsx?)$/.test(entry.name)) {
        const file = norm(path.relative(process.cwd(), path.join(dir, entry.name)));
        sources[file] = fs.readFileSync(path.join(dir, entry.name), "utf8");
      }
    }
  };
  scan(directory);
  return analyzeStyleOwnership(sources);
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const report = auditRepository();
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/css-ownership.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    files: Object.keys(report.classifications).length,
    candidates: Object.values(report.classifications).filter(x => x.status === "shadow-candidate").length,
    review: Object.values(report.classifications).filter(x => x.status === "review").length,
    diagnostics: report.diagnostics.length
  }));
}
