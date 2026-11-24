const patternTypes = new Set(["VariableDefinition", "ArrayPattern", "ObjectPattern"]);
const functionTypes = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration"]);

function children(node) {
  const result = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    result.push(child);
  }
  return result;
}

function child(node, name) {
  return children(node).find((item) => item.name === name) ?? null;
}

function nodeText(source, node) {
  return source.slice(node.from, node.to);
}

function createScope(parent, type) {
  return { parent, type };
}

function nearestVarScope(scope) {
  let current = scope;
  while (current.parent && current.type !== "function" && current.type !== "program") {
    current = current.parent;
  }
  return current;
}

function variableKind(source, node) {
  const token = children(node).find((item) =>
    ["var", "let", "const", "using"].includes(item.name),
  );
  if (token) {
    return token.name;
  }
  const match = nodeText(source, node).match(/^\s*(?:await\s+)?(var|let|const|using)\b/);
  return match?.[1] ?? null;
}

function directPatterns(node) {
  return children(node).filter((item) => patternTypes.has(item.name));
}

function collectPatternNames(source, node, names) {
  if (node.name === "VariableDefinition") {
    names.add(nodeText(source, node));
    return;
  }

  if (node.name === "PatternProperty") {
    const nested = children(node).filter((item) => patternTypes.has(item.name));
    if (nested.length) {
      for (const item of nested) {
        collectPatternNames(source, item, names);
      }
      return;
    }
    const shorthand = child(node, "PropertyName");
    if (shorthand) {
      names.add(nodeText(source, shorthand));
    }
    return;
  }

  for (const item of children(node)) {
    if (patternTypes.has(item.name) || item.name === "PatternProperty") {
      collectPatternNames(source, item, names);
    }
  }
}

function isFunctionLike(node) {
  if (functionTypes.has(node.name)) {
    return true;
  }
  if (node.name !== "Property") {
    return false;
  }
  const parts = children(node);
  return parts.some((item) => item.name === "ParamList") && parts.some((item) => item.name === "Block");
}

function loopHasLexicalBinding(source, node) {
  const spec = children(node).find((item) =>
    ["ForSpec", "ForInSpec", "ForOfSpec"].includes(item.name),
  );
  if (!spec) {
    return false;
  }
  const declaration = child(spec, "VariableDeclaration");
  const kind = declaration ? variableKind(source, declaration) : variableKind(source, spec);
  return kind === "let" || kind === "const" || kind === "using";
}

function findFirstError(node) {
  if (node.type.isError) {
    return node;
  }
  for (const item of children(node)) {
    const error = findFirstError(item);
    if (error) {
      return error;
    }
  }
  return null;
}

function expressionChild(statement) {
  return children(statement).find((item) => item.name !== ";") ?? null;
}

function buildVariableExpression(source, node) {
  const parts = children(node);
  const patterns = parts.filter((item) => patternTypes.has(item.name));
  const expressions = [];

  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index];
    const boundary = patterns[index + 1]?.from ?? node.to;
    const equals = parts.find(
      (item) => item.name === "Equals" && item.from >= pattern.to && item.to <= boundary,
    );
    const left = nodeText(source, pattern);

    if (!equals) {
      expressions.push(`${left} = undefined`);
      continue;
    }

    let right = source.slice(equals.to, boundary);
    right = right.replace(/[,;]\s*$/, "").trim();
    expressions.push(`${left} = ${right || "undefined"}`);
  }

  return expressions.join(", ");
}

function applyEdits(source, edits) {
  const ordered = [...edits].sort((a, b) => b.from - a.from || b.to - a.to);
  let cursor = source.length;
  let output = "";

  for (const edit of ordered) {
    if (edit.to > cursor) {
      throw new Error("Overlapping REPL compiler edits");
    }
    output = source.slice(edit.to, cursor) + output;
    output = edit.text + output;
    cursor = edit.from;
  }

  return source.slice(0, cursor) + output;
}

/**
 * Analyze only declarations that must survive between REPL evaluations.
 *
 * Identifier resolution is intentionally left to the JavaScript engine. The
 * generated with/Proxy scope exposes only persistent names, so native lexical
 * scoping continues to handle closures, parameters and local shadowing.
 */
export function analyzePersistentDeclarations(source, tree) {
  const globalScope = createScope(null, "program");
  const names = new Set();
  const variableDeclarations = [];
  const forBindings = [];
  const declarations = [];

  function registerPatterns(node, scope, parentName) {
    const kind = variableKind(source, node);
    const targetScope = kind === "var" ? nearestVarScope(scope) : scope;
    if (targetScope !== globalScope) {
      return;
    }
    const declarationNames = new Set();
    for (const pattern of directPatterns(node)) {
      collectPatternNames(source, pattern, declarationNames);
    }
    for (const name of declarationNames) {
      names.add(name);
    }
    variableDeclarations.push({ node, parentName, names: declarationNames });
  }

  function registerForBinding(node, scope) {
    const kind = variableKind(source, node);
    if (kind !== "var" || nearestVarScope(scope) !== globalScope) {
      return;
    }
    const declarationNames = new Set();
    for (const pattern of directPatterns(node)) {
      collectPatternNames(source, pattern, declarationNames);
    }
    if (!declarationNames.size) {
      return;
    }
    for (const name of declarationNames) {
      names.add(name);
    }
    const keyword = children(node).find((item) => item.name === "var");
    if (keyword) {
      forBindings.push({ keyword, names: declarationNames });
    }
  }

  function walk(node, scope, parent = null) {
    if (node.name === "Script") {
      for (const item of children(node)) {
        walk(item, scope, node);
      }
      return;
    }

    if (node.name === "ForStatement") {
      const loopScope = loopHasLexicalBinding(source, node) ? createScope(scope, "block") : scope;
      for (const item of children(node)) {
        walk(item, loopScope, node);
      }
      return;
    }

    if (node.name === "FunctionDeclaration") {
      const nameNode = child(node, "VariableDefinition");
      if (nameNode && scope === globalScope) {
        const name = nodeText(source, nameNode);
        names.add(name);
        declarations.push({
          kind: "function",
          node,
          name,
          hoisted: parent?.name === "Script",
        });
      }
      const functionScope = createScope(scope, "function");
      for (const item of children(node)) {
        walk(item, functionScope, node);
      }
      return;
    }

    if (node.name === "ClassDeclaration") {
      const nameNode = child(node, "VariableDefinition");
      if (nameNode && scope === globalScope) {
        const name = nodeText(source, nameNode);
        names.add(name);
        declarations.push({ kind: "class", node, name, hoisted: false });
      }
      const classScope = createScope(scope, "block");
      for (const item of children(node)) {
        walk(item, classScope, node);
      }
      return;
    }

    if (node.name === "ClassExpression") {
      const classScope = createScope(scope, "block");
      for (const item of children(node)) {
        walk(item, classScope, node);
      }
      return;
    }

    if (node.name === "StaticBlock") {
      const staticScope = createScope(scope, "function");
      for (const item of children(node)) {
        walk(item, staticScope, node);
      }
      return;
    }

    if (isFunctionLike(node)) {
      const functionScope = createScope(scope, "function");
      for (const item of children(node)) {
        walk(item, functionScope, node);
      }
      return;
    }

    if (node.name === "Block" || node.name === "SwitchBody" || node.name === "CatchClause") {
      const blockScope = createScope(scope, "block");
      for (const item of children(node)) {
        walk(item, blockScope, node);
      }
      return;
    }

    if (node.name === "VariableDeclaration") {
      registerPatterns(node, scope, parent?.name ?? "");
      for (const item of children(node)) {
        walk(item, scope, node);
      }
      return;
    }

    if (node.name === "ForInSpec" || node.name === "ForOfSpec") {
      registerForBinding(node, scope);
    }

    for (const item of children(node)) {
      walk(item, scope, node);
    }
  }

  walk(tree.topNode, globalScope);

  return {
    names,
    variableDeclarations,
    forBindings,
    declarations,
  };
}

/**
 * Compile the parsed Lezer tree into a REPL function body.
 */
export function emitLezerProgram(source, tree, analysis, { persist = true, knownNames = [] } = {}) {
  const edits = [];
  const hoisted = [];

  if (persist) {
    for (const entry of analysis.variableDeclarations) {
      const expression = buildVariableExpression(source, entry.node);
      const inForInit = entry.parentName === "ForSpec";
      edits.push({
        from: entry.node.from,
        to: entry.node.to,
        text: inForInit ? `${expression};` : `(${expression});`,
      });
    }

    for (const entry of analysis.forBindings) {
      edits.push({ from: entry.keyword.from, to: entry.keyword.to, text: "" });
    }

    for (const entry of analysis.declarations) {
      const original = nodeText(source, entry.node);
      const replacement = `${entry.name} = ${original};`;
      if (entry.kind === "function" && entry.hoisted) {
        hoisted.push(replacement);
        edits.push({ from: entry.node.from, to: entry.node.to, text: "" });
      } else {
        edits.push({ from: entry.node.from, to: entry.node.to, text: replacement });
      }
    }
  }

  const topLevel = children(tree.topNode);
  const last = topLevel.at(-1);
  if (last?.name === "ExpressionStatement") {
    const expression = expressionChild(last);
    if (expression) {
      edits.push({
        from: last.from,
        to: last.to,
        text: `return ${nodeText(source, expression)};`,
      });
    }
  }

  const transformed = applyEdits(source, edits);
  if (!persist) {
    return transformed;
  }

  const visibleNames = [...new Set([...knownNames, ...analysis.names])]
    .filter((name) => typeof name === "string")
    .sort();
  const scopeNames = JSON.stringify(visibleNames);

  return [
    `const __rodReplNames = new Set(${scopeNames});`,
    "const __rodReplScope = new Proxy(ctx.vars, {",
    "  has(_target, key) { return typeof key === \"string\" && __rodReplNames.has(key); },",
    "});",
    "with (__rodReplScope) {",
    ...hoisted,
    transformed,
    "}",
  ].join("\n");
}

export function assertLezerSyntax(source, tree) {
  const error = findFirstError(tree.topNode);
  if (!error) {
    return;
  }
  const near = source.slice(Math.max(0, error.from - 20), Math.min(source.length, error.to + 20));
  const problem = new SyntaxError(`Sintaxe inválida perto de: ${near || "<fim>"}`);
  problem.pos = error.from;
  throw problem;
}
