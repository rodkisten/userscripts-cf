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
  // Generated entry paths may use .js while the checked-in source is .ts/.tsx.
  const requestedEntry = path.resolve(rootPath, entry);
  const entryCandidates = [requestedEntry];
  if (/\\.jsx?$/.test(requestedEntry)) {
    const stem = requestedEntry.replace(/\\.jsx?$/, "");
    entryCandidates.push(stem + ".ts", stem + ".tsx", stem + ".jsx");
  }
  let resolvedEntry;
  for (const candidate of entryCandidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) {
        resolvedEntry = candidate;
        break;
      }
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  if (!resolvedEntry) throw new Error(`Runtime graph entry not found: ${entry}`);
  const pending = [resolvedEntry];
  const visited = new Set();
  const features = new Set();
  const dynamicFiles = [];
  const modules = [];
  while (pending.length) {
    const filename = pending.pop();
    if (visited.has(filename)) continue;
    if (filename !== rootPath && !filename.startsWith(rootPath + path.sep))
      throw new Error(`Import outside project: ${filename}`);
    visited.add(filename);
    const source = await fs.readFile(filename, "utf8");
    modules.push({
      file: path.relative(rootPath, filename).split(path.sep).join("/"),
      sourceBytes: Buffer.byteLength(source),
    });
    const usage = analyzeRuntimeUsage(source, filename);
    for (const feature of usage.features) features.add(feature);
    if (usage.dynamic) dynamicFiles.push(path.relative(rootPath, filename));
    const info = ts.preProcessFile(source, true, true);
    const specifiers = new Set(info.importedFiles.map((item) => item.fileName));
    // TypeScript preprocessing does not consistently report import() and
    // require() calls. Include literal references in the feature graph.
    // Non-literal imports cannot be resolved statically, so keep all features.
    const ast = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      filename.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : filename.endsWith(".jsx")
          ? ts.ScriptKind.JSX
          : ts.ScriptKind.TS,
    );
    const inspectImports = (node) => {
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) specifiers.add(argument.text);
        else if (argument) dynamicFiles.push(path.relative(rootPath, filename));
      }
      ts.forEachChild(node, inspectImports);
    };
    inspectImports(ast);
    for (const specifier of specifiers) {
      const dependency = await resolveLocal(filename, specifier);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return {
    features: [...features].sort(),
    dynamic: dynamicFiles.length > 0,
    dynamicFiles: [...new Set(dynamicFiles)].sort(),
    files: [...visited].map((file) => path.relative(rootPath, file)).sort(),
    // Source bytes are diagnostic only; not bundled/minified byte attribution.
    sourceBytes: modules.reduce((sum, item) => sum + item.sourceBytes, 0),
    modules: modules.sort((a, b) => b.sourceBytes - a.sourceBytes || a.file.localeCompare(b.file)),
  };
}
