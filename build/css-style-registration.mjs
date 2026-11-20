import { parse } from "@babel/parser";
import { analyzeImportGraph } from "./css-import-graph.mjs";

/**
 * Proves only direct, statically imported CSS bindings passed to ctx.ui.registerStyles.
 * This is intentionally a strict subset, never a claim of runtime execution.
 */
export function verifyStyleRegistration(sources, group, ownership) {
  const graph = analyzeImportGraph(sources);
  const failures = [];
  const consumers = new Set(group.flatMap(name => ownership[name]?.owners || []));
  if (!consumers.size) failures.push({ code: "no-consumers" });
  for (const consumer of consumers) {
    const source = sources[consumer];
    if (!source || !/\.[jt]sx?$/.test(consumer)) {
      failures.push({ code: "unknown-consumer", consumer });
      continue;
    }
    let ast;
    try {
      ast = parse(source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] });
    } catch (error) {
      failures.push({ code: "parse-error", consumer, message: String(error.message) });
      continue;
    }
    const imports = new Map();
    for (const statement of ast.program.body) {
      if (statement.type !== "ImportDeclaration") continue;
      const target = (graph.edges[consumer] || []).find(edge => edge.spec === statement.source.value)?.target;
      if (!target || !target.endsWith(".css")) continue;
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportSpecifier" && specifier.imported.name === "css") imports.set(specifier.local.name, target);
      }
    }
    const registered = new Set();
    const visit = node => {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression" && node.callee?.type === "MemberExpression" &&
          node.callee.property?.name === "registerStyles" &&
          node.callee.object?.type === "MemberExpression" &&
          node.callee.object.property?.name === "ui" &&
          node.callee.object.object?.name === "ctx") {
        for (const arg of node.arguments) {
          if (arg.type === "Identifier" && imports.has(arg.name)) registered.add(imports.get(arg.name));
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "loc" || key === "start" || key === "end" || key === "extra" || key === "comments") continue;
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    };
    visit(ast.program);
    for (const filename of group) {
      if (!registered.has(filename)) failures.push({ code: "not-directly-registered", consumer, filename });
    }
  }
  return { safe: failures.length === 0, failures, consumers: [...consumers].sort() };
}
