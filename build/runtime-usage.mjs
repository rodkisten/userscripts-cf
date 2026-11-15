import ts from "typescript";

/**
 * Find static ctx feature accesses. Dynamic access is deliberately conservative:
 * callers must include all features when the key cannot be resolved.
 */
export function analyzeRuntimeUsage(source, filename = "entry.ts") {
  const kind = /\\.tsx$/.test(filename) ? ts.ScriptKind.TSX : /\\.jsx$/.test(filename) ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind);
  const features = new Set();
  let dynamic = false;
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "ctx") {
      features.add(node.name.text);
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "ctx") {
      if (node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) {
        features.add(node.argumentExpression.text);
      } else {
        dynamic = true;
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === "ctx" && ts.isObjectBindingPattern(node.name)) {
      for (const element of node.name.elements) {
        const key = element.propertyName || element.name;
        if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) features.add(key.text);
        else dynamic = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { features: [...features].sort(), dynamic };
}
