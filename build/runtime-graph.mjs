import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { analyzeRuntimeUsage } from "./runtime-usage.mjs";

const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const scriptExtRegex = /\.(?:[cm]?[jt]sx?)$/i;

/**
 * Resolve imports locais relativos a partir de um arquivo, suportando
 * mapeamento de extensões compiladas (.js/.mjs/.cjs) para fontes (.ts/.mts/.cts).
 *
 * @param {string} from Caminho absoluto do arquivo importador
 * @param {string} specifier Especificador do import
 * @returns {Promise<string | null>}
 */
async function resolveLocal(from, specifier) {
  if (!specifier.startsWith(".")) return null;

  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  // Ignora assets estáticos (ex: .css, .png, .svg), mas permite extensões de script e .json
  if (
    !scriptExtRegex.test(cleanSpecifier) &&
    !cleanSpecifier.endsWith(".json") &&
    /\.[a-z0-9]+$/i.test(cleanSpecifier)
  ) {
    return null;
  }

  const base = path.resolve(path.dirname(from), cleanSpecifier);
  const candidates = new Set([base]);

  if (scriptExtRegex.test(base)) {
    const withoutExtension = base.replace(scriptExtRegex, "");
    for (const ext of extensions) candidates.add(withoutExtension + ext);
  }

  for (const ext of extensions) candidates.add(base + ext);
  for (const ext of extensions) candidates.add(path.join(base, "index" + ext));

  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }

  throw new Error(`Unresolved local import ${JSON.stringify(specifier)} from ${from}`);
}

/**
 * Determina o ScriptKind do TypeScript com base na extensão do arquivo.
 * @param {string} filename
 * @returns {ts.ScriptKind}
 */
function getScriptKind(filename) {
  if (/\.tsx$/i.test(filename)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(filename)) return ts.ScriptKind.JSX;
  if (/\.(ts|mts|cts)$/i.test(filename)) return ts.ScriptKind.TS;
  if (/\.(js|mjs|cjs)$/i.test(filename)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * Analisa o grafo estático de uso de features do runtime em todos os imports locais alcançáveis.
 *
 * @param {string} entry Caminho do ponto de entrada (relativo a `root` ou absoluto)
 * @param {{ root?: string }} [options={}]
 */
export async function analyzeRuntimeGraph(entry, { root = process.cwd() } = {}) {
  const rootPath = path.resolve(root);
  const requestedEntry = path.resolve(rootPath, entry);
  const entryCandidates = new Set([requestedEntry]);

  if (scriptExtRegex.test(requestedEntry)) {
    const stem = requestedEntry.replace(scriptExtRegex, "");
    for (const ext of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]) {
      entryCandidates.add(stem + ext);
    }
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

  if (!resolvedEntry) {
    throw new Error(`Runtime graph entry not found: ${entry}`);
  }

  const pending = [resolvedEntry];
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {Set<string>} */
  const features = new Set();
  /** @type {Set<string>} */
  const dynamicFiles = new Set();
  /** @type {{ file: string, sourceBytes: number }[]} */
  const modules = [];

  while (pending.length > 0) {
    const filename = /** @type {string} */ (pending.pop());
    if (visited.has(filename)) continue;

    if (filename !== rootPath && !filename.startsWith(rootPath + path.sep)) {
      throw new Error(`Import outside project: ${filename}`);
    }

    visited.add(filename);
    const source = await fs.readFile(filename, "utf8");
    const relPath = path.relative(rootPath, filename).split(path.sep).join("/");

    modules.push({
      file: relPath,
      sourceBytes: Buffer.byteLength(source),
    });

    // Arquivos JSON não possuem código executável nem imports
    if (filename.endsWith(".json")) continue;

    const usage = analyzeRuntimeUsage(source, filename);
    for (const feature of usage.features) features.add(feature);
    if (usage.dynamic) dynamicFiles.add(relPath);

    const specifiers = new Set();
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, getScriptKind(filename));

    // Collect every local module edge from the AST instead of relying on
    // preProcessFile, whose import discovery behavior changed in TypeScript 6.
    /** @param {ts.Node} node */
    const inspectImports = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        specifiers.add(node.moduleSpecifier.text);
      }

      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      ) {
        specifiers.add(node.moduleReference.expression.text);
      }

      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        const argument = node.arguments[0];
        if (argument && (ts.isStringLiteralLike(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          specifiers.add(argument.text);
        } else if (argument) {
          dynamicFiles.add(relPath);
        }
      }

      ts.forEachChild(node, inspectImports);
    };

    inspectImports(ast);

    for (const specifier of specifiers) {
      const dependency = await resolveLocal(filename, specifier);
      if (dependency && !visited.has(dependency)) {
        pending.push(dependency);
      }
    }
  }

  return {
    features: [...features].sort(),
    dynamic: dynamicFiles.size > 0,
    dynamicFiles: [...dynamicFiles].sort(),
    files: [...visited].map((file) => path.relative(rootPath, file).split(path.sep).join("/")).sort(),
    // Source bytes are diagnostic only; not bundled/minified byte attribution.
    sourceBytes: modules.reduce((sum, item) => sum + item.sourceBytes, 0),
    modules: modules.sort((a, b) => b.sourceBytes - a.sourceBytes || a.file.localeCompare(b.file)),
  };
}
