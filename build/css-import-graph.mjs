import path from "node:path";
import { parse } from "@babel/parser";

const scriptExtRegex = /\.(?:[cm]?[jt]sx?)$/i;
const resolveSuffixes = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  "/index.ts",
  "/index.tsx",
  "/index.mts",
  "/index.cts",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
];

/**
 * Normaliza caminhos para formato POSIX sem `./` inicial para garantir match exato no Map.
 * @param {string} value
 */
const norm = (value) => path.posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");

/**
 * Resolve um especificador relativo contra o Map de arquivos em memória.
 * @param {string} from
 * @param {string} spec
 * @param {Map<string, string>} files
 * @returns {string | null}
 */
const resolve = (from, spec, files) => {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;

  const cleanSpec = spec.split(/[?#]/, 1)[0];
  const base = norm(cleanSpec.startsWith("@/") ? path.posix.join("src", cleanSpec.slice(2)) : path.posix.join(path.posix.dirname(from), cleanSpec));

  const candidates = new Set([base]);

  // Suporta imports ESM estilo TS: `import "./foo.js"` -> resolve para `foo.ts` / `foo.tsx`
  if (scriptExtRegex.test(base)) {
    const stem = base.replace(scriptExtRegex, "");
    for (const suffix of resolveSuffixes) {
      if (suffix) candidates.add(stem + suffix);
    }
  }

  for (const suffix of resolveSuffixes) {
    candidates.add(base + suffix);
  }

  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }

  return null;
};

/**
 * Constrói o grafo de imports e diagnostica erros de parse ou módulos não resolvidos.
 *
 * @param {Record<string, string>} sources Mapa de `{ caminhoArquivo: codigoFonte }`
 * @param {{ includeDynamic?: boolean }} [options={}]
 */
export function analyzeImportGraph(sources, { includeDynamic = true } = {}) {
  const files = new Map(Object.entries(sources).map(([name, content]) => [norm(name), content]));
  /** @type {Map<string, Array<{ target: string, spec: string, kind: string, isTypeOnly?: boolean }>>} */
  const edges = new Map();
  /** @type {Array<{ file: string, code: string, message?: string, spec?: string }>} */
  const diagnostics = [];

  for (const [file, content] of files) {
    if (!scriptExtRegex.test(file)) continue;

    let ast;
    try {
      ast = parse(content, {
        sourceType: "unambiguous",
        plugins: [
          "typescript",
          "jsx",
          "importAttributes",
          ["decorators", { decoratorsBeforeExport: true }],
        ],
        errorRecovery: false,
      });
    } catch (error) {
      diagnostics.push({
        file,
        code: "parse-error",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    /** @type {Array<{ target: string, spec: string, kind: string, isTypeOnly?: boolean }>} */
    const imports = [];

    /**
     * @param {string} spec
     * @param {string} kind
     * @param {boolean} [isTypeOnly=false]
     */
    const recordImport = (spec, kind, isTypeOnly = false) => {
      const target = resolve(file, spec, files);
      if (target) {
        imports.push({ target, spec, kind, ...(isTypeOnly ? { isTypeOnly: true } : {}) });
      } else if (spec.startsWith(".") || spec.startsWith("@/")) {
        diagnostics.push({ file, code: "unresolved-module", spec });
      }
    };

    // 1. Imports e Re-exports estáticos no top-level
    for (const node of ast.program.body) {
      if (
        (node.type === "ImportDeclaration" ||
          node.type === "ExportNamedDeclaration" ||
          node.type === "ExportAllDeclaration") &&
        node.source
      ) {
        const isTypeOnly =
          node.importKind === "type" ||
          node.exportKind === "type" ||
          (node.type === "ImportDeclaration" &&
            node.specifiers.length > 0 &&
            node.specifiers.every((s) => s.type === "ImportSpecifier" && s.importKind === "type"));

        recordImport(node.source.value, node.type, isTypeOnly);
      }
    }

    // 2. Imports dinâmicos (`import("./x")`) e `require("./x")` em qualquer profundidade
    if (includeDynamic) {
      walkBabelAst(ast.program, (node) => {
        if (node.type === "ImportExpression" && node.source?.type === "StringLiteral") {
          recordImport(node.source.value, "DynamicImport");
        } else if (
          node.type === "CallExpression" &&
          node.callee?.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "StringLiteral"
        ) {
          recordImport(node.arguments[0].value, "RequireCall");
        }
      });
    }

    edges.set(file, imports);
  }

  return {
    edges: Object.fromEntries(edges),
    diagnostics,
  };
}

/**
 * Percorre nós da AST do Babel sem depender de pacotes externos (`@babel/traverse`).
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
