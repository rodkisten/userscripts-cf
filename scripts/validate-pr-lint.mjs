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
} from './utils.mjs';

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
export async function runAutofix() {
  const log = new AgentReporter('AUTO-FIX AGENT', 'ESLint & Prettier');
  log.banner();

  return log.step('Executar auto-fix e sincronizar commit no PR', async (step) => {
    const { hasPrettier, hasEslint, prBranch, baseSha, headSha } = resolveInputs({
      hasPrettier: [process.env.HAS_PRETTIER],
      hasEslint: [process.env.HAS_ESLINT],
      prBranch: [process.env.PR_BRANCH, process.env.GITHUB_HEAD_REF],
      baseSha: [process.env.PR_BASE_SHA],
      headSha: [process.env.PR_HEAD_SHA],
    });

    const jsTsFiles = fs.existsSync(STATE_FILES.jsTs)
      ? readLines(STATE_FILES.jsTs)
      : getChangedFiles(baseSha, headSha, 'ACMRT').filter((f) => JS_TS_REGEX.test(f));

    const prettierTargets = fs.existsSync(STATE_FILES.prettier)
      ? readLines(STATE_FILES.prettier)
      : getChangedFiles(baseSha, headSha, 'ACMRT').filter((f) => PRETTIER_REGEX.test(f));

    const toolsUsed = [];

    if (hasEslint === 'true' && jsTsFiles.length > 0) {
      step.status(`Rodando ESLint --fix em ${jsTsFiles.length} arquivo(s)...`);
      runCmd('npx', ['eslint', '--fix', '--quiet', ...jsTsFiles]);
      toolsUsed.push('ESLint (`--fix`)');
    }

    if (hasPrettier === 'true' && prettierTargets.length > 0) {
      step.status(`Rodando Prettier --write em ${prettierTargets.length} arquivo(s)...`);
      runCmd('npx', ['prettier', '--write', '--loglevel', 'silent', ...prettierTargets]);
      toolsUsed.push('Prettier (`--write`)');
    }

    const status = runCmd('git', ['status', '--porcelain', '--untracked-files=no']);
    if (!status.stdout) {
      step.info('Nenhuma alteração necessária', 'Todos os arquivos já estavam formatados');
      setActionOutput('committed', 'false');
      log.summary({ Committed: 'false' });
      return;
    }

    const numstat = runCmd('git', ['diff', '--numstat']).stdout;
    const patch = runCmd('git', ['diff']).stdout;
    fs.writeFileSync(STATE_FILES.numstat, `${numstat}\n`, 'utf8');
    fs.writeFileSync(STATE_FILES.patch, `${patch}\n`, 'utf8');

    step.status(`Commitando e enviando ajustes para ${prBranch}...`);
    runCmd('git', ['config', 'user.name', 'github-actions[bot]']);
    runCmd('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    runCmd('git', ['add', '-u']);

    const commitRes = runCmd('git', ['commit', '-m', 'style: auto-fix formatting and lint on changed files']);
    if (!commitRes.ok) {
      throw new Error(`Falha ao criar commit de auto-fix: ${commitRes.stderr}`);
    }

    const pullRes = runCmd('git', ['pull', '--rebase', '--autostash', 'origin', prBranch]);
    if (!pullRes.ok) {
      throw new Error(`Falha no git pull --rebase origin ${prBranch}: ${pullRes.stderr}`);
    }

    const pushRes = runCmd('git', ['push', 'origin', `HEAD:${prBranch}`]);
    if (!pushRes.ok) {
      throw new Error(`Falha no git push origin HEAD:${prBranch}: ${pushRes.stderr}`);
    }

    const commitSha = runCmd('git', ['rev-parse', 'HEAD']).stdout;
    const shortSha = runCmd('git', ['rev-parse', '--short', 'HEAD']).stdout;
    const toolsStr = toolsUsed.join(' + ');

    setActionOutput('committed', 'true');
    setActionOutput('commit_sha', commitSha);
    setActionOutput('short_sha', shortSha);
    setActionOutput('tools_used', toolsStr);

    step.pass('Auto-fix enviado', `${ansi.cyan(shortSha)} → ${prBranch}`);
    log.summary({
      Committed: 'true',
      Commit: shortSha,
      Ferramentas: toolsStr,
    });
  });
}

// ============================================================================
// 3. Publicar ou atualizar comentário com o diff do auto-fix no PR
// ============================================================================
export async function commentAutofix() {
  const log = new AgentReporter('AUTO-FIX COMMENT', 'Pull Request');
  log.banner();

  return log.step('Publicar detalhes do auto-fix no PR', async (step) => {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GH_TOKEN / GITHUB_TOKEN não definido.');

    const context = buildCliContext();
    const {
      repoFull,
      prNumber,
      prBranch,
      commitSha,
      shortSha,
      toolsUsed,
    } = resolveInputs({
      repoFull: [process.env.REPO, process.env.GITHUB_REPOSITORY],
      prNumber: [process.env.PR_NUMBER, String(context.issue.number || '')],
      prBranch: [process.env.PR_BRANCH, process.env.GITHUB_HEAD_REF],
      commitSha: [process.env.COMMIT_SHA],
      shortSha: [process.env.SHORT_SHA],
      toolsUsed: [process.env.TOOLS_USED],
    });

    const [owner, repo] = repoFull.split('/');
    const marker = '<!-- autofix-bot-comment -->';

    const numstatLines = fs.existsSync(STATE_FILES.numstat)
      ? fs.readFileSync(STATE_FILES.numstat, 'utf8').trim().split('\n').filter(Boolean)
      : [];

    let totalAdded = 0;
    let totalRemoved = 0;
    const tableRows = ['| Arquivo | Adições | Remoções |', '| :--- | :---: | :---: |'];

    for (const line of numstatLines) {
      const [addedRaw, removedRaw, file] = line.split('\t');
      const added = Number.parseInt(addedRaw, 10) || 0;
      const removed = Number.parseInt(removedRaw, 10) || 0;
      totalAdded += added;
      totalRemoved += removed;
      tableRows.push(`| \`${file}\` | \`+${addedRaw}\` | \`-${removedRaw}\` |`);
    }

    const rawPatch = fs.existsSync(STATE_FILES.patch) ? fs.readFileSync(STATE_FILES.patch, 'utf8') : '';
    const maxBytes = 55_000;
    const patchBuffer = Buffer.from(rawPatch, 'utf8');
    const isTruncated = patchBuffer.byteLength > maxBytes;
    const diffContent = isTruncated ? patchBuffer.subarray(0, maxBytes).toString('utf8') : rawPatch;

    const truncatedNote = isTruncated
      ? `\n\n> ⚠️ *Diff truncado devido ao tamanho. Veja todas as alterações diretamente no commit [\`${shortSha}\`](https://github.com/${repoFull}/commit/${commitSha}).*`
      : '';

    const nowUtc = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

    const body = [
      marker,
      '## 🪄 Auto-fix aplicado automaticamente',
      '',
      `Foram detectados ajustes de formatação/lint nos arquivos modificados deste Pull Request. O último commit automático foi enviado diretamente para a branch **\`${prBranch}\`**.`,
      '',
      '### 📋 Resumo da execução',
      `* **Último commit:** [\`${shortSha}\`](https://github.com/${repoFull}/commit/${commitSha})`,
      `* **Ferramentas executadas:** ${toolsUsed}`,
      `* **Arquivos alterados neste ciclo:** **${numstatLines.length}** (\`+${totalAdded}\` / \`-${totalRemoved}\` linhas)`,
      '',
      '### 📂 Arquivos modificados',
      ...tableRows,
      '',
      '<details>',
      '<summary>🔍 <b>Visualizar diff completo das alterações</b></summary>',
      '',
      '```diff',
      diffContent.trimEnd(),
      '```' + truncatedNote,
      '',
      '</details>',
      '',
      '---',
      `<sub>🤖 *Gerado automaticamente pelo workflow \`Validate changed userscripts\` • Atualizado em ${nowUtc}.*</sub>`,
    ].join('\n');

    step.status(`Enviando comentário para PR #${prNumber}...`);
    const github = createNativeGithubClient(token);
    const result = await upsertMarkedComment({
      github,
      owner,
      repo,
      issueNumber: Number(prNumber),
      marker,
      body,
    });

    // Limpa arquivos temporários
    for (const tmp of [STATE_FILES.numstat, STATE_FILES.patch]) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }

    step.pass(`Comentário ${result.action === 'updated' ? 'atualizado' : 'criado'}`, `ID #${result.commentId}`);
    log.summary({
      PR: `#${prNumber}`,
      Arquivos: String(numstatLines.length),
      Linhas: `+${totalAdded} / -${totalRemoved}`,
    });
  });
}

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
  'autofix': runAutofix,
  'comment-autofix': commentAutofix,
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
