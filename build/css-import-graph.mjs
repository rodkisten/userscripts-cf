import path from "node:path";
import { parse } from "@babel/parser";

const norm = value => value.replaceAll("\\", "/");
const resolve = (from, spec, files) => {
  if (!spec.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split("?")[0]));
  for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", ".css", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]) {
    if (files.has(base + suffix)) return base + suffix;
  }
  return null;
};
export function analyzeImportGraph(sources) {
  const files = new Map(Object.entries(sources).map(([name, content]) => [norm(name), content]));
  const edges = new Map(), diagnostics = [];
  for (const [file, content] of files) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    let ast;
    try {
      ast = parse(content, { sourceType: "unambiguous", plugins: ["typescript", "jsx"], errorRecovery: false });
    } catch (error) {
      diagnostics.push({ file, code: "parse-error", message: String(error.message) });
      continue;
    }
    const imports = [];
    for (const node of ast.program.body) {
      if (!["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) || !node.source) continue;
      const spec = node.source.value;
      const target = resolve(file, spec, files);
      if (target) imports.push({ target, spec, kind: node.type });
      else if (spec.startsWith(".")) diagnostics.push({ file, code: "unresolved-module", spec });
    }
    edges.set(file, imports);
  }
  return { edges: Object.fromEntries(edges), diagnostics };
}
