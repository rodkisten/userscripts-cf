import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceRoots = ["src", "playground", "studio"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const forbiddenImport =
  /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["'](?:solid-js(?:\/[^"']*)?|@solidjs\/[^"']*)["']|@jsxImportSource\s+@solidjs\//;
const packageFile = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const packageScopes = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const violations = [];

for (const scope of packageScopes) {
  for (const name of Object.keys(packageFile[scope] || {})) {
    if (name === "solid-js" || name.startsWith("@solidjs/")) {
      violations.push(`package.json: forbidden dependency ${name}`);
    }
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
    if (entry.isDirectory()) {
      await scan(absolute);
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) continue;
    const content = await fs.readFile(absolute, "utf8");
    if (!forbiddenImport.test(content)) continue;
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    const line = content.slice(0, content.search(forbiddenImport)).split("\n").length;
    violations.push(`${relative}:${line}: forbidden Solid import or JSX runtime pragma`);
  }
}

for (const directory of sourceRoots) await scan(path.join(root, directory));

if (violations.length) {
  console.error("[react-only] Solid runtime references are forbidden:");
  for (const violation of violations) console.error(" - " + violation);
  process.exitCode = 1;
} else {
  console.log("[react-only] No Solid runtime imports or dependencies found.");
}
