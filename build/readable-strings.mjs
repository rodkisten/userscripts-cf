import { parse } from "@babel/parser";

// Keep raw CSS/HTML imports readable in the delivered JavaScript as multiline templates.
// Escaping preserves the exact cooked string, including literal backslashes and ${...}.
export function readableStrings(source) {
  const ast = parse(source, { sourceType: "unambiguous" });
  const replacements = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.type === "StringLiteral" && value.value.includes("\n")) {
      const escaped = value.value
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${")
        .replace(/\r/g, "\\r");
      replacements.push({ start: value.start, end: value.end, code: "`" + escaped + "`" });
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (["loc", "start", "end", "extra", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(item)) item.forEach(visit);
      else visit(item);
    }
  }
  visit(ast);
  for (const item of replacements.sort((a, b) => b.start - a.start))
    source = source.slice(0, item.start) + item.code + source.slice(item.end);
  return source;
}
