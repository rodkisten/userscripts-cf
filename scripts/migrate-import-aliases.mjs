// @ts-check
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const CONFIG = {
  rootDir: process.cwd(),
  srcDirName: 'src',
  aliasPrefix: '@/',
  reportPath: '.cache/import-migration.json',
  excludedDirs: new Set([
    'node_modules',
    '.git',
    '.pnpm',
    '.cache',
    '.turbo',
    '.vite',
    '.output',
    'dist',
    'build',
    'coverage',
    'vendor',
    'fixtures',
    '__snapshots__',
  ]),
  sourceFileRegex: /\.(?:[cm]?[jt]s|[jt]sx)$/,
  ignoredFileRegex: /(?:\.d\.[cm]?ts|\.min\.[cm]?js|\.user\.js)$/,
};

/**
 * @typedef {{ from: string, to: string }} ImportEdit
 * @typedef {{ file: string, imports: ImportEdit[] }} FileReport
 * @typedef {{ file: string, specifier: string }} UnresolvedImport
 */

function parseCliArgs(argv) {
  const args = new Set(argv);

  if (args.has('--help') || args.has('-h')) {
    console.log(`
Usage: node migrate-imports.js [options]

Options:
  --write    Apply changes to files on disk (aborts if unresolved imports exist)
  --check    Exit with code 1 if any file requires migration (for CI)
  --quiet    Suppress per-file diff output
  -h, --help Show this help message
`);
    process.exit(0);
  }

  const write = args.has('--write');
  const check = args.has('--check');
  const quiet = args.has('--quiet');

  if (write && check) {
    throw new Error('--write and --check are mutually exclusive');
  }

  return {
    write,
    check,
    quiet,
    mode: write ? 'write' : check ? 'check' : 'dry-run',
  };
}

/**
 * Loads TypeScript compiler options from tsconfig.json if present.
 * @param {string} rootDir
 * @returns {ts.CompilerOptions}
 */
function loadCompilerOptions(rootDir) {
  /** @type {ts.CompilerOptions} */
  const defaults = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
  };

  const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) return defaults;

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    const message = ts.flattenDiagnosticMessageText(config.error.messageText, '\n');
    throw new Error(`Unable to read tsconfig.json: ${message}`);
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );

  return { ...defaults, ...parsed.options };
}

/**
 * Checks if `target` is strictly inside `parent` directory.
 * @param {string} parent
 * @param {string} target
 */
function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * Recursively yields valid source files from a directory.
 * @param {string} directory
 * @returns {Generator<string>}
 */
function* walkSourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (CONFIG.excludedDirs.has(entry.name) || entry.isSymbolicLink()) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walkSourceFiles(absolutePath);
    } else if (
      entry.isFile() &&
      CONFIG.sourceFileRegex.test(entry.name) &&
      !CONFIG.ignoredFileRegex.test(entry.name)
    ) {
      yield absolutePath;
    }
  }
}

/**
 * Extracts the string literal node representing a module specifier from an AST node.
 * @param {ts.Node} node
 * @returns {ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | null}
 */
function extractModuleSpecifier(node) {
  /** @type {ts.Expression | undefined} */
  let candidate;

  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    candidate = node.moduleSpecifier;
  } else if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference)
  ) {
    candidate = node.moduleReference.expression;
  } else if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument)
  ) {
    candidate = node.argument.literal;
  } else if (ts.isCallExpression(node)) {
    const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire =
      ts.isIdentifier(node.expression) && node.expression.text === 'require';

    if (isDynamicImport || isRequire) {
      candidate = node.arguments[0];
    }
  }

  if (
    candidate &&
    (ts.isStringLiteral(candidate) || ts.isNoSubstitutionTemplateLiteral(candidate))
  ) {
    return candidate;
  }

  return null;
}

function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const rootRealPath = fs.realpathSync(CONFIG.rootDir);
  const srcDir = path.join(rootRealPath, CONFIG.srcDirName);

  if (!fs.existsSync(srcDir)) {
    throw new Error(`Root ${CONFIG.srcDirName}/ directory not found`);
  }

  const srcRealPath = fs.realpathSync(srcDir);
  const compilerOptions = loadCompilerOptions(rootRealPath);
  const resolutionCache = ts.createModuleResolutionCache(
    rootRealPath,
    (name) => name,
    compilerOptions,
  );

  /** @type {UnresolvedImport[]} */
  const unresolved = [];
  /** @type {FileReport[]} */
  const fileReports = [];
  /** @type {{ file: string, output: string }[]} */
  const pendingWrites = [];

  let scanned = 0;
  let migratedCount = 0;

  /**
   * @param {string} specifier
   * @param {string} containingFile
   * @returns {string | null}
   */
  function migrateSpecifier(specifier, containingFile) {
    // Only process relative imports
    if (!/^\.{1,2}(?:\/|$)/.test(specifier)) return null;

    const targetPath = path.resolve(path.dirname(containingFile), specifier);
    if (!isInside(srcRealPath, targetPath)) return null;

    const resolved = ts.resolveModuleName(
      specifier,
      containingFile,
      compilerOptions,
      ts.sys,
      resolutionCache,
    ).resolvedModule?.resolvedFileName;

    if (!resolved) {
      unresolved.push({
        file: path.relative(rootRealPath, containingFile),
        specifier,
      });
      return null;
    }

    // Verify symlinks don't escape src/
    const resolvedRealPath = fs.realpathSync(resolved);
    if (!isInside(srcRealPath, resolvedRealPath)) {
      return null;
    }

    const relativeToSrc = path
      .relative(srcRealPath, targetPath)
      .split(path.sep)
      .join('/');

    return `${CONFIG.aliasPrefix}${relativeToSrc}`;
  }

  for (const file of walkSourceFiles(rootRealPath)) {
    scanned++;
    const original = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true);

    /** @type {{ start: number, end: number, from: string, to: string }[]} */
    const edits = [];

    /** @param {ts.Node} node */
    function visit(node) {
      const literal = extractModuleSpecifier(node);

      if (literal) {
        const replacement = migrateSpecifier(literal.text, file);
        if (replacement && replacement !== literal.text) {
          edits.push({
            start: literal.getStart(sourceFile) + 1,
            end: literal.getEnd() - 1,
            from: literal.text,
            to: replacement,
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (edits.length === 0) continue;

    // Apply edits from bottom to top to preserve string indices
    edits.sort((a, b) => b.start - a.start);
    let output = original;
    for (const edit of edits) {
      output = output.slice(0, edit.start) + edit.to + output.slice(edit.end);
    }

    // Restore chronological order for reporting
    edits.reverse();

    migratedCount += edits.length;
    fileReports.push({
      file: path.relative(rootRealPath, file),
      imports: edits.map(({ from, to }) => ({ from, to })),
    });
    pendingWrites.push({ file, output });
  }

  const abortedWrite = cli.write && unresolved.length > 0;

  if (cli.write && !abortedWrite) {
    for (const { file, output } of pendingWrites) {
      fs.writeFileSync(file, output, 'utf8');
    }
  }

  const report = {
    mode: abortedWrite ? 'write (aborted)' : cli.mode,
    scanned,
    changed: fileReports.length,
    migrated: migratedCount,
    files: fileReports,
    unresolved,
  };

  const fullReportPath = path.join(rootRealPath, CONFIG.reportPath);
  fs.mkdirSync(path.dirname(fullReportPath), { recursive: true });
  fs.writeFileSync(fullReportPath, JSON.stringify(report, null, 2));

  printSummary(report, cli.quiet);

  if (unresolved.length > 0) {
    process.exitCode = 1;
  } else if (cli.check && fileReports.length > 0) {
    process.exitCode = 1;
  }
}

function printSummary(report, quiet) {
  console.log(`
╭────────────────────────────────────────╮
│  IMPORT ALIAS MIGRATION                │
╰────────────────────────────────────────╯

  Mode        ${report.mode}
  Scanned     ${report.scanned}
  Changed     ${report.changed}
  Imports     ${report.migrated}
  Unresolved  ${report.unresolved.length}
`);

  if (!quiet) {
    for (const entry of report.files) {
      console.log(`\n${entry.file}`);
      for (const item of entry.imports) {
        console.log(`  ${item.from} → ${item.to}`);
      }
    }
  }

  if (report.unresolved.length > 0) {
    console.error('\nUnresolved imports (write aborted):');
    for (const item of report.unresolved) {
      console.error(`  ${item.file}: ${item.specifier}`);
    }
  }
}

main();
