import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";

const fix = process.argv.includes("--fix");
const targets = ["src/userscripts/instagram-saved/index.tsx", "src/userscripts/instagram-saved/core.ts"];
let errors = 0;

for (const filename of targets) {
  const absolute = path.resolve(filename);
  let content = await fs.readFile(absolute, "utf8");
  // TypeScript 7 no longer ships the old compiler API. Babel parses both TS
  // and TSX here; type checking remains the responsibility of `tsc`.
  const source = parse(content, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const edits = [];

  function add(start, end, replacement, message) {
    edits.push({ start, end, replacement, message });
  }

  function braces(body, label) {
    if (body && body.type !== "BlockStatement") {
      add(body.start, body.end, `{\n${content.slice(body.start, body.end)}\n}`, `${label} requires braces`);
    }
  }

  function visit(node, parent) {
    if (!node || typeof node !== "object") return;
    if (node.type === "IfStatement") {
      braces(node.consequent, "if");
      if (node.alternate && node.alternate.type !== "IfStatement") {
        braces(node.alternate, "else");
      }
    } else if (
      ["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"].includes(
        node.type,
      )
    ) {
      braces(node.body, node.type);
    }

    const multiline = node.loc?.start.line < node.loc?.end.line;
    const declaration = [
      "TSTypeAliasDeclaration",
      "TSInterfaceDeclaration",
      "FunctionDeclaration",
      "ClassDeclaration",
    ].includes(node.type);
    const control = [
      "IfStatement",
      "ForStatement",
      "ForInStatement",
      "ForOfStatement",
      "WhileStatement",
      "DoWhileStatement",
      "SwitchStatement",
      "TryStatement",
    ].includes(node.type);

    if (multiline && (declaration || control) && parent?.type === "Program") {
      const end = node.end;
      const remaining = content.slice(end);
      if (/^\r?\n[^\r\n\s]/.test(remaining) || /^\r?\n[ \t]+\S/.test(remaining)) {
        add(end, end, "\n", "blank line required after multiline declaration or control block");
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "comments"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else if (value?.type) visit(value, node);
    }
  }

  visit(source);
  errors += edits.length;
  if (fix && edits.length) {
    for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
      content = content.slice(0, edit.start) + edit.replacement + content.slice(edit.end);
    }
    await fs.writeFile(absolute, content);
  }
  if (edits.length) {
    console.log(`${filename}: ${edits.length} style issue(s)${fix ? " fixed" : ""}`);
  }
}

if (errors && !fix) {
  process.exitCode = 1;
} else {
  console.log("Style check complete.");
}
