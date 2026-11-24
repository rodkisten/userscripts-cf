const metadataKeys = new Set(["type", "start", "end", "loc", "range"]);

function member(name) {
  return `ctx.vars[${JSON.stringify(name)}]`;
}

function childNodes(node) {
  const seen = new Set();
  const children = [];
  for (const [key, value] of Object.entries(node)) {
    if (metadataKeys.has(key)) {
      continue;
    }
    const push = (child) => {
      if (!child || typeof child !== "object" || typeof child.type !== "string" || seen.has(child)) {
        return;
      }
      seen.add(child);
      children.push({ node: child, key });
    };
    if (Array.isArray(value)) {
      for (const child of value) {
        push(child);
      }
    } else {
      push(value);
    }
  }
  return children.sort((a, b) => a.node.start - b.node.start || b.node.end - a.node.end);
}

/**
 * Emit the REPL program from Acorn ranges.
 *
 * The original source remains authoritative. We patch only persistent bindings
 * and wrapper syntax, avoiding a second full ESTree code generator in the
 * browser bundle.
 */
export function emitPersistentProgram(source, ast, analysis, { persist = true } = {}) {
  const names = new Set(analysis?.names ?? []);
  const definitions = analysis?.globalDefinitions ?? new Set();
  const declarations = analysis?.variableDeclarations ?? new Set();
  const references = analysis?.references ?? new Map();

  function isPersistentDefinition(node) {
    return persist && definitions.has(node);
  }

  function renderOriginal(node, skip = new Set()) {
    let cursor = node.start;
    let output = "";
    for (const child of childNodes(node)) {
      if (child.node.start < cursor || child.node.end > node.end) {
        continue;
      }
      output += source.slice(cursor, child.node.start);
      output += skip.has(child.node)
        ? source.slice(child.node.start, child.node.end)
        : render(child.node, child.key);
      cursor = child.node.end;
    }
    output += source.slice(cursor, node.end);
    return output;
  }

  function renderProperty(node) {
    if (!node.shorthand) {
      return renderOriginal(node);
    }
    const key = source.slice(node.key.start, node.key.end);
    const value = render(node.value, "value");
    return value === source.slice(node.value.start, node.value.end)
      ? renderOriginal(node)
      : `${key}: ${value}`;
  }

  function renderVariableDeclaration(node, parentKey) {
    const assignments = node.declarations.map((declaration) => {
      const left = render(declaration.id, "id");
      const right = declaration.init ? render(declaration.init, "init") : "undefined";
      return { left, expression: `${left} = ${right}` };
    });

    if (parentKey === "left") {
      return assignments[0]?.left ?? "";
    }

    const expression = assignments.map((item) => item.expression).join(", ");
    if (parentKey === "init") {
      return expression;
    }
    return `${expression};`;
  }

  function renderPersistentDeclaration(node) {
    const name = node.id.name;
    const declaration = renderOriginal(node, new Set([node.id]));
    return `${member(name)} = ${declaration};`;
  }

  function render(node, parentKey = "") {
    if (!node || typeof node !== "object") {
      return "";
    }

    if (persist && references.has(node)) {
      return member(references.get(node));
    }

    if (persist && node.type === "VariableDeclaration" && declarations.has(node)) {
      return renderVariableDeclaration(node, parentKey);
    }

    if (
      persist &&
      (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") &&
      node.id &&
      names.has(node.id.name) &&
      isPersistentDefinition(node.id)
    ) {
      return renderPersistentDeclaration(node);
    }

    if (persist && node.type === "Identifier" && isPersistentDefinition(node)) {
      return member(node.name);
    }

    if (node.type === "Property" && node.shorthand) {
      return renderProperty(node);
    }

    return renderOriginal(node);
  }

  const hoisted = [];
  const body = [];
  const statements = ast.body ?? [];

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    const persistentFunction =
      persist &&
      statement.type === "FunctionDeclaration" &&
      statement.id &&
      names.has(statement.id.name) &&
      isPersistentDefinition(statement.id);

    if (persistentFunction) {
      hoisted.push(renderPersistentDeclaration(statement));
      continue;
    }

    const isLast = index === statements.length - 1;
    if (isLast && statement.type === "ExpressionStatement") {
      body.push(`return ${render(statement.expression, "expression")};`);
      continue;
    }

    body.push(render(statement, "body"));
  }

  return [...hoisted, ...body].filter(Boolean).join("\n");
}
