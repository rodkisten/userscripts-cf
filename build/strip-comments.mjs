import { parse } from "@babel/parser";

// Run before adding the mandatory userscript metadata. Token-aware removal
// preserves URLs, regexes, comment-like strings and automatic semicolon insertion.
export function stripBuildComments(code) {
  const ast = parse(code, { sourceType: "script" });
  for (const comment of (ast.comments || []).sort((a, b) => b.start - a.start)) {
    code =
      code.slice(0, comment.start) +
      code.slice(comment.start, comment.end).replace(/[^\r\n]/g, " ") +
      code.slice(comment.end);
  }
  return code;
}
