import { parse } from "@babel/parser";

/**
 * Collect literal class names referenced by DOM APIs.
 * This is intentionally conservative: unknown dynamic expressions make
 * automatic class renaming unsafe, so consumers should preserve identifiers.
 */
export function analyzeClassReferences(source) {
  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: ["typescript", "jsx"],
    errorRecovery: false,
  });
  const names = new Set();
  const dynamic = [];
  const methodNames = new Set(["add", "remove", "toggle", "contains", "replace"]);
  const selectorNames = new Set(["querySelector", "querySelectorAll", "matches", "closest"]);
  const literal = (node) => {
    if (node?.type === "StringLiteral") return node.value;
    if (node?.type === "TemplateLiteral" && node.expressions.length === 0)
      return node.quasis[0].value.cooked;
    return null;
  };
  const addClasses = (value) => {
    for (const token of value.split(/\s+/).filter(Boolean)) names.add(token);
  };
  const addSelector = (value) => {
    // Ignore escaped CSS selectors: they require full selector parsing.
    if (value.includes("\\")) return dynamic.push("escaped selector");
    for (const match of value.matchAll(/\.([a-zA-Z_][\w-]*)/g)) names.add(match[1]);
  };
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
      const callee = node.callee;
      const method = callee?.type === "MemberExpression" || callee?.type === "OptionalMemberExpression"
        ? callee.computed ? literal(callee.property) : callee.property?.name
        : null;
      const object = callee?.object;
      const classList = object?.type === "MemberExpression" || object?.type === "OptionalMemberExpression"
        ? (object.computed ? literal(object.property) : object.property?.name) === "classList"
        : false;
      if (classList && methodNames.has(method)) {
        for (const argument of node.arguments) {
          const value = literal(argument);
          if (value === null) dynamic.push(method);
          else addClasses(value);
        }
      } else if (selectorNames.has(method)) {
        const value = literal(node.arguments[0]);
        if (value === null) dynamic.push(method);
        else addSelector(value);
      } else if (method === "getElementsByClassName") {
        const value = literal(node.arguments[0]);
        if (value === null) dynamic.push(method);
        else addClasses(value);
      } else if (method === "setAttribute" && literal(node.arguments[0]) === "class") {
        const value = literal(node.arguments[1]);
        if (value === null) dynamic.push(method);
        else addClasses(value);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  };
  walk(ast.program);
  return { classes: [...names].sort(), dynamic };
}
