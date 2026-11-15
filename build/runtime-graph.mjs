import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { analyzeRuntimeUsage } from "./runtime-usage.mjs";

const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".json"];

async function resolveLocal(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  if (!/\.(?:[cm]?[jt]sx?)$/.test(cleanSpecifier) && /\.[a-z0-9]+$/i.test(cleanSpecifier)) return null;
  const base = path.resolve(path.dirname(from), cleanSpecifier);
  const candidates = [base];
  if (/\.(?:js|jsx|mjs)$/.test(base)) {
    const withoutExtension = base.replace(/\.(?:js|jsx|mjs)$/, "");
    for (const ext of extensions) candidates.push(withoutExtension + ext);
  }
  for (const ext of extensions) candidates.push(base + ext);
  for (const ext of extensions) candidates.push(path.join(base, "index" + ext));
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error(`Unresolved local import ${JSON.stringify(specifier)} from ${from}`);
}

/** Analyze static runtime feature usage across all reachable local imports. */
export async function analyzeRuntimeGraph(entry, { root = process.cwd() } = {}) {
  const rootPath = path.resolve(root);
  const pending = [path.resolve(rootPath, entry)];
  const visited = new Set();
  const features = new Set();
  const dynamicFiles = [];
  while (pending.length) {
    const filename = pending.pop();
    if (visited.has(filename)) continue;
    if (filename !== rootPath && !filename.startsWith(rootPath + path.sep))
      throw new Error(`Import outside project: ${filename}`);
    visited.add(filename);
    const source = await fs.readFile(filename, "utf8");
    const usage = analyzeRuntimeUsage(source, filename);
    for (const feature of usage.features) features.add(feature);
    if (usage.dynamic) dynamicFiles.push(path.relative(rootPath, filename));
    const info = ts.preProcessFile(source, true, true);
    for (const item of info.importedFiles) {
      const dependency = await resolveLocal(filename, item.fileName);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return {
    features: [...features].sort(),
    dynamic: dynamicFiles.length > 0,
    dynamicFiles: dynamicFiles.sort(),
    files: [...visited].map((file) => path.relative(rootPath, file)).sort(),
  };
}
