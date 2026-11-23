import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentReporter, ansi } from './utils/ci-logger.mjs';
import {
  buildCliContext,
  createSummaryWriter,
  getChangedFiles,
  parseCliArgs,
  resolveInputs,
  runCmd,
  setActionOutput,
} from './utils/ci-utils.mjs';

const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const CODE_EXT_REGEX = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const TEST_FILE_REGEX = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.wrangler',
  '.cache',
]);

const toPosix = (p) => p.split('\\').join('/');

// ============================================================================
// 1. Varredura do workspace e leitura de tsconfig paths
// ============================================================================
function walkCodeFiles(dir, rootDir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkCodeFiles(path.join(dir, entry.name), rootDir, acc);
    } else if (entry.isFile() && CODE_EXT_REGEX.test(entry.name)) {
      acc.push(toPosix(path.relative(rootDir, path.join(dir, entry.name))));
    }
  }
  return acc;
}

function loadTsConfigAliases(rootDir, ts) {
  const aliases = [];
  let baseUrl = rootDir;

  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return { baseUrl, aliases };

  try {
    let compilerOptions = {};
    if (ts) {
      const readRes = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      compilerOptions = readRes.config?.compilerOptions || {};
    } else {
      const raw = fs.readFileSync(tsconfigPath, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      compilerOptions = JSON.parse(raw).compilerOptions || {};
    }

    if (compilerOptions.baseUrl) {
      baseUrl = path.resolve(rootDir, compilerOptions.baseUrl);
    }

    const pathsMap = compilerOptions.paths || {};
    for (const [pattern, targets] of Object.entries(pathsMap)) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const hasWildcard = pattern.includes('*');
      const prefix = hasWildcard ? pattern.split('*')[0] : pattern;
      const suffix = hasWildcard ? pattern.split('*')[1] || '' : '';

      aliases.push({
        prefix,
        suffix,
        hasWildcard,
        targets: targets.map((t) => ({
          prefix: hasWildcard ? t.split('*')[0] : t,
          suffix: hasWildcard ? t.split('*')[1] || '' : '',
        })),
      });
    }
  } catch {
    // Ignora tsconfig inválido ou estendido de forma dinâmica
  }

  return { baseUrl, aliases };
}

// ============================================================================
// 2. Extração de imports / requires / includes (TS Compiler API + Regex fallback)
// ============================================================================
function extractSpecifiers(content, filePath, ts) {
  const specifiers = new Set();

  if (ts) {
    const info = ts.preProcessFile(content, true, true);
    for (const item of info.importedFiles || []) {
      if (item.fileName) specifiers.add(item.fileName);
    }
    for (const item of info.referencedFiles || []) {
      if (item.fileName) specifiers.add(item.fileName);
    }
  } else {
    const patterns = [
      /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /\bexport\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
      /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\brequire(?:\.resolve)?\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\/\/\/\s*<reference\s+path=["']([^"']+)["']\s*\/>/g,
    ];
    for (const regex of patterns) {
      for (const match of content.matchAll(regex)) {
        if (match[1]) specifiers.add(match[1]);
      }
    }
  }

  // Captura também require() dinâmico simples caso ts.preProcessFile não detecte em JS/CJS
  for (const match of content.matchAll(/\brequire(?:\.resolve)?\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1]) specifiers.add(match[1]);
  }

  return [...specifiers];
}

function resolveCandidateFile(absBase, rootDir, allFilesSet) {
  const candidates = [absBase];

  // Suporte a imports ESM com extensão .js/.mjs/.cjs apontando para .ts/.mts/.cts
  const ext = path.extname(absBase).toLowerCase();
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
    const withoutExt = absBase.slice(0, -ext.length);
    for (const tsExt of ['.ts', '.tsx', '.mts', '.cts']) {
      candidates.push(`${withoutExt}${tsExt}`);
    }
  }

  for (const codeExt of CODE_EXTENSIONS) {
    candidates.push(`${absBase}${codeExt}`);
  }

  for (const codeExt of CODE_EXTENSIONS) {
    candidates.push(path.join(absBase, `index${codeExt}`));
  }

  for (const candidate of candidates) {
    const rel = toPosix(path.relative(rootDir, candidate));
    if (allFilesSet.has(rel)) {
      return rel;
    }
  }

  return null;
}

function resolveModuleSpecifier(specifier, fromRelFile, rootDir, allFilesSet, tsConfig) {
  // 1. Caminho relativo (./ ou ../)
  if (specifier.startsWith('.')) {
    const absTarget = path.resolve(rootDir, path.dirname(fromRelFile), specifier);
    return resolveCandidateFile(absTarget, rootDir, allFilesSet);
  }

  // 2. Alias do tsconfig.json (ex: @/*, #/*)
  for (const alias of tsConfig.aliases) {
    if (alias.hasWildcard) {
      if (specifier.startsWith(alias.prefix) && specifier.endsWith(alias.suffix)) {
        const wildcardPart = specifier.slice(
          alias.prefix.length,
          specifier.length - alias.suffix.length,
        );
        for (const target of alias.targets) {
          const mapped = `${target.prefix}${wildcardPart}${target.suffix}`;
          const resolved = resolveCandidateFile(
            path.resolve(tsConfig.baseUrl, mapped),
            rootDir,
            allFilesSet,
          );
          if (resolved) return resolved;
        }
      }
    } else if (specifier === alias.prefix) {
      for (const target of alias.targets) {
        const resolved = resolveCandidateFile(
          path.resolve(tsConfig.baseUrl, target.prefix),
          rootDir,
          allFilesSet,
        );
        if (resolved) return resolved;
      }
    }
  }

  return null;
}

// ============================================================================
// 3. Classificação do runner de teste (node:test vs Vitest)
// ============================================================================
function detectTestRunner(specifiers, content, hasVitestConfig) {
  const usesNodeTest =
    specifiers.includes('node:test') ||
    specifiers.includes('test') ||
    /\bfrom\s+['"]node:test['"]|require\s*\(\s*['"]node:test['"]\s*\)/.test(content);

  const usesVitest =
    specifiers.includes('vitest') ||
    /\bfrom\s+['"]vitest['"]|require\s*\(\s*['"]vitest['"]\s*\)/.test(content);

  if (usesNodeTest && !usesVitest) return 'node';
  if (usesVitest) return 'vitest';
  return hasVitestConfig ? 'vitest' : 'node';
}

// ============================================================================
// 4. Pipeline Principal
// ============================================================================
export async function analyzeImpactGraph() {
  const log = new AgentReporter('IMPACT GRAPH', 'AST & Dependency Scanner');
  log.banner();

  const cliArgs = parseCliArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  let ts = null;
  try {
    const mod = await import('typescript');
    ts = mod.default || mod;
  } catch {
    // Fallback para parser regex caso typescript não esteja instalado
  }

  let context = null;
  try {
    context = buildCliContext();
  } catch {
    // Execução local fora do GitHub Actions
  }

  const { baseRef, headRef } = resolveInputs({
    baseRef: [
      cliArgs.base,
      process.env.PR_BASE_SHA,
      process.env.BASE_REF,
      context?.payload?.pull_request?.base?.sha,
      context?.payload?.before,
    ],
    headRef: [
      cliArgs.head,
      process.env.PR_HEAD_SHA,
      process.env.HEAD_REF,
      context?.sha,
      'HEAD',
    ],
  });

  // --------------------------------------------------------------------------
  // Step 1: Resolver diff do commit / PR
  // --------------------------------------------------------------------------
  const { resolvedBase, changedFiles, changedCodeFiles } = await log.step(
    'Detectar arquivos modificados no commit',
    async (step) => {
      let base = baseRef;

      if (!base || /^0+$/.test(base)) {
        const prevCommit = runCmd('git', ['rev-parse', '--verify', 'HEAD~1'], { silent: true });
        if (prevCommit.ok) {
          base = prevCommit.stdout;
        } else {
          // Primeiro commit do repositório (empty tree SHA)
          base = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        }
      } else {
        await runCmd('git', ['fetch', 'origin', base, '--depth=1'], { silent: true });
        const originCheck = runCmd('git', ['rev-parse', '--verify', `origin/${base}`], { silent: true });
        if (originCheck.ok) {
          base = originCheck.stdout;
        }
      }

      const changed = getChangedFiles(base, headRef, 'ACMRT').map(toPosix);
      const codeOnly = changed.filter((f) => CODE_EXT_REGEX.test(f));

      step.info('Parser AST', ts ? `TypeScript ${ts.version}` : 'Regex fallback');
      step.info('Range Git', `${base.slice(0, 7)}..${headRef === 'HEAD' ? 'HEAD' : headRef.slice(0, 7)}`);
      step.pass(
        'Diff analisado',
        `${changed.length} arquivo(s) alterado(s) · ${codeOnly.length} arquivo(s) JS/TS`,
      );

      return { resolvedBase: base, changedFiles: changed, changedCodeFiles: codeOnly };
    },
  );

  // --------------------------------------------------------------------------
  // Step 2: Construir grafo completo de dependências do repositório
  // --------------------------------------------------------------------------
  const graphData = await log.step(
    'Construir grafo de imports, requires e testes',
    async (step) => {
      const allCodeFiles = walkCodeFiles(rootDir, rootDir);
      const allFilesSet = new Set(allCodeFiles);
      const tsConfig = loadTsConfigAliases(rootDir, ts);

      const hasVitestConfig = [
        'vitest.config.ts',
        'vitest.config.mts',
        'vitest.config.js',
        'vitest.config.mjs',
        'vite.config.ts',
        'vite.config.js',
      ].some((cfg) => fs.existsSync(path.join(rootDir, cfg)));

      const nodes = {};
      const reverseEdges = new Map();
      const testRunnerByFile = new Map();

      for (const file of allCodeFiles) {
        reverseEdges.set(file, new Set());
      }

      for (const file of allCodeFiles) {
        const absFile = path.join(rootDir, file);
        const content = fs.readFileSync(absFile, 'utf8');
        const specifiers = extractSpecifiers(content, absFile, ts);

        const internalImports = [];
        const externalPackages = [];

        for (const spec of specifiers) {
          const resolved = resolveModuleSpecifier(spec, file, rootDir, allFilesSet, tsConfig);
          if (resolved) {
            internalImports.push(resolved);
            reverseEdges.get(resolved)?.add(file);
          } else if (!spec.startsWith('.')) {
            externalPackages.push(spec);
          }
        }

        const isTest = TEST_FILE_REGEX.test(file);
        const runner = isTest ? detectTestRunner(specifiers, content, hasVitestConfig) : null;
        if (isTest) {
          testRunnerByFile.set(file, runner);
        }

        nodes[file] = {
          type: isTest ? 'test' : 'source',
          runner,
          imports: [...new Set(internalImports)].sort(),
          importedBy: [],
          externalPackages: [...new Set(externalPackages)].sort(),
        };
      }

      for (const [file, dependents] of reverseEdges.entries()) {
        if (nodes[file]) {
          nodes[file].importedBy = [...dependents].sort();
        }
      }

      // BFS reverso a partir dos arquivos modificados para encontrar todo o impacto transitivo
      const affectedSet = new Set(changedCodeFiles);
      const queue = [...changedCodeFiles];
      const impactPaths = {};

      for (const f of changedCodeFiles) {
        impactPaths[f] = [f];
      }

      while (queue.length > 0) {
        const current = queue.shift();
        const dependents = reverseEdges.get(current) || new Set();

        for (const dep of dependents) {
          if (!affectedSet.has(dep)) {
            affectedSet.add(dep);
            impactPaths[dep] = [...impactPaths[current], dep];
            queue.push(dep);
          }
        }
      }

      // Também associa testes por convenção de nome (foo.ts -> foo.test.ts / foo.spec.ts)
      // caso o teste exista mas ainda não importe diretamente o arquivo
      for (const affectedFile of [...affectedSet]) {
        if (TEST_FILE_REGEX.test(affectedFile)) continue;
        const ext = path.extname(affectedFile);
        const stem = affectedFile.slice(0, -ext.length);

        for (const candidateTest of testRunnerByFile.keys()) {
          if (
            candidateTest.startsWith(`${stem}.test.`) ||
            candidateTest.startsWith(`${stem}.spec.`)
          ) {
            if (!affectedSet.has(candidateTest)) {
              affectedSet.add(candidateTest);
              impactPaths[candidateTest] = [...(impactPaths[affectedFile] || [affectedFile]), candidateTest];
            }
          }
        }
      }

      const affectedFiles = [...affectedSet].sort();
      const nodeTests = [];
      const vitestTests = [];

      for (const file of affectedFiles) {
        if (!TEST_FILE_REGEX.test(file)) continue;
        const runner = testRunnerByFile.get(file);
        if (runner === 'vitest') {
          vitestTests.push(file);
        } else {
          nodeTests.push(file);
        }
      }

      // Subgrafo filtrado contendo apenas os nós afetados e suas relações diretas
      const impactedSubgraph = {};
      for (const file of affectedFiles) {
        if (nodes[file]) {
          impactedSubgraph[file] = {
            ...nodes[file],
            changedDirectly: changedCodeFiles.includes(file),
            impactChain: impactPaths[file] || [file],
          };
        }
      }

      step.info('Arquivos indexados', `${allCodeFiles.length} arquivo(s) JS/TS no workspace`);
      step.info('Impacto transitivo', `${affectedFiles.length} arquivo(s) afetado(s)`);
      step.pass(
        'Testes mapeados',
        `Node Test: ${nodeTests.length} · Vitest: ${vitestTests.length}`,
      );

      return {
        baseSha: resolvedBase,
        headRef,
        changedFiles,
        changedCodeFiles,
        affectedFiles,
        nodeTests,
        vitestTests,
        graph: impactedSubgraph,
      };
    },
  );

  // --------------------------------------------------------------------------
  // Step 3: Exportar outputs para o workflow e publicar resumo
  // --------------------------------------------------------------------------
  await log.step('Exportar outputs do workflow & Job Summary', async (step) => {
    const hasChanges = graphData.changedFiles.length > 0;
    const hasCodeChanges = graphData.changedCodeFiles.length > 0;
    const hasNodeTests = graphData.nodeTests.length > 0;
    const hasVitestTests = graphData.vitestTests.length > 0;
    const hasAnyTests = hasNodeTests || hasVitestTests;

    setActionOutput('has_changes', hasChanges);
    setActionOutput('has_code_changes', hasCodeChanges);
    setActionOutput('has_any_tests', hasAnyTests);
    setActionOutput('has_node_tests', hasNodeTests);
    setActionOutput('has_vitest_tests', hasVitestTests);
    setActionOutput('changed_files', graphData.changedFiles.join(' '));
    setActionOutput('affected_files', graphData.affectedFiles.join(' '));
    setActionOutput('node_tests', graphData.nodeTests.join(' '));
    setActionOutput('vitest_tests', graphData.vitestTests.join(' '));
    setActionOutput('graph_json', JSON.stringify(graphData));

    if (cliArgs.out) {
      fs.writeFileSync(cliArgs.out, `${JSON.stringify(graphData, null, 2)}\n`, 'utf8');
      step.info('Grafo salvo em disco', cliArgs.out);
    }

    // Monta base URL do GitHub para tornar todos os arquivos clicáveis
    const serverUrl = (context?.serverUrl || process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
    const repoFull =
      context?.repo?.owner && context?.repo?.repo
        ? `${context.repo.owner}/${context.repo.repo}`
        : process.env.GITHUB_REPOSITORY || '';

    const blobRef =
      context?.payload?.pull_request?.head?.sha ||
      process.env.PR_HEAD_SHA ||
      (headRef && headRef !== 'HEAD' ? headRef : runCmd('git', ['rev-parse', 'HEAD'], { silent: true }).stdout);

    const fileLink = (filePath) => {
      if (!repoFull || !blobRef) return `<code>${filePath}</code>`;
      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
      return `<a href="${serverUrl}/${repoFull}/blob/${encodeURIComponent(blobRef)}/${encodedPath}"><code>${filePath}</code></a>`;
    };

    const escapeHtml = (str) =>
      String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const nodeBadge = (node) => {
      if (node.changedDirectly && node.type === 'test') return '✏️🧪 <b>Alterado · Teste</b>';
      if (node.changedDirectly) return '✏️ <b>Alterado</b>';
      if (node.type === 'test' && node.runner === 'vitest') return '⚡ <b>Vitest</b>';
      if (node.type === 'test') return '🧪 <b>Node Test</b>';
      return '🔗 <b>Impactado</b>';
    };

    const summary = createSummaryWriter();
    summary
      .addHeading('🕸️ Grafo de Impacto & Seleção de Testes', 2)
      .addTable([
        [
          { data: 'Métrica', header: true },
          { data: 'Valor', header: true },
        ],
        ['Arquivos modificados (total)', `<code>${graphData.changedFiles.length}</code>`],
        ['Arquivos JS/TS modificados', `<code>${graphData.changedCodeFiles.length}</code>`],
        ['Arquivos impactados (transitivo)', `<code>${graphData.affectedFiles.length}</code>`],
        ['Testes Node (<code>node:test</code>)', `<code>${graphData.nodeTests.length}</code>`],
        ['Testes Vitest', `<code>${graphData.vitestTests.length}</code>`],
      ]);

    if (graphData.nodeTests.length > 0) {
      summary
        .addHeading('🧪 Testes Node.js selecionados', 3)
        .addList(graphData.nodeTests.map((t) => fileLink(t)));
    }

    if (graphData.vitestTests.length > 0) {
      summary
        .addHeading('⚡ Testes Vitest selecionados', 3)
        .addList(graphData.vitestTests.map((t) => fileLink(t)));
    }

    if (graphData.affectedFiles.length > 0) {
      summary.addHeading('📂 Mapa Detalhado por Arquivo Afetado', 3);

      const fileCards = graphData.affectedFiles.map((file) => {
        const node = graphData.graph[file];
        const chainHtml = (node.impactChain || [file]).map((stepFile) => fileLink(stepFile)).join(' ➔ ');

        const importedByHtml =
          node.importedBy.length > 0
            ? node.importedBy.map((dep) => `<li>${fileLink(dep)}</li>`).join('')
            : '<li><i>Nenhum dependente interno</i></li>';

        const importsHtml =
          node.imports.length > 0
            ? node.imports.map((imp) => `<li>${fileLink(imp)}</li>`).join('')
            : '<li><i>Nenhuma importação interna</i></li>';

        const externalHtml =
          node.externalPackages.length > 0
            ? node.externalPackages.map((pkg) => `<code>${escapeHtml(pkg)}</code>`).join(' · ')
            : '<i>Nenhum</i>';

        const titleHtml = `${nodeBadge(node)} — <code>${escapeHtml(file)}</code> <sub>(${node.imports.length} imports · ${node.importedBy.length} dependentes)</sub>`;

        const innerHtml = [
          `<p>📄 <b>Abrir arquivo:</b> ${fileLink(file)}${node.runner ? ` &nbsp;|&nbsp; 🏃 <b>Runner:</b> <code>${node.runner}</code>` : ''}</p>`,
          `<p>🧭 <b>Cadeia de impacto:</b><br>${chainHtml}</p>`,
          `<table>`,
          `<thead><tr><th>📥 Importa (${node.imports.length})</th><th>📤 Importado por (${node.importedBy.length})</th></tr></thead>`,
          `<tbody><tr><td valign="top"><ul>${importsHtml}</ul></td><td valign="top"><ul>${importedByHtml}</ul></td></tr></tbody>`,
          `</table>`,
          `<p>📦 <b>Pacotes externos:</b> ${externalHtml}</p>`,
        ].join('\n');

        return `<details>\n<summary>${titleHtml}</summary>\n\n${innerHtml}\n</details>`;
      });

      summary.addDetails(
        `🗂️ <b>Inspecionar todos os ${graphData.affectedFiles.length} arquivo(s) e suas relações</b>`,
        fileCards.join('\n\n'),
      );

      summary.addDetails(
        '🧬 <b>Ver JSON bruto do grafo de impacto</b>',
        `\`\`\`json\n${JSON.stringify(graphData.graph, null, 2)}\n\`\`\``,
      );
    }

    await summary.write();

    step.pass(
      'Outputs gravados',
      `node_tests=${graphData.nodeTests.length} · vitest_tests=${graphData.vitestTests.length}`,
    );
  });

  log.summary('success', {
    'Changed JS/TS': graphData.changedCodeFiles.length,
    'Affected Nodes': graphData.affectedFiles.length,
    'Node Tests': ansi.cyan(graphData.nodeTests.length),
    'Vitest Tests': ansi.cyan(graphData.vitestTests.length),
  });
}

// ============================================================================
// CLI Entrypoint
// ============================================================================
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  analyzeImpactGraph().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}


// ============================================================================
// CLI Entrypoint
// ============================================================================
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  analyzeImpactGraph().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
