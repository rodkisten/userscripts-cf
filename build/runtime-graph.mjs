import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";
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
 * Parse a source file with the same Babel parser already used by the build
 * pipeline and collect every statically resolvable module edge.
 *
 * @param {string} source
 * @param {string} filename
 * @param {string} relPath
 * @param {Set<string>} dynamicImportFiles Files that contain non-literal import() expressions
 * @returns {Set<string>}
 */
function collectModuleSpecifiers(source, filename, relPath, dynamicImportFiles) {
  const plugins = ["importAttributes", ["decorators", { decoratorsBeforeExport: true }]];
  if (/\.(?:ts|mts|cts|tsx)$/i.test(filename)) plugins.unshift("typescript");
  if (/\.(?:jsx|tsx)$/i.test(filename)) plugins.unshift("jsx");

  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins,
    errorRecovery: false,
  });

  const specifiers = new Set();

  for (const node of ast.program.body) {
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
      node.source?.type === "StringLiteral"
    ) {
      specifiers.add(node.source.value);
    }
  }

  walkBabelAst(ast.program, (node) => {
    if (node.type === "ImportExpression") {
      if (node.source?.type === "StringLiteral") {
        specifiers.add(node.source.value);
      } else if (node.source?.type === "TemplateLiteral" && node.source.expressions.length === 0) {
        specifiers.add(node.source.quasis[0]?.value?.cooked ?? node.source.quasis[0]?.value?.raw ?? "");
      } else {
        dynamicImportFiles.add(relPath);
      }
      return;
    }

    if (node.type !== "CallExpression") return;

    const argument = node.arguments?.[0];

    if (node.callee?.type === "Import") {
      if (argument?.type === "StringLiteral") {
        specifiers.add(argument.value);
      } else if (argument?.type === "TemplateLiteral" && argument.expressions.length === 0) {
        specifiers.add(argument.quasis[0]?.value?.cooked ?? argument.quasis[0]?.value?.raw ?? "");
      } else if (argument) {
        dynamicImportFiles.add(relPath);
      }
      return;
    }

    if (node.callee?.type === "Identifier" && node.callee.name === "require") {
      if (argument?.type === "StringLiteral") {
        specifiers.add(argument.value);
      } else if (argument?.type === "TemplateLiteral" && argument.expressions.length === 0) {
        specifiers.add(argument.quasis[0]?.value?.cooked ?? argument.quasis[0]?.value?.raw ?? "");
      }
    }
  });

  specifiers.delete("");
  return specifiers;
}

/**
 * Walk Babel AST nodes without pulling in @babel/traverse.
 *
 * @param {any} node
 * @param {(node: any) => void} visitor
 */
function walkBabelAst(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "tokens" || key === "comments") {
      continue;
    }

    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === "string") walkBabelAst(item, visitor);
      }
    } else if (child && typeof child.type === "string") {
      walkBabelAst(child, visitor);
    }
  }
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
  const paths = new Set();
  /** @type {Set<string>} */
  const dynamicContextFiles = new Set();
  /** @type {Set<string>} */
  const dynamicImportFiles = new Set();
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

    const usage = analyzeRuntimeUsage(source, filename, { includePaths: true });
    for (const feature of usage.features) features.add(feature);
    for (const capabilityPath of usage.paths || []) paths.add(capabilityPath);
    if (usage.dynamic) dynamicImportFiles.add(relPath);

    const specifiers = collectModuleSpecifiers(source, filename, relPath, dynamicImportFiles);

    for (const specifier of specifiers) {
      const dependency = await resolveLocal(filename, specifier);
      if (dependency && !visited.has(dependency)) {
        pending.push(dependency);
      }
    }
  }

  return {
    features: [...features].sort(),
    paths: [...paths].sort(),
    // "dynamic" means ScriptContext access cannot be proven statically and
    // therefore runtime feature tree-shaking must fall back to the full API.
    // Non-literal import() is tracked independently: loading an arbitrary
    // module does not imply arbitrary access to the userscript ScriptContext.
    dynamic: dynamicContextFiles.size > 0,
    dynamicFiles: [...dynamicContextFiles].sort(),
    dynamicImports: dynamicImportFiles.size > 0,
    dynamicImportFiles: [...dynamicImportFiles].sort(),
    files: [...visited].map((file) => path.relative(rootPath, file).split(path.sep).join("/")).sort(),
    // Source bytes are diagnostic only; not bundled/minified byte attribution.
    sourceBytes: modules.reduce((sum, item) => sum + item.sourceBytes, 0),
    modules: modules.sort((a, b) => b.sourceBytes - a.sourceBytes || a.file.localeCompare(b.file)),
  };
}
