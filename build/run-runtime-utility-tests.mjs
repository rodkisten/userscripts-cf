import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../tests/", import.meta.url);
const allowed =
  /(?:^|[-_.])(runtime|utilities|utility|utils|parser|codemod|ast|storage|config|build|pr-ci-scope)(?:[-_.]|$)/i;
const prohibited =
  /(?:component|userscript|solid|react-ui|design-system|visual|render|integration|boot|feature|benchmark|playground|shadow-mount|inspection-build|summary)/i;
const suites = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) {
      const relativePath = relative(root.pathname, path).replaceAll("\\", "/");
      if (allowed.test(entry.name) && !prohibited.test(relativePath)) {
        suites.push("tests/" + relativePath);
      }
    }
  }
}
await walk(root.pathname);
suites.sort();
if (!suites.length) {
  console.error("No eligible runtime/utility test suites found. Refusing silent success.");
  process.exit(1);
}
console.log("Runtime and utility suites:", suites.join(", "));
const result = spawnSync("npx", ["vitest", "run", ...suites], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
