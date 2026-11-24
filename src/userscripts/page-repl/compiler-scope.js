const reservedFields = new Set(["type", "start", "end", "loc", "range"]);

function forEachChild(node, callback) {
  for (const [key, value] of Object.entries(node)) {
    if (reservedFields.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && typeof child.type === "string") {
          callback(child, key);
        }
      }
      continue;
    }
    if (value && typeof value === "object" && typeof value.type === "string") {
      callback(value, key);
    }
  }
}

function createScope(parent, type) {
  return { parent, type, bindings: new Set() };
}

function nearestVarScope(scope) {
  let current = scope;
  while (current.parent && current.type !== "function" && current.type !== "program") {
    current = current.parent;
  }
  return current;
}

function collectPatternIdentifiers(pattern, callback) {
  if (!pattern || typeof pattern !== "object") {
    return;
  }
  switch (pattern.type) {
    case "Identifier":
      callback(pattern);
      return;
    case "RestElement":
      collectPatternIdentifiers(pattern.argument, callback);
      return;
    case "AssignmentPattern":
      collectPatternIdentifiers(pattern.left, callback);
      return;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        collectPatternIdentifiers(element, callback);
      }
      return;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          collectPatternIdentifiers(property.argument, callback);
        } else {
          collectPatternIdentifiers(property.value, callback);
        }
      }
      return;
    default:
      return;
  }
}

function isFunction(node) {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

function isNonReferenceIdentifier(node, parent, key) {
  if (!parent) {
    return false;
  }
  if (
    (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
    key === "property" &&
    !parent.computed
  ) {
    return true;
  }
  if (
    ["Property", "PropertyDefinition", "MethodDefinition"].includes(parent.type) &&
    key === "key" &&
    !parent.computed
  ) {
    return true;
  }
  if (parent.type === "LabeledStatement" && key === "label") {
    return true;
  }
  if ((parent.type === "BreakStatement" || parent.type === "ContinueStatement") && key === "label") {
    return true;
  }
  if (parent.type === "MetaProperty") {
    return true;
  }
  if (
    [
      "ImportSpecifier",
      "ImportDefaultSpecifier",
      "ImportNamespaceSpecifier",
      "ExportSpecifier",
    ].includes(parent.type)
  ) {
    return true;
  }
  return false;
}

function resolveBinding(scope, name) {
  let current = scope;
  while (current) {
    if (current.bindings.has(name)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Resolve only the binding semantics the REPL compiler needs.
 *
 * The editor already ships a full JavaScript parser. Until the compiler can
 * reuse that parser too, keeping this resolver deliberately small avoids
 * bundling the generic eslint-scope + estraverse stack solely to identify
 * persistent top-level bindings and local shadowing.
 */
export function analyzePersistentBindings(ast, knownNames = []) {
  const globalScope = createScope(null, "program");
  const nodeScopes = new WeakMap();
  const declarationIdentifiers = new WeakSet();
  const globalDefinitions = new Set();
  const variableDeclarations = new Set();
  const names = new Set();

  const declarePattern = (pattern, scope, declaration, persistent) => {
    collectPatternIdentifiers(pattern, (identifier) => {
      declarationIdentifiers.add(identifier);
      nodeScopes.set(identifier, scope);
      scope.bindings.add(identifier.name);
      if (persistent) {
        names.add(identifier.name);
        globalDefinitions.add(identifier);
        if (declaration?.type === "VariableDeclaration") {
          variableDeclarations.add(declaration);
        }
      }
    });
  };

  function collect(node, scope, parent = null, key = "", reuseBlockScope = false) {
    if (!node || typeof node !== "object") {
      return;
    }
    nodeScopes.set(node, scope);

    if (node.type === "Program") {
      for (const statement of node.body) {
        collect(statement, scope, node, "body");
      }
      return;
    }

    if (node.type === "BlockStatement") {
      const blockScope = reuseBlockScope ? scope : createScope(scope, "block");
      for (const statement of node.body) {
        collect(statement, blockScope, node, "body");
      }
      return;
    }

    if (node.type === "VariableDeclaration") {
      const targetScope = node.kind === "var" ? nearestVarScope(scope) : scope;
      const persistent = targetScope === globalScope;
      for (const declaration of node.declarations) {
        declarePattern(declaration.id, targetScope, node, persistent);
      }
      forEachChild(node, (child, childKey) => collect(child, scope, node, childKey));
      return;
    }

    if (isFunction(node)) {
      if (node.type === "FunctionDeclaration" && node.id) {
        declarationIdentifiers.add(node.id);
        nodeScopes.set(node.id, scope);
        scope.bindings.add(node.id.name);
        if (scope === globalScope) {
          names.add(node.id.name);
          globalDefinitions.add(node.id);
        }
      }

      const functionScope = createScope(scope, "function");
      if (node.type !== "ArrowFunctionExpression") {
        functionScope.bindings.add("arguments");
      }
      if (node.type === "FunctionExpression" && node.id) {
        declarationIdentifiers.add(node.id);
        nodeScopes.set(node.id, functionScope);
        functionScope.bindings.add(node.id.name);
      }
      for (const parameter of node.params) {
        declarePattern(parameter, functionScope, null, false);
        collect(parameter, functionScope, node, "params");
      }
      if (node.body?.type === "BlockStatement") {
        collect(node.body, functionScope, node, "body", true);
      } else {
        collect(node.body, functionScope, node, "body");
      }
      return;
    }

    if (
      node.type === "ForStatement" ||
      node.type === "ForInStatement" ||
      node.type === "ForOfStatement"
    ) {
      const declaration = node.type === "ForStatement" ? node.init : node.left;
      const loopScope =
        declaration?.type === "VariableDeclaration" && declaration.kind !== "var"
          ? createScope(scope, "block")
          : scope;
      if (node.type === "ForStatement") {
        collect(node.init, loopScope, node, "init");
        collect(node.test, loopScope, node, "test");
        collect(node.update, loopScope, node, "update");
      } else {
        collect(node.left, loopScope, node, "left");
        collect(node.right, loopScope, node, "right");
      }
      collect(node.body, loopScope, node, "body");
      return;
    }

    if (node.type === "CatchClause") {
      const catchScope = createScope(scope, "block");
      if (node.param) {
        declarePattern(node.param, catchScope, null, false);
        collect(node.param, catchScope, node, "param");
      }
      collect(node.body, catchScope, node, "body", true);
      return;
    }

    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
      if (node.type === "ClassDeclaration" && node.id) {
        declarationIdentifiers.add(node.id);
        nodeScopes.set(node.id, scope);
        scope.bindings.add(node.id.name);
        if (scope === globalScope) {
          names.add(node.id.name);
          globalDefinitions.add(node.id);
        }
      }
      if (node.superClass) {
        collect(node.superClass, scope, node, "superClass");
      }
      const classScope = createScope(scope, "class");
      if (node.id) {
        classScope.bindings.add(node.id.name);
      }
      collect(node.body, classScope, node, "body");
      return;
    }

    forEachChild(node, (child, childKey) => collect(child, scope, node, childKey));
  }

  collect(ast, globalScope);

  const known = new Set(knownNames);
  const references = new Map();

  function resolveReferences(node, parent = null, key = "") {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "Identifier" && !declarationIdentifiers.has(node)) {
      if (!isNonReferenceIdentifier(node, parent, key)) {
        const scope = nodeScopes.get(node) ?? globalScope;
        const binding = resolveBinding(scope, node.name);
        if (binding === globalScope && names.has(node.name)) {
          references.set(node, node.name);
        } else if (!binding && known.has(node.name)) {
          references.set(node, node.name);
        }
      }
      return;
    }
    forEachChild(node, (child, childKey) => resolveReferences(child, node, childKey));
  }

  resolveReferences(ast);

  return {
    names,
    globalDefinitions,
    variableDeclarations,
    references,
  };
}
