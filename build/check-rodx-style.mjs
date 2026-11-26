import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = "src/userscripts/rodx-studio";
const extracted = "src/styles/extracted";
const files = [
  path.join(root, "ui/components.module.css"),
  path.join(root, "ui/search.module.css"),
  path.join(extracted, "userscripts-rodx-studio-lists-view-1.module.css"),
  path.join(extracted, "userscripts-rodx-studio-ui-quick-actions-2.css"),
  path.join(extracted, "userscripts-rodx-studio-media-transport-1.css"),
  path.join(extracted, "userscripts-rodx-studio-ui-quick-actions-1.css"),
];
const findings = [];
for (const file of files.sort()) {
  const ast = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  ast.walkDecls((decl) => {
    // PostCSS parses declarations without validating CSS value grammar.
    // Catch malformed token substitutions before the literal-color audit.
    if (/\bvar\s+\(|[\w-]var\(--/i.test(decl.value)) {
      findings.push({ file, line: decl.source.start.line, key: "invalid token: " + decl.prop + ": " + decl.value });
      return;
    }
    if (decl.prop.startsWith("--")) return;
    const value = decl.value.replace(/var\([^)]*\)/g, "");
    if (
      /#(?:[\da-f]{3,8})\b|\b(?:rgba?|hsla?)\(/i.test(value) ||
      /\bvar\(--[^)]+\)\s+[\da-f]{2}\s*$/i.test(decl.value)
    ) {
      findings.push({ file, line: decl.source.start.line, key: decl.prop + ": " + decl.value });
    }
  });
}
const counts = {};
for (const { file, key } of findings) {
  const id = file + "::" + key;
  counts[id] = (counts[id] || 0) + 1;
}
if (process.argv.includes("--report")) {
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}
const baseline = {};
const seen = {};
const violations = findings.filter(({ file, key }) => {
  const id = file + "::" + key;
  seen[id] = (seen[id] || 0) + 1;
  return seen[id] > (baseline[id] || 0);
});
for (const { file, line, key } of violations) console.error(file + ":" + line + " " + key);
console.log(
  "[rodx-style] " + findings.length + " style findings; " + violations.length + " new violations.",
);
process.exitCode = violations.length ? 1 : 0;
