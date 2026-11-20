import { parse } from "@babel/parser";
import { analyzeImportGraph } from "./css-import-graph.mjs";

function importedName(specifier) {
  return specifier.type === "ImportDefaultSpecifier" ? "default" :
    specifier.type === "ImportSpecifier" ? (specifier.imported.name ?? specifier.imported.value) : null;
}
function exportedName(specifier) {
  return specifier.exported.name ?? specifier.exported.value;
}
/**
 * Conservative static resolver for named css exports through TS/TSX barrels.
 * Any dynamic, namespace, computed or ambiguous binding is rejected.
 */
export function verifyStyleRegistration(sources, group, ownership) {
  const graph = analyzeImportGraph(sources);
  const failures = [...graph.diagnostics.filter(d => group.includes(d.file))];
  const parsed = new Map();
  const edgeTarget = (file, spec) => (graph.edges[file] || []).find(edge => edge.spec === spec)?.target;
  const parseFile = file => {
    if (parsed.has(file)) return parsed.get(file);
    try {
      const ast = parse(sources[file], { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
      parsed.set(file, ast.program);
      return ast.program;
    } catch (error) {
      failures.push({ code: "parse-error", file, message: String(error.message) });
      parsed.set(file, null);
      return null;
    }
  };
  const resolveExport = (file, symbol, seen = new Set()) => {
    const key = file + ":" + symbol;
    if (seen.has(key)) return null;
    seen.add(key);
    if (file.endsWith(".css")) return symbol === "css" ? file : null;
    const program = parseFile(file);
    if (!program) return null;
    for (const statement of program.body) {
      if (statement.type === "ExportNamedDeclaration" && statement.source) {
        const target = edgeTarget(file, statement.source.value);
        if (!target) continue;
        for (const specifier of statement.specifiers) {
          if (exportedName(specifier) !== symbol) continue;
          const name = specifier.local.name ?? specifier.local.value;
          return resolveExport(target, name, new Set(seen));
        }
      }
      if (statement.type === "ExportNamedDeclaration" && !statement.source) {
        for (const specifier of statement.specifiers) {
          if (exportedName(specifier) !== symbol) continue;
          const local = specifier.local.name ?? specifier.local.value;
          for (const declaration of program.body) {
            if (declaration.type !== "ImportDeclaration") continue;
            const target = edgeTarget(file, declaration.source.value);
            if (!target) continue;
            for (const imported of declaration.specifiers) {
              if (imported.local.name === local) {
                const name = importedName(imported);
                if (name) return resolveExport(target, name, new Set(seen));
              }
            }
          }
        }
      }
    }
    return null;
  };
  const consumers = new Set(group.flatMap(name => ownership[name]?.owners || []));
  if (!consumers.size) failures.push({ code: "no-consumers" });
  for (const consumer of consumers) {
    if (!sources[consumer] || !/\.[jt]sx?$/.test(consumer)) {
      failures.push({ code: "unknown-consumer", consumer });
      continue;
    }
    const program = parseFile(consumer);
    if (!program) continue;
    const imports = new Map();
    for (const statement of program.body) {
      if (statement.type !== "ImportDeclaration") continue;
      const target = edgeTarget(consumer, statement.source.value);
      if (!target) continue;
      for (const specifier of statement.specifiers) {
        const symbol = importedName(specifier);
        if (!symbol) continue;
        const resolved = resolveExport(target, symbol);
        if (resolved) imports.set(specifier.local.name, resolved);
      }
    }
    const registered = new Set();
    const visit = node => {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression" && node.callee?.type === "MemberExpression" &&
        node.callee.computed === false && node.callee.property?.name === "registerStyles" &&
        node.callee.object?.type === "MemberExpression" &&
        node.callee.object.computed === false && node.callee.object.property?.name === "ui" &&
        node.callee.object.object?.name === "ctx") {
        for (const arg of node.arguments) {
          if (arg.type === "Identifier" && imports.has(arg.name)) registered.add(imports.get(arg.name));
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (["loc", "start", "end", "extra", "comments"].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    };
    visit(program);
    for (const filename of group) {
      if (!registered.has(filename)) failures.push({ code: "not-statically-registered", consumer, filename });
    }
  }
  return { safe: failures.length === 0, failures, consumers: [...consumers].sort() };
}
