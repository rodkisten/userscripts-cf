import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentReporter, ansi } from './utils/ci-logger.mjs';
import {
  appendStepSummary,
  buildCliContext,
  createNativeGithubClient,
  getChangedFiles,
  hasPackageTool,
  parseCliArgs,
  resolveInputs,
  runCmd,
  runInteractive,
  setActionOutput,
  upsertMarkedComment,
} from './utils/ci-utils.mjs';

const JS_TS_REGEX = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/;
const CSS_REGEX = /\.css$/;
const PRETTIER_REGEX = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts|css|scss|json|jsonc|md|mdx|ya?ml|html)$/;

const STATE_FILES = {
  jsTs: '.changed_js_ts_files.txt',
  css: '.changed_css_files.txt',
  prettier: '.changed_prettier_files.txt',
  numstat: '.autofix_numstat.txt',
  patch: '.autofix_patch.diff',
};

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((f) => f && fs.existsSync(f));
}

function writeLines(filePath, items) {
  fs.writeFileSync(filePath, items.length ? `${items.join('\n')}\n` : '', 'utf8');
}

// ============================================================================
// 1. Detectar arquivos modificados e linters instalados
// ============================================================================
export async function detectLint() {
  const log = new AgentReporter('LINT DETECTOR', 'PR Scope');
  log.banner();

  return log.step('Detectar arquivos modificados e ferramentas de lint', async (step) => {
    const { baseSha, headSha } = resolveInputs({
      baseSha: [process.env.PR_BASE_SHA],
      headSha: [process.env.PR_HEAD_SHA],
    });

    const allChanged = getChangedFiles(baseSha, headSha, 'ACMRT');
    const jsTsFiles = allChanged.filter((f) => JS_TS_REGEX.test(f));
    const cssFiles = allChanged.filter((f) => CSS_REGEX.test(f));
    const prettierFiles = allChanged.filter((f) => PRETTIER_REGEX.test(f));

    const rootDir = process.cwd();
    const hasPrettier = hasPackageTool(rootDir, 'prettier');
    const hasEslint = hasPackageTool(rootDir, 'eslint');

    writeLines(STATE_FILES.jsTs, jsTsFiles);
    writeLines(STATE_FILES.css, cssFiles);
    writeLines(STATE_FILES.prettier, prettierFiles);

    setActionOutput('has_js_ts', jsTsFiles.length > 0);
    setActionOutput('has_css', cssFiles.length > 0);
    setActionOutput('has_prettier_targets', prettierFiles.length > 0);
    setActionOutput('has_prettier', hasPrettier);
    setActionOutput('has_eslint', hasEslint);

    step.pass('Arquivos mapeados', `JS/TS: ${jsTsFiles.length} · CSS: ${cssFiles.length} · Prettier: ${prettierFiles.length}`);
    step.info('Ferramentas', `ESLint: ${hasEslint ? 'ativo' : 'ausente'} · Prettier: ${hasPrettier ? 'ativo' : 'ausente'}`);

    log.summary({
      'JS/TS': String(jsTsFiles.length),
      'CSS': String(cssFiles.length),
      'Prettier Targets': String(prettierFiles.length),
    });
  });
}

// ============================================================================
// 2. Aplicar auto-fix silencioso (ESLint + Prettier) e commitar na branch do PR
// ============================================================================
// Substitua runAutofix e commentAutofix por esta função unificada em scripts/validate-pr-lint.mjs:

export async function lintFixAndGate() {
  const log = new AgentReporter('AUTO-FIX & GATE', 'ESLint & Prettier');
  log.banner();

  return log.step('Verificar, corrigir lint/formatação e sincronizar PR', async (step) => {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const context = buildCliContext();

    const {
      hasPrettier,
      hasEslint,
      prBranch,
      baseSha,
      headSha,
      prNumber,
      repoFull,
    } = resolveInputs({
      hasPrettier: [process.env.HAS_PRETTIER],
      hasEslint: [process.env.HAS_ESLINT],
      prBranch: [process.env.PR_BRANCH, process.env.GITHUB_HEAD_REF],
      baseSha: [process.env.PR_BASE_SHA],
      headSha: [process.env.PR_HEAD_SHA],
      prNumber: [process.env.PR_NUMBER, String(context.issue.number || '')],
      repoFull: [process.env.REPO, process.env.GITHUB_REPOSITORY],
    });

    const changedFiles = getChangedFiles(baseSha, headSha, 'ACMRT');
    const jsTsFiles = changedFiles.filter((f) => JS_TS_REGEX.test(f));
    const prettierTargets = changedFiles.filter((f) => PRETTIER_REGEX.test(f));

    const toolsUsed = [];
    const diagnostics = [];

    // 1. Captura diagnóstico inicial + aplica ESLint --fix
    if (hasEslint === 'true' && jsTsFiles.length > 0) {
      step.status(`Analisando e corrigindo ESLint em ${jsTsFiles.length} arquivo(s)...`);
      const eslintRes = runCmd('npx', ['eslint', '--fix', '--format', 'compact', ...jsTsFiles], {
        logger: log,
      });
      if (!eslintRes.ok && eslintRes.stdout) {
        diagnostics.push(`### ESLint\n\`\`\`text\n${eslintRes.stdout.slice(0, 8000)}\n\`\`\``);
      }
      toolsUsed.push('ESLint (`--fix`)');
    }

    // 2. Captura diagnóstico inicial + aplica Prettier --write
    if (hasPrettier === 'true' && prettierTargets.length > 0) {
      step.status(`Formatando com Prettier ${prettierTargets.length} arquivo(s)...`);
      const checkRes = runCmd('npx', ['prettier', '--list-different', ...prettierTargets], {
        silent: true,
      });
      if (!checkRes.ok && checkRes.stdout) {
        diagnostics.push(`### Prettier (arquivos fora do padrão)\n\`\`\`text\n${checkRes.stdout}\n\`\`\``);
      }
      runCmd('npx', ['prettier', '--write', '--loglevel', 'silent', ...prettierTargets], {
        logger: log,
      });
      toolsUsed.push('Prettier (`--write`)');
    }

    // 3. Verifica se o auto-fix modificou algum arquivo
    const status = runCmd('git', ['status', '--porcelain', '--untracked-files=no'], { silent: true });

    if (!status.stdout) {
      // Nenhum arquivo foi auto-corrigido, mas podem existir erros de ESLint não auto-corrigíveis
      if (diagnostics.length > 0) {
        step.warn('Erros de lint não auto-corrigíveis detectados');
        setActionOutput('committed', 'false');
        setActionOutput('has_unfixed_errors', 'true');
        log.summary('warn', { Committed: 'false', 'Unfixed Lint': 'true' });
        process.exitCode = 1;
        return;
      }

      step.pass('Nenhum erro de lint ou formatação encontrado');
      setActionOutput('committed', 'false');
      setActionOutput('has_unfixed_errors', 'false');
      log.summary('success', { Committed: 'false' });
      return;
    }

    // 4. Coleta estatísticas e diff antes de commitar
    const numstatLines = runCmd('git', ['diff', '--numstat'], { silent: true })
      .stdout.split('\n')
      .filter(Boolean);
    const rawPatch = runCmd('git', ['diff'], { silent: true }).stdout;

    // 5. Commita e faz push na branch do PR
    step.status(`Enviando commit de auto-fix para ${prBranch}...`);
    runCmd('git', ['config', 'user.name', 'github-actions[bot]'], { silent: true });
    runCmd('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], {
      silent: true,
    });
    runCmd('git', ['add', '-u'], { silent: true });

    const commitRes = runCmd(
      'git',
      ['commit', '-m', 'style: auto-fix formatting and lint on changed files'],
      { logger: log },
    );
    if (!commitRes.ok) {
      throw new Error(`Falha ao criar commit de auto-fix: ${commitRes.stderr}`);
    }

    const pullRes = runCmd('git', ['pull', '--rebase', '--autostash', 'origin', prBranch], { logger: log });
    if (!pullRes.ok) {
      throw new Error(`Falha no git pull --rebase origin ${prBranch}: ${pullRes.stderr}`);
    }

    const pushRes = runCmd('git', ['push', 'origin', `HEAD:${prBranch}`], { logger: log });
    if (!pushRes.ok) {
      throw new Error(`Falha no git push origin HEAD:${prBranch}: ${pushRes.stderr}`);
    }

    const commitSha = runCmd('git', ['rev-parse', 'HEAD'], { silent: true }).stdout;
    const shortSha = runCmd('git', ['rev-parse', '--short', 'HEAD'], { silent: true }).stdout;
    const toolsStr = toolsUsed.join(' + ');

    // 6. Publica/atualiza o comentário no PR explicando o ciclo
    if (token && prNumber && repoFull) {
      const [owner, repo] = repoFull.split('/');
      const marker = '<!-- autofix-bot-comment -->';

      let totalAdded = 0;
      let totalRemoved = 0;
      const tableRows = ['| Arquivo | Adições | Remoções |', '| :--- | :---: | :---: |'];

      for (const line of numstatLines) {
        const [addedRaw, removedRaw, file] = line.split('\t');
        totalAdded += Number.parseInt(addedRaw, 10) || 0;
        totalRemoved += Number.parseInt(removedRaw, 10) || 0;
        tableRows.push(`| \`${file}\` | \`+${addedRaw}\` | \`-${removedRaw}\` |`);
      }

      const maxBytes = 45_000;
      const patchBuf = Buffer.from(rawPatch, 'utf8');
      const diffContent = patchBuf.byteLength > maxBytes
        ? patchBuf.subarray(0, maxBytes).toString('utf8')
        : rawPatch;

      const truncatedNote =
        patchBuf.byteLength > maxBytes
          ? `\n\n> ⚠️ *Diff truncado. Veja todas as alterações no commit [\`${shortSha}\`](https://github.com/${repoFull}/commit/${commitSha}).*`
          : '';

      const diagnosticsSection = diagnostics.length
        ? [
            '<details>',
            '<summary>🚨 <b>Problemas de lint/formatação detectados antes da correção</b></summary>',
            '',
            ...diagnostics,
            '</details>',
            '',
          ].join('\n')
        : '';

      const body = [
        marker,
        '## 🪄 Auto-fix de Lint & Formatação Aplicado',
        '',
        '> [!NOTE]',
        `> Foram encontrados problemas de lint/formatação nos arquivos alterados. O auto-fix foi executado, commitado na branch **\`${prBranch}\`** e **este workflow será executado novamente automaticamente** no novo commit.`,
        '',
        '### 📋 Resumo da Ação',
        `* **Commit criado:** [\`${shortSha}\`](https://github.com/${repoFull}/commit/${commitSha})`,
        `* **Ferramentas executadas:** ${toolsStr}`,
        `* **Arquivos corrigidos:** **${numstatLines.length}** (\`+${totalAdded}\` / \`-${totalRemoved}\` linhas)`,
        '',
        diagnosticsSection,
        '### 📂 Arquivos Modificados',
        ...tableRows,
        '',
        '<details>',
        '<summary>🔍 <b>Visualizar diff aplicado pelo auto-fix</b></summary>',
        '',
        '```diff',
        diffContent.trimEnd(),
        '```' + truncatedNote,
        '',
        '</details>',
        '',
        '---',
        `<sub>🤖 *Atualizado em ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC • Aguardando nova execução do CI no commit \`${shortSha}\`.*</sub>`,
      ]
        .filter(Boolean)
        .join('\n');

      const github = createNativeGithubClient(token);
      await upsertMarkedComment({
        github,
        owner,
        repo,
        issueNumber: Number(prNumber),
        marker,
        body,
      });
    }

    setActionOutput('committed', 'true');
    setActionOutput('commit_sha', commitSha);
    setActionOutput('short_sha', shortSha);

    step.warn(
      'Auto-fix commitado; encerrando execução atual para aguardar o novo commit',
      `${ansi.cyan(shortSha)} → ${prBranch}`,
    );

    log.summary('warn', {
      Commit: shortSha,
      Branch: prBranch,
      Status: 'Aguardando re-execução do workflow',
    });

    // Encerra o step atual com falha controlada para abortar steps seguintes deste run
    process.exitCode = 1;
  });
}

// ============================================================================
// 3. Publicar ou atualizar comentário com o diff do auto-fix no PR
// ============================================================================

// ============================================================================
// 4. Diagnóstico não-bloqueante de Prettier & ESLint
// ============================================================================
export async function checkFormat() {
  const log = new AgentReporter('LINT DIAGNOSTICS', 'PR Changed Files');
  log.banner();

  return log.step('Verificar formatação (Prettier) e lint (ESLint)', async (step) => {
    const { eventName, baseSha, headSha, hasPrettier, hasEslint } = resolveInputs({
      eventName: [process.env.EVENT_NAME, process.env.GITHUB_EVENT_NAME],
      baseSha: [process.env.PR_BASE_SHA],
      headSha: [process.env.PR_HEAD_SHA],
      hasPrettier: [process.env.HAS_PRETTIER, 'true'],
      hasEslint: [process.env.HAS_ESLINT, 'false'],
    });

    let changedFiles = [];
    if (eventName === 'pull_request') {
      changedFiles = getChangedFiles(baseSha, headSha, 'ACMRT');
    } else if (fs.existsSync('changed-files.txt')) {
      changedFiles = readLines('changed-files.txt');
    } else {
      step.info('Manifesto ausente', 'Nenhum arquivo alterado detectado; pulando diagnóstico.');
      return;
    }

    const prettierFiles = changedFiles.filter((f) => PRETTIER_REGEX.test(f));
    const eslintFiles = changedFiles.filter((f) => JS_TS_REGEX.test(f));

    step.info('Alvos encontrados', `Prettier: ${prettierFiles.length} · ESLint: ${eslintFiles.length}`);

    let exitCode = 0;

    if (hasPrettier === 'true' && prettierFiles.length > 0) {
      step.status(`Executando Prettier --check (${prettierFiles.length} arquivo(s))...`);
      const code = runInteractive('npx', ['prettier', '--check', '--ignore-unknown', ...prettierFiles]);
      if (code !== 0) exitCode = code;
    }

    if (hasEslint === 'true' && eslintFiles.length > 0) {
      step.status(`Executando ESLint (${eslintFiles.length} arquivo(s))...`);
      const code = runInteractive('npx', ['eslint', ...eslintFiles]);
      if (code !== 0) exitCode = code;
    }

    if (exitCode !== 0) {
      appendStepSummary(
        [
          '### ⚠️ Formatting or lint differences detected (non-blocking)',
          'Prettier/ESLint diagnostics found remaining issues after auto-fix.',
          'Tests and release validation continue independently.',
        ].join('\n'),
      );
      step.warn('Diagnóstico encontrou avisos', `Exit code ${exitCode} (não-bloqueante)`);
      process.exitCode = exitCode;
      return;
    }

    step.pass('Formatação e lint validados sem pendências');
    log.summary({
      Prettier: String(prettierFiles.length),
      ESLint: String(eslintFiles.length),
    });
  });
}

// ============================================================================
// CLI Entrypoint
// ============================================================================
const COMMANDS = {
  'detect-lint': detectLint,
  'fix-and-gate': lintFixAndGate,
  'check-format': checkFormat,
};

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  const command = args._[0];
  const handler = COMMANDS[command];

  if (!handler) {
    console.error(`Uso: node scripts/validate-pr-lint.mjs <${Object.keys(COMMANDS).join('|')}>`);
    process.exit(1);
  }

  await handler();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
