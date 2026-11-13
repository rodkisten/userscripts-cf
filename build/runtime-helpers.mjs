import ts from "typescript";

// Transform only inside functions that explicitly receive a context argument.
// @keep on the same line or in the immediately preceding comment prevents rewriting.
export function runtimeHelpers() {
  return {
    name: "userscripts-cf:runtime-helpers",
    enforce: "pre",
    transform(code, id) {
      if (!/\.[cm]?[jt]sx?(?:\?.*)?$/.test(id) || /node_modules|\/vendor\//.test(id)) return null;
      const kind = /\.tsx(?:\?|$)/.test(id) ? ts.ScriptKind.TSX : /\.jsx(?:\?|$)/.test(id) ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, kind);
      const edits = [];
      const keep = (node) => {
        const ranges = ts.getLeadingCommentRanges(code, node.getFullStart()) ?? [];
        if (ranges.some((r) => /@keep\b/.test(code.slice(r.pos, r.end)))) return true;
        const start = node.getStart(source);
        const lineStart = code.lastIndexOf("\n", start - 1) + 1;
        return /\/\/[^\n]*@keep\b/.test(code.slice(lineStart, start));
      };
      function walk(node, contextName, blocked = false) {
        if (ts.isFunctionLike(node)) {
          const first = node.parameters?.[0];
          const explicit = first && ts.isIdentifier(first.name) && /^(ctx|context)$/.test(first.name.text);
          const shadowed = node.parameters?.some((p) => ts.isIdentifier(p.name) && p.name.text === contextName);
          const next = explicit ? first.name.text : shadowed ? null : contextName;
          ts.forEachChild(node, (child) => walk(child, next, blocked || keep(node)));
          return;
        }
        if (contextName && !blocked && ts.isCallExpression(node) && !keep(node)) {
          const callee = node.expression;
          let replacement;
          if (ts.isIdentifier(callee) && callee.text === "fetch") replacement = contextName + ".http.fetch";
          if (ts.isPropertyAccessExpression(callee)) {
            const receiver = callee.expression;
            const method = callee.name.text;
            if (ts.isIdentifier(receiver) && /^(document|window)$/.test(receiver.text)) {
              if (method === "querySelector") replacement = contextName + ".dom.querySelector";
              if (method === "querySelectorAll") replacement = contextName + ".dom.querySelectorAll";
              if (method === "fetch" && receiver.text === "window") replacement = contextName + ".http.fetch";
            }
          }
          if (replacement) edits.push({ start: callee.getStart(source), end: callee.end, value: replacement });
        }
        ts.forEachChild(node, (child) => walk(child, contextName, blocked || keep(node)));
      }
      walk(source, null);
      if (!edits.length) return null;
      let output = code;
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
      }
      return { code: output, map: null };
    },
  };
}
