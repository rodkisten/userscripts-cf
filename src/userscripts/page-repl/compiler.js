import { parse } from "acorn";
import { analyze } from "eslint-scope";
import { generate } from "astring";

const reserved = new Set(["ctx", "console", "$", "$$", "$0", "_"]);
const member = (name) => ({
  type: "MemberExpression",
  computed: true,
  optional: false,
  object: {
    type: "MemberExpression",
    computed: false,
    optional: false,
    object: { type: "Identifier", name: "ctx" },
    property: { type: "Identifier", name: "vars" },
  },
  property: { type: "Literal", value: name },
});

export function compile(source, { persist = true, knownNames = [] } = {}) {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    ranges: true,
  });
  const scope = analyze(ast, {
    ecmaVersion: 2025,
    sourceType: "script",
    optimistic: true,
    ignoreEval: true,
  }).globalScope;
  const names = new Set();
  const replacements = new WeakMap();
  const declarations = new WeakSet();
  if (persist) {
    for (const variable of scope.variables) {
      if (reserved.has(variable.name)) throw Error(`Nome reservado do REPL: ${variable.name}`);
      names.add(variable.name);
      for (const definition of variable.defs) {
        if (definition.type === "Variable") declarations.add(definition.parent);
        if (definition.name) replacements.set(definition.name, member(variable.name));
      }
      for (const reference of variable.references)
        replacements.set(reference.identifier, member(variable.name));
    }
    for (const reference of scope.through)
      if (knownNames.includes(reference.identifier.name) && !reserved.has(reference.identifier.name))
        replacements.set(reference.identifier, member(reference.identifier.name));
  }
  function rewrite(node) {
    if (!node || typeof node !== "object") return node;
    if (replacements.has(node)) return replacements.get(node);
    for (const [key, value] of Object.entries(node)) {
      if (["range", "loc", "start", "end"].includes(key)) continue;
      if (Array.isArray(value)) node[key] = value.map(rewrite);
      else if (value && typeof value === "object") node[key] = rewrite(value);
    }
    if (node.type === "Property" && node.shorthand && node.value.type !== "Identifier")
      node.shorthand = false;
    return node;
  }
  // Rewrite declarations into mutable session properties. Local function bindings remain lexical.
  function transform(node, parentKey) {
    if (!node || typeof node !== "object") return node;
    if (persist && node.type === "VariableDeclaration" && declarations.has(node)) {
      const expressions = node.declarations.map((declaration) => ({
        type: "AssignmentExpression",
        operator: "=",
        left: rewrite(declaration.id),
        right: rewrite(declaration.init || { type: "Identifier", name: "undefined" }),
      }));
      const expression =
        expressions.length === 1 ? expressions[0] : { type: "SequenceExpression", expressions };
      if (parentKey === "left") return expression.left;
      return parentKey === "init" ? expression : { type: "ExpressionStatement", expression };
    }
    if (
      persist &&
      ["FunctionDeclaration", "ClassDeclaration"].includes(node.type) &&
      names.has(node.id?.name) &&
      replacements.has(node.id)
    ) {
      const name = node.id.name;
      const expression = {
        ...node,
        type: node.type.replace("Declaration", "Expression"),
        id: { type: "Identifier", name },
      };
      expression.body = transform(expression.body, "body");
      return {
        type: "ExpressionStatement",
        expression: { type: "AssignmentExpression", operator: "=", left: member(name), right: expression },
        replHoisted: node.type === "FunctionDeclaration",
      };
    }
    for (const [key, value] of Object.entries(node)) {
      if (["range", "loc", "start", "end"].includes(key)) continue;
      if (Array.isArray(value)) node[key] = value.map((item) => transform(item, key));
      else if (value && typeof value === "object") node[key] = transform(value, key);
    }
    if (replacements.has(node)) return replacements.get(node);
    if (node.type === "Property" && node.shorthand && node.value.type !== "Identifier")
      node.shorthand = false;
    return node;
  }
  transform(ast, "program");
  const hoisted = ast.body.filter((node) => node.replHoisted);
  ast.body = hoisted.concat(ast.body.filter((node) => !node.replHoisted));
  const last = ast.body.at(-1);
  if (last?.type === "ExpressionStatement" && !last.replHoisted)
    ast.body[ast.body.length - 1] = { type: "ReturnStatement", argument: last.expression };
  return { code: generate(ast), names: [...names] };
}
