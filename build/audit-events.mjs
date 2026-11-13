import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";

const root = path.resolve("src");
const results = [];
async function scan(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const source = await fs.readFile(file, "utf8");
    let ast;
    try { ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true }); }
    catch { continue; }
    const found = new Map();
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
        const method = node.callee.property?.name;
        const owner = node.callee.object?.name;
        if ((method === "addEventListener" || method === "on") && node.arguments?.[0]?.type === "StringLiteral") {
          const name = node.arguments[0].value;
          const key = owner + "." + method + ":" + name;
          const locations = found.get(key) || [];
          locations.push(node.loc?.start.line);
          found.set(key, locations);
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "loc" || key === "tokens" || key === "comments") continue;
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    };
    visit(ast.program);
    for (const [key, lines] of found) if (lines.length > 1)
      results.push({ file: path.relative(process.cwd(), file), signature: key, lines, note: "Review: repeated event names can be intentional" });
  }
}
await scan(root);
await fs.mkdir("dist", { recursive: true });
await fs.writeFile("dist/event-audit.json", JSON.stringify({ schema: 1, potentialDuplicates: results }, null, 2) + "\n");
console.log(`Event audit: ${results.length} potential repeated registrations (non-blocking)`);
