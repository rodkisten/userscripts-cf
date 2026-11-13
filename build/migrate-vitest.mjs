import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// One-time, idempotent migration. Keep Node's strict assertions intact.
const directory = new URL("../tests/", import.meta.url);
let changed = 0;
for (const name of await readdir(directory)) {
  if (!name.endsWith(".test.js")) continue;
  const file = new URL(name, directory);
  const before = await readFile(file, "utf8");
  const after = before
    .replace(/import test from ["']node:test["'];?/g, 'import { test } from "vitest";')
    .replace(/import \{([^}]+)\} from ["']node:test["'];?/g, (_, names) => 'import {' + names + '} from "vitest";');
  if (before !== after) {
    await writeFile(file, after);
    changed++;
  }
}
console.log("Migrated", changed, "test files");
if (process.argv.includes("--install")) {
  execFileSync("npm", ["install", "--save-dev", "vitest@^4.0.0"], { stdio: "inherit" });
}
