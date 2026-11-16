import ts from "typescript";

/** Find runtime features without mistaking comments and string literals for code.
 * Unknown computed keys and escaping the context require the complete runtime.
 */
export function analyzeRuntimeUsage(source, filename = "entry.ts") {
  const kind = /\.tsx$/.test(filename)
    ? ts.ScriptKind.TSX
    : /\.jsx$/.test(filename)
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind);
  const features = new Set();
  let dynamic = false;
  // Follow aliases, including transitive aliases, before analyzing accesses.
  const aliases = new Set(["ctx"]);
  let changed = true;
  while (changed) {
    changed = false;
    const discover = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        aliases.has(node.initializer.text) &&
        !aliases.has(node.name.text)
      ) {
        aliases.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, discover);
    };
    discover(file);
  }
  const isContext = (node) => ts.isIdentifier(node) && aliases.has(node.text);
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && isContext(node.expression)) features.add(node.name.text);
    if (ts.isElementAccessExpression(node) && isContext(node.expression)) {
      if (
        node.argumentExpression &&
        (ts.isStringLiteralLike(node.argumentExpression) ||
          ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
      )
        features.add(node.argumentExpression.text);
      else dynamic = true;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isContext(node.initializer) &&
      ts.isObjectBindingPattern(node.name)
    ) {
      for (const element of node.name.elements) {
        if (element.dotDotDotToken) {
          dynamic = true;
          continue;
        }
        const key = element.propertyName || element.name;
        if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) features.add(key.text);
        else dynamic = true;
      }
    }
    // Spreading or enumerating ctx can expose any feature. Preserve them all.
    if (ts.isSpreadAssignment(node) && isContext(node.expression)) dynamic = true;
    if (ts.isSpreadElement(node) && isContext(node.expression)) dynamic = true;
    if (ts.isForInStatement(node) && isContext(node.expression)) dynamic = true;
    if (ts.isForOfStatement(node) && isContext(node.expression)) dynamic = true;
    if (ts.isCallExpression(node) && node.arguments.some(isContext)) dynamic = true;
    if (ts.isReturnStatement(node) && node.expression && isContext(node.expression)) dynamic = true;
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { features: [...features].sort(), dynamic };
}
