// scripts/style-check.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { parse } from "@babel/parser";
import { BuildReporter, fmt, isCI } from "./build.mjs"; // @TODO: importar do reporter já extraído

// ============================================================================
// // @TODO: Mover para scripts/ast-rules.mjs
// ============================================================================
const LOOP_TYPES = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);

const DECLARATION_TYPES = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "FunctionDeclaration",
  "ClassDeclaration",
]);

const CONTROL_TYPES = new Set([
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "TryStatement",
]);

const IGNORED_KEYS = new Set(["loc", "start", "end", "comments", "extra", "tokens"]);

/**
 * Verifica em O(1) sem alocar substrings se após `index` existe uma única quebra
 * de linha seguida imediatamente por código (sem linha em branco).
 */
function needsBlankLineAfter(content, index) {
  const len = content.length;
  if (index >= len) return false;

  let cursor = index;
  if (content.charCodeAt(cursor) === 13 /* \r */) cursor++;
  if (cursor >= len || content.charCodeAt(cursor) !== 10 /* \n */) return false;
  cursor++; // pulou o primeiro \n

  // Avança espaços/tabs horizontais da próxima linha
  while (cursor < len) {
    const ch = content.charCodeAt(cursor);
    if (ch === 32 /* ' ' */ || ch === 9 /* '\t' */) {
      cursor++;
    } else {
      break;
    }
  }

  if (cursor >= len) return false;
  const nextCh = content.charCodeAt(cursor);
  // Se a próxima linha já for \r ou \n, já existe linha em branco
  return nextCh !== 13 && nextCh !== 10;
}

function collectStyleEdits(content, ast) {
  const edits = [];

  function addEdit(start, end, replacement, message, loc) {
    edits.push({
      start,
      end,
      replacement,
      message,
      line: loc?.start?.line ?? 1,
      column: loc?.start?.column ?? 0,
    });
  }

  function ensureBraces(body, label) {
    if (body && body.type !== "BlockStatement") {
      addEdit(
        body.start,
        body.end,
        `{\n${content.slice(body.start, body.end)}\n}`,
        `${label} requires braces`,
        body.loc,
      );
    }
  }

  function visit(node, parent) {
    if (!node || typeof node !== "object") return;

    const { type } = node;

    if (type === "IfStatement") {
      ensureBraces(node.consequent, "if");
      if (node.alternate && node.alternate.type !== "IfStatement") {
        ensureBraces(node.alternate, "else");
      }
    } else if (LOOP_TYPES.has(type)) {
      ensureBraces(node.body, type);
    }

    if (
      parent?.type === "Program" &&
      node.loc?.start.line < node.loc?.end.line &&
      (DECLARATION_TYPES.has(type) || CONTROL_TYPES.has(type))
    ) {
      if (needsBlankLineAfter(content, node.end)) {
        addEdit(
          node.end,
          node.end,
          "\n",
          "blank line required after multiline declaration or control block",
          node.loc,
        );
      }
    }

    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (IGNORED_KEYS.has(key)) continue;

      const value = node[key];
      if (Array.isArray(value)) {
        for (let j = 0; j < value.length; j++) {
          const child = value[j];
          if (child && typeof child === "object") visit(child, node);
        }
      } else if (value && typeof value === "object" && value.type) {
        visit(value, node);
      }
    }
  }

  visit(ast, null);
  return edits;
}

function applyEdits(content, edits) {
  // Ordena de trás para frente para não invalidar offsets anteriores
  const sorted = edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let result = content;
  for (let i = 0; i < sorted.length; i++) {
    const { start, end, replacement } = sorted[i];
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

// ============================================================================
// // @TODO: Mover para scripts/file-discovery.mjs
// ============================================================================
const SOURCE_EXT_RE = /\.[cm]?[jt]sx?$/;

async function discoverSourceFiles(directory, cwd = process.cwd()) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return discoverSourceFiles(absolute, cwd);
      if (entry.isFile() && SOURCE_EXT_RE.test(entry.name)) {
        return [path.relative(cwd, absolute)];
      }
      return [];
    }),
  );

  return nested.flat().sort();
}

// ============================================================================
// // @TODO: Mover para scripts/file-linter.mjs
// ============================================================================
async function processSourceFile(filename, { fix }) {
  const fileStart = performance.now();
  const absolute = path.resolve(filename);
  const content = await fs.readFile(absolute, "utf8");

  // TypeScript 7 no longer ships the old compiler API. Babel parses both TS
  // and TSX here; type checking remains the responsibility of `tsc`.
  const ast = parse(content, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const edits = collectStyleEdits(content, ast);

  if (fix && edits.length > 0) {
    const updated = applyEdits(content, edits);
    parse(updated, { sourceType: "module", plugins: ["typescript", "jsx"] });
    await fs.writeFile(absolute, updated, "utf8");
  }

  return {
    filename,
    edits,
    elapsed: performance.now() - fileStart,
  };
}

// ============================================================================
// ORQUESTRADOR PRINCIPAL (scripts/style-check.mjs)
// ============================================================================
const fix = process.argv.includes("--fix");
const scriptArg = process.argv.find((arg) => arg.startsWith("--script="));
const script = scriptArg ? scriptArg.slice("--script=".length) : null;
const changedOnly = process.argv.includes("--changed");
const filesFromArg = process.argv.find((arg) => arg.startsWith("--files-from="));
const baseArg = process.argv.find((arg) => arg.startsWith("--base="));
const base = baseArg?.slice("--base=".length) || process.env.STYLE_BASE_REF || "HEAD^";

if (script && !/^[a-z0-9-]+$/.test(script)) {
  throw new Error(`Invalid userscript id: ${script}`);
}

const root = path.resolve("src/userscripts");
const selectedDir = script ? path.join(root, script) : root;

const reporter = new BuildReporter(fix ? "userscripts style-fix" : "userscripts style-check", "AST");
reporter.banner();

// STEP 1: Descoberta paralela dos arquivos alvo
const targets = await reporter.step("discover source files", async (log) => {
  let files = await discoverSourceFiles(selectedDir);
  if (changedOnly) {
    const changedPaths = filesFromArg
      ? await fs.readFile(filesFromArg.slice("--files-from=".length), "utf8")
      : execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRT", base, "--"], { encoding: "utf8" });
    const changed = new Set(changedPaths.trim().split("\n"));
    files = files.filter((file) => changed.has(file));
  }
  log.pass(path.relative(process.cwd(), selectedDir) || "src/userscripts", `${files.length} files matched`);
  return files;
});

// STEP 2: Análise AST & Autofix concorrente
const { totalIssues, affectedFiles } = await reporter.step(
  fix ? "parse AST & apply style fixes" : "parse AST & validate style rules",
  async (log) => {
    const results = await Promise.all(targets.map((filename) => processSourceFile(filename, { fix })));

    let issueCount = 0;
    let dirtyFiles = 0;

    for (const { filename, edits, elapsed } of results) {
      if (edits.length === 0) continue;

      issueCount += edits.length;
      dirtyFiles++;

      if (fix) {
        log.pass(filename, `${edits.length} issue(s) fixed · ${fmt.duration(elapsed)}`);
      } else {
        log.warn(`${filename}: ${edits.length} style issue(s)`);
        for (const edit of edits) {
          if (isCI) {
            console.error(`::error file=${filename},line=${edit.line},col=${edit.column}::${edit.message}`);
          } else {
            log.info(`L${edit.line}:${edit.column}`, edit.message);
          }
        }
      }
    }

    if (issueCount === 0) {
      log.pass("all files conform to AST style rules", `${targets.length} clean`);
    }

    return { totalIssues: issueCount, affectedFiles: dirtyFiles };
  },
);

reporter.summary({
  Files: `${targets.length} scanned`,
  Issues:
    totalIssues === 0
      ? fmt.green("0 found")
      : fix
        ? fmt.green(`${totalIssues} fixed (${affectedFiles} files)`)
        : fmt.red(`${totalIssues} errors (${affectedFiles} files)`),
});

if (totalIssues > 0 && !fix) {
  process.exitCode = 1;
}
