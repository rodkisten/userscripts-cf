import ts from "typescript";
import { transformRodAst } from "./rod-ast.mjs";

const parse = (code, id) => ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const print = (node, source) => ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printNode(ts.EmitHint.Unspecified, node, source);

/**
 * Converts a standalone, immediately invoked userscript into the native
 * export-default module contract. Unsafe or ambiguous inputs are not modified.
 * Metadata is returned separately so the caller can update userscripts.config.js.
 */
export function migrateUserscriptIife(code, id = "userscript.js") {
  const source = parse(code, id);
  const diagnostics = [];
  const metadata = {};
  const header = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (header) {
    for (const line of header[1].split(/\r?\n/)) {
      const match = line.match(/^\s*\/\/\s*@([\w-]+)\s+(.+?)\s*$/);
      if (!match) continue;
      (metadata[match[1]] ??= []).push(match[2]);
    }
  }
  if (source.parseDiagnostics.length) {
    return { code, changed: false, metadata, diagnostics: ["Source failed JavaScript parsing"] };
  }
  const statements = source.statements.filter((statement) => {
    if (!ts.isExpressionStatement(statement)) return true;
    return !ts.isStringLiteral(statement.expression) || statement.expression.text !== "use strict";
  });
  if (statements.length !== 1 || !ts.isExpressionStatement(statements[0])) {
    return { code, changed: false, metadata, diagnostics: ["Expected one top-level IIFE; review additional statements manually"] };
  }
  const statement = statements[0];
  let expression = statement.expression;
  if (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (!ts.isCallExpression(expression) || expression.arguments.length) {
    return { code, changed: false, metadata, diagnostics: ["Expected a zero-argument IIFE"] };
  }
  let callee = expression.expression;
  while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
  if (!ts.isFunctionExpression(callee) && !ts.isArrowFunction(callee)) {
    return { code, changed: false, metadata, diagnostics: ["Unsupported IIFE callee"] };
  }
  if (callee.parameters.length || !ts.isBlock(callee.body)) {
    return { code, changed: false, metadata, diagnostics: ["Parameterized or expression-bodied IIFE requires manual review"] };
  }
  const body = callee.body.statements.filter((node) =>
    !ts.isExpressionStatement(node) || !ts.isStringLiteral(node.expression) || node.expression.text !== "use strict",
  );
  if (body.some((node) => ts.isReturnStatement(node) || ts.isExportDeclaration(node))) {
    return { code, changed: false, metadata, diagnostics: ["Top-level return/export requires manual review"] };
  }
  if (body.some((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "eval")) {
    return { code, changed: false, metadata, diagnostics: ["Dynamic eval requires manual review"] };
  }
  // Preserve lexical declarations, comments and JSX-free source verbatim.
  const bodyStart = callee.body.getStart(source) + 1;
  const bodyEnd = callee.body.end - 1;
  let inner = code.slice(bodyStart, bodyEnd).trim();
  inner = inner.replace(/^(['"])use strict\1;?\s*/, "");
  const output = `export default {
  init(ctx) {
${inner.split("\n").map((line) => "    " + line).join("\n")}
  },
};
`;
  const transformed = transformRodAst(output, id);
  return {
    code: transformed.code,
    changed: transformed.code !== code,
    metadata,
    diagnostics: [...diagnostics, ...transformed.diagnostics],
  };
}
