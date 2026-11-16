import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import definitions from "../userscripts.config.js";
import { analyzeRuntimeGraph } from "./runtime-graph.mjs";

const shared = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.js",
  "userscripts.config.js",
  "build/build.mjs",
  "build/runtime-graph.mjs",
  "build/validate-changed.sh",
];
const read = async (file) => {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

export async function fingerprint(files) {
  const hash = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(file);
    hash.update("\0");
    const bytes = await read(file);
    hash.update(bytes ?? Buffer.from("<missing>"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function fingerprints() {
  const result = {};
  for (const definition of definitions) {
    const graph = await analyzeRuntimeGraph(definition.entry);
    const tests = [];
    // Per-script test files are discovered by directory, not a hardcoded list.
    const { glob } = await import("node:fs/promises");
    for await (const filename of glob(`tests/userscripts/${definition.id}/**/*.test.*`)) {
      tests.push(filename);
    }
    const files = [...graph.files, ...shared, ...tests];
    result[definition.id] = {
      hash: await fingerprint(files),
      files: [...new Set(files)].sort(),
      tests: tests.sort(),
    };
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const report = await fingerprints();
  const filename = process.argv.find((arg) => arg.startsWith("--output="))?.slice(9);
  const json = JSON.stringify(report, null, 2) + "\n";
  if (filename) await writeFile(filename, json);
  else process.stdout.write(json);
}
