import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "@babel/parser";

export const SOURCE_ROOTS = ["src", "playground", "studio"];
const EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const PACKAGE_SCOPES = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const forbidden = (value) => typeof value === "string" && (value === "solid-js" || value.startsWith("solid-js/") || value.startsWith("@solidjs/"));
const location = (node) => node?.loc?.start?.line ?? 1;

export function inspectSolidReferences(source, filename = "source.tsx") {
  const violations = [];
  let ast;
  try {
    ast = parse(source, {
      sourceType: "unambiguous",
      sourceFilename: filename,
      plugins: [
        ...(filename.endsWith(".jsx") || filename.endsWith(".tsx") ? ["jsx"] : []),
        ...(filename.endsWith(".ts") || filename.endsWith(".tsx") ? ["typescript"] : []),
        "decorators-legacy",
      ],
      errorRecovery: false,
    });
  } catch (error) {
    return [{ line: error.loc?.line ?? 1, kind: `Unparseable source: ${error.message}` }];
  }
  const report = (node, kind) => violations.push({ line: location(node), kind });
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
      if (forbidden(node.source?.value)) report(node, "Solid module import/export");
    }
    if (node.type === "ImportExpression" && forbidden(node.source?.value)) report(node, "Solid dynamic import");
    if (node.type === "CallExpression") {
      if (node.callee?.type === "Import" && forbidden(node.arguments?.[0]?.value)) report(node, "Solid dynamic import");
      if (node.callee?.type === "Identifier" && node.callee.name === "require" && forbidden(node.arguments?.[0]?.value)) report(node, "Solid require");
    }
    if (node.type === "TSImportType" && forbidden(node.argument?.value)) report(node, "Solid type import");
    if (node.type === "ImportAttribute" && forbidden(node.value?.value)) report(node, "Solid import attribute");
    if (node.type === "TSExternalModuleReference" && forbidden(node.expression?.value)) report(node, "Solid TypeScript require");
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "start" || key === "end" || key === "extra" || key === "comments" || key === "tokens") continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(ast.program);
  const pragma = /@jsxImportSource\s+(?:solid-js(?:\/\S*)?|@solidjs\/\S*)/g;
  for (const match of source.matchAll(pragma)) {
    violations.push({ line: source.slice(0, match.index).split("\n").length, kind: "Solid JSX runtime pragma" });
  }
  return violations;
}

export async function auditReactOnly(root = process.cwd()) {
  const violations = [];
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  for (const scope of PACKAGE_SCOPES) {
    for (const name of Object.keys(pkg[scope] || {})) {
      if (forbidden(name)) violations.push(`package.json: forbidden ${scope} dependency ${name}`);
    }
  }
  async function scan(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { await scan(absolute); continue; }
      if (!entry.isFile() || !EXTENSIONS.has(path.extname(entry.name))) continue;
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const source = await fs.readFile(absolute, "utf8");
      for (const issue of inspectSolidReferences(source, relative)) {
        violations.push(`${relative}:${issue.line}: ${issue.kind}`);
      }
    }
  }
  for (const directory of SOURCE_ROOTS) await scan(path.join(root, directory));
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const violations = await auditReactOnly();
  if (violations.length) {
    console.error("[react-only] Forbidden Solid references:");
    for (const violation of violations) console.error(" - " + violation);
    process.exitCode = 1;
  } else {
    console.log("[react-only] No Solid module imports, exports, type imports or dependencies found.");
  }
}
