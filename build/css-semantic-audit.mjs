import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const DEFAULT_IGNORED = new Set(["node_modules", ".git", "dist", "coverage", "build", "tests"]);
const SCRIPT_OR_CSS_EXT = /\.(?:css|[cm]?[jt]sx?)$/i;
const CSS_EXT = /\.css$/i;

// Captura imports de .css em arquivos JS/TS (estáticos, re-exports e dynamic import)
const JS_CSS_IMPORT_RE =
  /(?:(?:import|export)\s+(?:[^"'\n]*?\s+from\s+)?["']([^"']+\.css(?:\?[^"']*)?)["']|import\(\s*["']([^"']+\.css(?:\?[^"']*)?)["']\s*\))/g;

/**
 * Normaliza caminhos relativos para POSIX (`/`).
 * @param {string} root
 * @param {string} target
 */
const relPosix = (root, target) => path.relative(root, target).split(path.sep).join("/");

/**
 * Percorre recursivamente o diretório coletando arquivos elegíveis.
 * @param {string} dir
 * @param {Set<string>} ignored
 * @param {string[]} [out=[]]
 */
function walk(dir, ignored = DEFAULT_IGNORED, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path.join(dir, entry.name), ignored, out);
    } else if (SCRIPT_OR_CSS_EXT.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Resolve um especificador CSS relativo em disco.
 * @param {string} from
 * @param {string} spec
 */
function resolveImport(from, spec) {
  if (!spec.startsWith(".")) return null;
  const cleanSpec = spec.split(/[?#]/, 1)[0];
  const base = path.resolve(path.dirname(from), cleanSpec);
  for (const candidate of [base, `${base}.css`, path.join(base, "index.css")]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // ignora ENOENT / ENOTDIR
    }
  }
  return null;
}

/**
 * Extrai o especificador de uma regra `@import` do PostCSS (suporta `"a.css"`, `'a.css'`, `url("a.css")`, `url(a.css)`).
 * @param {string} params
 */
function parseCssAtImportSpec(params) {
  const trimmed = params.trim();
  const urlMatch = /^url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(trimmed);
  if (urlMatch) return urlMatch[2].trim();
  const strMatch = /^(['"])([^'"]+)\1/.exec(trimmed);
  if (strMatch) return strMatch[2].trim();
  return null;
}

/**
 * Remove comentários de linha e bloco em JS/TS antes da busca por imports de CSS.
 * @param {string} source
 */
function stripJsComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
}

/**
 * Executa a auditoria semântica de CSS e grafo de dependências.
 *
 * @param {{ root?: string, srcDir?: string, ignored?: Set<string> }} [options={}]
 */
export function auditCssSemantics({
  root = process.cwd(),
  srcDir = "src",
  ignored = DEFAULT_IGNORED,
} = {}) {
  const rootPath = path.resolve(root);
  const targetDir = path.resolve(rootPath, srcDir);
  const files = walk(targetDir, ignored).sort();

  /** @type {Map<string, string[]>} */
  const graph = new Map();
  /** @type {Array<{ file: string, tokens: Array<{ name: string, value: string, line: number }> }>} */
  const stylesheets = [];
  /** @type {Array<{ file: string, code: string, spec?: string, message?: string }>} */
  const diagnostics = [];

  for (const file of files) {
    const relFile = relPosix(rootPath, file);
    const source = fs.readFileSync(file, "utf8");
    /** @type {string[]} */
    const deps = [];

    const recordDep = (spec) => {
      const resolved = resolveImport(file, spec);
      if (resolved) {
        deps.push(relPosix(rootPath, resolved));
      } else if (spec.startsWith(".")) {
        diagnostics.push({ file: relFile, code: "unresolved-import", spec });
      }
    };

    if (CSS_EXT.test(file)) {
      let ast;
      try {
        ast = postcss.parse(source, { from: file });
      } catch (error) {
        diagnostics.push({
          file: relFile,
          code: "parse-error",
          message: error instanceof Error ? error.message : String(error),
        });
        graph.set(relFile, []);
        continue;
      }

      ast.walkAtRules("import", (atRule) => {
        const spec = parseCssAtImportSpec(atRule.params);
        if (spec) recordDep(spec);
      });

      /** @type {Array<{ name: string, value: string, line: number }>} */
      const tokens = [];
      ast.walkDecls((decl) => {
        if (decl.prop.startsWith("--")) {
          tokens.push({
            name: decl.prop,
            value: decl.value.trim(),
            line: decl.source?.start?.line ?? 0,
          });
        }
      });

      stylesheets.push({ file: relFile, tokens });
    } else {
      const cleanSource = stripJsComments(source);
      for (const match of cleanSource.matchAll(JS_CSS_IMPORT_RE)) {
        const spec = match[1] || match[2];
        if (spec) recordDep(spec);
      }
    }

    graph.set(relFile, [...new Set(deps)].sort());
  }

  return {
    files: stylesheets.length,
    graph: Object.fromEntries(graph),
    stylesheets,
    diagnostics,
  };
}

// Execução direta via CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = process.cwd();
  const report = auditCssSemantics({ root });
  const output = JSON.stringify(report, null, 2) + "\n";

  if (process.argv.includes("--write-report")) {
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(root, "artifacts/css-semantic-audit.json"), output);
  }

  console.log(
    JSON.stringify({
      stylesheets: report.files,
      dependencies: Object.values(report.graph).reduce((n, a) => n + a.length, 0),
      diagnostics: report.diagnostics.length,
    })
  );

  if (process.argv.includes("--strict") && report.diagnostics.length) {
    process.exitCode = 1;
  }
}
