import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import definitions from '../userscripts.config.js';
import { analyzeRuntimeGraph } from './runtime-graph.mjs';
import { AgentReporter, ansi } from './logger.mjs';
import {
  appendStepSummary,
  parseCliArgs,
  resolveInputs,
  runCmd,
  runInteractive,
  setActionOutput,
} from './utils/ci-utils.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT_DIR);

const CHANGED_FILES_PATH = 'changed-files.txt';
const AFFECTED_REPORT_PATH = 'affected-userscripts.json';

// Regexes de classificação de arquivos
const RELEVANT_CHANGE_RE =
  /^(src\/|tests\/|build\/|labs\/|playground\/|public\/|migration\/|package(-lock)?\.json$|tsconfig|vite\.config\.|\.github\/workflows\/)/;

const SHARED_INFRA_RE =
  /^(build\/|src\/(runtime\/|core\/|config\/|styles\/|selectors\.|assets\/)|package(-lock)?\.json$|vite\.config\.|tsconfig|migration\/)/;

const BUNDLER_OR_CONFIG_RE =
  /^(build\/(build\.mjs|runtime-graph\.mjs|run-runtime-utility-tests\.mjs)|package(-lock)?\.json$|userscripts\.config\.js$|vite\.config\.)/;

const TEST_FILE_RE = /^tests\/.*\.test\.[cm]?[jt]sx?$/;
const INTEGRATION_TEST_RE = /(integration|integrated|boot|standalone|page-repl).*\.test\./;

// ============================================================================
// Helpers Internos
// ============================================================================
function readChangedFilesList() {
  if (!fs.existsSync(CHANGED_FILES_PATH)) return [];
  return fs
    .readFileSync(CHANGED_FILES_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function execOrFail(cmd, args, { logger, env = process.env } = {}) {
  const status = runInteractive(cmd, args, { logger, env });
  if (status !== 0) {
    throw new Error(`Comando falhou com código ${status}: ${cmd} ${args.join(' ')}`);
  }
}

function readPrCiScope(logger) {
  const res = runCmd(process.execPath, ['build/pr-ci-scope.mjs'], { logger });
  if (!res.ok || !res.stdout) {
    throw new Error(`Falha ao executar build/pr-ci-scope.mjs: ${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

function collectTestFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFilesRecursively(fullPath));
    } else if (entry.isFile() && /\.test\./.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function resolveAffectedTargets(changedFiles) {
  const changedSrc = changedFiles.filter((f) => f.startsWith('src/'));
  const affected = [];
  const reasons = {};

  for (const definition of definitions) {
    const graph = await analyzeRuntimeGraph(definition.entry);
    const matches = changedSrc.filter((file) => graph.files.includes(file));
    if (matches.length > 0) {
      affected.push(definition.id);
      reasons[definition.id] = matches;
    }
  }

  const targets = [
    ...new Set(
      affected.flatMap((id) => {
        const def = definitions.find((d) => d.id === id);
        return def?.unified === false ? [id] : [id, 'unified'];
      }),
    ),
  ];

  return { changed: changedSrc, affected, reasons, targets };
}

// ============================================================================
// MODO 1: PLAN (Detecção de mudanças e escopo)
// ============================================================================
export async function planValidation() {
  const log = new AgentReporter('VALIDATE PLAN', process.env.EVENT_NAME || 'push');
  log.banner();

  return log.step('Detectar alterações e planejar escopo de validação', async (step) => {
    const { eventName, beforeSha, prBaseSha, prHeadSha, scope, prTitle } = resolveInputs({
      eventName: [process.env.EVENT_NAME, 'push'],
      beforeSha: [process.env.BEFORE_SHA],
      prBaseSha: [process.env.PR_BASE_SHA],
      prHeadSha: [process.env.PR_HEAD_SHA],
      scope: [process.env.SCOPE, 'changed'],
      prTitle: [process.env.PR_TITLE],
    });

    // 1. Escopo explícito via título do PR
    if (eventName === 'pull_request' && prTitle) {
      step.status('Verificando diretivas de escopo no título do PR...');
      const scopeData = readPrCiScope(log);
      setActionOutput('matrix', JSON.stringify(scopeData.matrix ?? []));

      if (scopeData.explicit === true) {
        setActionOutput('full', 'false');
        setActionOutput('run', 'true');
        step.pass('Escopo explícito detectado no título do PR', JSON.stringify(scopeData.matrix ?? []));
        log.summary({ Run: 'true', Full: 'false', Mode: 'explicit-pr-title' });
        return;
      }
    }

    // 2. Workflow dispatch com scope=all
    if (eventName === 'workflow_dispatch' && scope === 'all') {
      setActionOutput('full', 'true');
      setActionOutput('run', 'true');
      step.pass('Execução manual completa solicitada', 'scope=all');
      log.summary({ Run: 'true', Full: 'true', Mode: 'workflow_dispatch' });
      return;
    }

    // 3. Determinar commit base para comparação
    let base = '';
    if (eventName === 'workflow_dispatch' && scope === 'changed') {
      const rev = runCmd('git', ['rev-parse', 'HEAD^'], { silent: true });
      base = rev.ok ? rev.stdout : '';
    } else if (eventName === 'pull_request') {
      const mb = runCmd('git', ['merge-base', prBaseSha, prHeadSha], { silent: true });
      base = mb.ok ? mb.stdout : '';
    } else {
      base = beforeSha;
    }

    const commitExists =
      base &&
      !/^0+$/.test(base) &&
      runCmd('git', ['cat-file', '-e', `${base}^{commit}`], { silent: true }).ok;

    if (!commitExists) {
      setActionOutput('full', 'true');
      setActionOutput('run', 'true');
      step.warn('Commit base ausente ou histórico reescrito', 'Fallback para validação completa');
      log.summary({ Run: 'true', Full: 'true', Base: '(fallback)' });
      return;
    }

    // 4. Listar arquivos alterados
    const headRef = prHeadSha || 'HEAD';
    const diffRes = runCmd('git', ['diff', '--name-only', '--diff-filter=ACMRT', base, headRef], {
      logger: log,
    });

    const changedFiles = diffRes.ok && diffRes.stdout
      ? diffRes.stdout.split('\n').map((f) => f.trim()).filter(Boolean)
      : [];

    fs.writeFileSync(CHANGED_FILES_PATH, changedFiles.length ? `${changedFiles.join('\n')}\n` : '', 'utf8');

    if (changedFiles.length === 0) {
      setActionOutput('run', 'false');
      step.info('Nenhum arquivo alterado detectado', 'Validação ignorada');
      log.summary({ Run: 'false', Changed: '0' });
      return;
    }

    step.info(`${changedFiles.length} arquivo(s) alterado(s) detectado(s)`);
    for (const file of changedFiles.slice(0, 15)) {
      process.stdout.write(`    ${ansi.dim('•')} ${file}\n`);
    }
    if (changedFiles.length > 15) {
      process.stdout.write(`    ${ansi.dim(`... e mais ${changedFiles.length - 15} arquivo(s)`)}\n`);
    }

    if (!changedFiles.some((f) => RELEVANT_CHANGE_RE.test(f))) {
      setActionOutput('run', 'false');
      step.info('Apenas arquivos não-executáveis/docs alterados', 'Validação ignorada');
      log.summary({ Run: 'false', Changed: String(changedFiles.length) });
      return;
    }

    const isFull = changedFiles.some((f) => SHARED_INFRA_RE.test(f));
    setActionOutput('run', 'true');
    setActionOutput('full', String(isFull));

    step.pass('Plano gerado', `run=true · full=${isFull}`);
    log.summary({
      Run: 'true',
      Full: String(isFull),
      'Base SHA': base.slice(0, 7),
      Arquivos: String(changedFiles.length),
    });
  });
}

// ============================================================================
// MODO 2: RUN (Execução da validação seletiva ou completa)
// ============================================================================
export async function runValidation() {
  const isFull = process.env.FULL === 'true';
  const prTitle = process.env.PR_TITLE || '';
  const scopedBuildsMatrix = process.env.SCOPED_BUILDS_MATRIX === 'true';
  const scriptTestsSeparate = process.env.SCRIPT_TESTS_SEPARATE === 'true';

  const log = new AgentReporter('VALIDATE RUN', isFull ? 'Full Suite' : 'Selective');
  log.banner();

  // Ambiente mutável passado aos subprocessos (preserva comportamento do export/unset do bash)
  const childEnv = { ...process.env };

  // --------------------------------------------------------------------------
  // Ramo A: Escopo explícito definido no título do PR
  // --------------------------------------------------------------------------
  if (prTitle) {
    const scopeData = readPrCiScope(log);
    if (scopeData.explicit === true) {
      await log.step('Executar validação explícita definida no título do PR', async (step) => {
        step.info('Escopo explícito', JSON.stringify(scopeData));

        const scopedTests = Array.isArray(scopeData.tests) ? scopeData.tests : [];
        const scopedBuilds = Array.isArray(scopeData.builds) ? scopeData.builds : [];

        if (scopedBuilds.length > 0 && scopedBuilds[0] !== 'none') {
          if (scopedBuilds[0] === 'all') {
            execOrFail('npm', ['run', 'build'], { logger: log, env: childEnv });
            delete childEnv.RUNTIME_TEST_SKIP_DIST;
          } else if (!scopedBuildsMatrix) {
            execOrFail(process.execPath, ['build/build.mjs', `--targets=${scopedBuilds.join(',')}`], {
              logger: log,
              env: childEnv,
            });
          }
        }

        if (scopedTests.length > 0 && scopedTests[0] !== 'none') {
          // Mantém a política de executar apenas a suíte unitária no escopo explícito
          execOrFail('npm', ['run', 'test:unit'], { logger: log, env: childEnv });
        }

        appendStepSummary(
          [
            '### Explicit PR-title validation',
            '```json',
            JSON.stringify(scopeData, null, 2),
            '```',
            'Other required checks remain independently enforced.',
          ].join('\n'),
        );

        step.pass('Validação explícita concluída');
      });

      log.summary({ Mode: 'explicit-pr-title' });
      return;
    }
  }

  const changedFiles = readChangedFilesList();
  const hasChangedManifest = fs.existsSync(CHANGED_FILES_PATH);

  // --------------------------------------------------------------------------
  // Ramo B: Infraestrutura compartilhada alterada (FULL=true)
  // --------------------------------------------------------------------------
  if (isFull) {
    await log.step('Validação completa (infraestrutura compartilhada alterada)', async (step) => {
      execOrFail('npm', ['run', 'typecheck'], { logger: log, env: childEnv });

      if (hasChangedManifest) {
        execOrFail(
          process.execPath,
          ['build/check-style.mjs', '--changed', `--files-from=${CHANGED_FILES_PATH}`],
          { logger: log, env: childEnv },
        );
      } else {
        execOrFail('npm', ['run', 'lint'], { logger: log, env: childEnv });
      }

      childEnv.RUNTIME_TEST_SKIP_DIST = 'true';

      const bundlerChanged =
        !hasChangedManifest || changedFiles.some((f) => BUNDLER_OR_CONFIG_RE.test(f));

      if (!bundlerChanged) {
        step.status('Resolvendo userscripts afetados pelo grafo de runtime...');
        const report = await resolveAffectedTargets(changedFiles);
        step.info('Builds afetados', report.targets.join(', ') || '(nenhum)');

        if (report.targets.length > 0) {
          execOrFail(
            process.execPath,
            ['build/build.mjs', `--targets=${report.targets.join(',')}`],
            { logger: log, env: childEnv },
          );
        }
      } else {
        step.info('Bundler ou configuração alterada', 'Compilando todos os userscripts');
        execOrFail('npm', ['run', 'build'], { logger: log, env: childEnv });
        delete childEnv.RUNTIME_TEST_SKIP_DIST;
      }

      execOrFail('npm', ['run', 'test:unit'], { logger: log, env: childEnv });
      execOrFail('npm', ['run', 'test:lab'], { logger: log, env: childEnv });
      execOrFail(process.execPath, ['build/hosting.mjs'], { logger: log, env: childEnv });

      step.pass('Validação completa finalizada');
    });

    log.summary({ Mode: 'full', Arquivos: String(changedFiles.length) });
    return;
  }

  // --------------------------------------------------------------------------
  // Ramo C: Validação seletiva por arquivo/grafo (FULL=false)
  // --------------------------------------------------------------------------
  let sourceChanged = false;
  let buildNeeded = false;
  let labChanged = false;
  let hostingChanged = false;

  for (const file of changedFiles) {
    if (file.startsWith('src/')) {
      sourceChanged = true;
      buildNeeded = true;
    } else if (file.startsWith('labs/')) {
      labChanged = true;
    } else if (file.startsWith('playground/') || file.startsWith('public/')) {
      hostingChanged = true;
      buildNeeded = true;
    }
  }

  const changedTests = changedFiles.filter((f) => TEST_FILE_RE.test(f));
  const hasIntegrationTest = changedTests.some((f) => INTEGRATION_TEST_RE.test(f));
  if (hasIntegrationTest) {
    buildNeeded = true;
  }

  // C.1 Typecheck & Style
  if (sourceChanged) {
    await log.step('Typecheck e análise de estilo dos arquivos alterados', async (step) => {
      execOrFail('npm', ['run', 'typecheck'], { logger: log, env: childEnv });

      if (hasChangedManifest) {
        execOrFail(
          process.execPath,
          ['build/check-style.mjs', '--changed', `--files-from=${CHANGED_FILES_PATH}`],
          { logger: log, env: childEnv },
        );
      } else {
        execOrFail('npm', ['run', 'lint'], { logger: log, env: childEnv });
      }
      step.pass('Typecheck & lint aprovados');
    });

    // C.2 Análise de grafo transitivo
    await log.step('Resolver dependências transitivas no grafo de runtime', async (step) => {
      const report = await resolveAffectedTargets(changedFiles);
      fs.writeFileSync(AFFECTED_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

      step.pass('Userscripts afetados', report.affected.join(', ') || '(nenhum match no grafo)');

      const summaryLines = [
        '#### Dependency graph',
        ...report.affected.map(
          (id) => `- \`${id}\` ← ${report.reasons[id].map((f) => `\`${f}\``).join(', ')}`,
        ),
      ];
      appendStepSummary(summaryLines.join('\n'));
    });
  }

  // C.3 Build seletivo ou completo
  childEnv.RUNTIME_TEST_SKIP_DIST = 'true';

  if (buildNeeded) {
    await log.step('Compilar bundles afetados', async (step) => {
      if (sourceChanged && fs.existsSync(AFFECTED_REPORT_PATH) && !hasIntegrationTest) {
        const report = JSON.parse(fs.readFileSync(AFFECTED_REPORT_PATH, 'utf8'));
        if (report.targets.length > 0) {
          step.info('Targets selecionados', report.targets.join(', '));
          execOrFail(
            process.execPath,
            ['build/build.mjs', `--targets=${report.targets.join(',')}`],
            { logger: log, env: childEnv },
          );
        } else {
          step.info('Nenhum entrypoint afetado', 'Build de bundles ignorado');
        }
      } else {
        step.info('Build completo necessário', hasIntegrationTest ? 'Testes de integração detectados' : 'Hosting/Assets alterados');
        execOrFail('npm', ['run', 'build'], { logger: log, env: childEnv });
        delete childEnv.RUNTIME_TEST_SKIP_DIST;
      }
      step.pass('Etapa de build concluída');
    });
  }

  // C.4 Seleção de testes relacionados
  const selectedTestsSet = new Set(changedTests);

  if (sourceChanged) {
    const changedSources = changedFiles.filter((f) => f.startsWith('src/'));
    if (changedSources.length > 0) {
      const vitestRes = runCmd(
        'npx',
        [
          'vitest',
          'related',
          ...changedSources,
          '--listTests',
          '--passWithNoTests',
          '--exclude',
          '**/runtime-startup-benchmark.test.js',
        ],
        { logger: log },
      );

      if (vitestRes.stdout) {
        for (const line of vitestRes.stdout.split('\n')) {
          const normalized = line.trim().replace(/^.*(\/tests\/)/, 'tests/');
          if (TEST_FILE_RE.test(normalized)) {
            selectedTestsSet.add(normalized);
          }
        }
      }
    }

    if (fs.existsSync(AFFECTED_REPORT_PATH)) {
      const report = JSON.parse(fs.readFileSync(AFFECTED_REPORT_PATH, 'utf8'));
      for (const id of report.affected || []) {
        const userTestDir = path.posix.join('tests/userscripts', id);
        for (const testFile of collectTestFilesRecursively(userTestDir)) {
          selectedTestsSet.add(testFile);
        }
      }
    }
  }

  let uniqueTests = [...selectedTestsSet]
    .map((t) => t.replace(/^.*(\/tests\/)/, 'tests/'))
    .sort();

  if (scriptTestsSeparate) {
    uniqueTests = uniqueTests.filter((t) => !/^tests\/userscripts\/[^/]+\//.test(t));
  }

  if (uniqueTests.length > 0) {
    await log.step(`Executar suíte de testes (${uniqueTests.length} candidato(s))`, async (step) => {
      step.info('Testes selecionados', uniqueTests.join(', '));
      execOrFail('npm', ['run', 'test:unit'], { logger: log, env: childEnv });
      step.pass('Testes unitários aprovados');
    });
  }

  if (labChanged) {
    await log.step('Executar testes de laboratório (test:lab)', async (step) => {
      execOrFail('npm', ['run', 'test:lab'], { logger: log, env: childEnv });
      step.pass('Testes de lab aprovados');
    });
  }

  if (hostingChanged) {
    await log.step('Atualizar artefatos de hosting', async (step) => {
      execOrFail(process.execPath, ['build/hosting.mjs'], { logger: log, env: childEnv });
      step.pass('Hosting atualizado');
    });
  }

  // Step Summary final
  appendStepSummary(
    [
      '### Selective validation',
      '| Check | Enabled |',
      '|---|---|',
      `| Typecheck and lint | ${sourceChanged} |`,
      `| Build | ${buildNeeded} |`,
      `| Vitest candidates | ${selectedTestsSet.size} |`,
      `| Lab | ${labChanged} |`,
      `| Hosting | ${hostingChanged} |`,
      '',
      'Changed files:',
      ...changedFiles.map((f) => `- \`${f}\``),
    ].join('\n'),
  );

  log.summary({
    'Typecheck/Lint': String(sourceChanged),
    Build: String(buildNeeded),
    'Testes Candidatos': String(uniqueTests.length),
    Lab: String(labChanged),
    Hosting: String(hostingChanged),
  });
}

// ============================================================================
// CLI Entrypoint
// ============================================================================
const COMMANDS = {
  plan: planValidation,
  run: runValidation,
};

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const mode = args._[0] || 'run';
  const handler = COMMANDS[mode];

  if (!handler) {
    console.error('Usage: node build/validate-changed.mjs <plan|run>');
    process.exit(2);
  }

  await handler();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
