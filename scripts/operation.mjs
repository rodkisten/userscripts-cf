import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AgentReporter, ansi } from './utils/ci-logger.mjs';
import {
  buildCliContext,
  configureGitBotUser,
  createNativeGithubClient,
  createSummaryWriter,
  parseCliArgs,
  resolveInputs,
  runCmd,
  setActionOutput,
  upsertMarkedComment,
} from './utils/ci-utils.mjs';

const MAX_OUTPUT_CHARS = 35_000;

function readPackageJson(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return {};
  }
}

function detectPackageManager(rootDir, pkg) {
  const pmField = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
  if (pmField.startsWith('pnpm@') || fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (pmField.startsWith('yarn@') || fs.existsSync(path.join(rootDir, 'yarn.lock'))) return 'yarn';
  if (
    pmField.startsWith('bun@') ||
    fs.existsSync(path.join(rootDir, 'bun.lockb')) ||
    fs.existsSync(path.join(rootDir, 'bun.lock'))
  ) {
    return 'bun';
  }
  return 'npm';
}

function normalizeFlagsForPm(rawPackages, pm) {
  const tokens = rawPackages.trim().split(/\s+/).filter(Boolean);
  return tokens
    .map((tok) => {
      if (pm === 'yarn' || pm === 'pnpm') {
        if (tok === '--save-dev') return '-D';
        if (tok === '--save-exact') return '-E';
      }
      return tok;
    })
    .join(' ');
}

function buildPackageCommand(pm, operation, rawPackages) {
  const pkgs = normalizeFlagsForPm(rawPackages, pm);

  if (operation === 'install') {
    if (!pkgs) return `${pm} install`;
    if (pm === 'npm') return `npm install ${pkgs}`;
    return `${pm} add ${pkgs}`;
  }

  if (operation === 'add') {
    if (!pkgs) throw new Error('O campo "packages" é obrigatório para a operação "add".');
    return pm === 'npm' ? `npm install ${pkgs}` : `${pm} add ${pkgs}`;
  }

  if (operation === 'update') {
    if (pm === 'yarn') return pkgs ? `yarn upgrade ${pkgs}` : 'yarn upgrade';
    return pkgs ? `${pm} update ${pkgs}` : `${pm} update`;
  }

  if (operation === 'uninstall') {
    if (!pkgs) throw new Error('O campo "packages" é obrigatório para a operação "uninstall".');
    return pm === 'npm' ? `npm uninstall ${pkgs}` : `${pm} remove ${pkgs}`;
  }

  throw new Error(`Operação desconhecida: ${operation}`);
}

/**
 * Resolve o comando final suportando:
 * 1) operation === 'custom' OU somente customCommandInput preenchido (packages vazio) -> roda apenas o comando custom
 * 2) comando direto digitado no campo packages (ex: "pnpm add zod" ou "npx vitest -u")
 * 3) pacotes + comando bash encadeado (ex: "zod -D && npm run build" ou packages + custom-command)
 */
function resolveExecutionPlan({ pm, operation, packagesInput, customCommandInput }) {
  const rawPkg = packagesInput.trim();
  const rawCustom = customCommandInput.trim();

  if (operation === 'custom' || (rawCustom && !rawPkg)) {
    const cmd = rawCustom || rawPkg;
    if (!cmd) {
      throw new Error('Informe o comando em "custom-command" (ou em "packages").');
    }
    return {
      command: cmd,
      modeLabel: 'Custom Shell Command',
      isCustomOnly: true,
    };
  }

  const looksLikeFullCommand = /^(npm|pnpm|yarn|bun|npx|pnpx|bunx|node|git|sh|bash|\.\/)\b/.test(rawPkg);
  if (looksLikeFullCommand) {
    const combined = rawCustom ? `${rawPkg} && ${rawCustom}` : rawPkg;
    return {
      command: combined,
      modeLabel: 'Inline Command',
      isCustomOnly: false,
    };
  }

  const chainMatch = rawPkg.match(/^([^&;|]+?)\s*(&&|\|\||;)\s*(.+)$/);
  if (chainMatch) {
    const [, pkgPart, operator, trailingShell] = chainMatch;
    const basePkgCmd = buildPackageCommand(pm, operation, pkgPart);
    const fullCmd = rawCustom
      ? `${basePkgCmd} ${operator} ${trailingShell} && ${rawCustom}`
      : `${basePkgCmd} ${operator} ${trailingShell}`;

    return {
      command: fullCmd,
      modeLabel: `${pm.toUpperCase()} ${operation} + Shell`,
      isCustomOnly: false,
    };
  }

  const basePkgCmd = buildPackageCommand(pm, operation, rawPkg);
  const fullCmd = rawCustom ? `${basePkgCmd} && ${rawCustom}` : basePkgCmd;

  return {
    command: fullCmd,
    modeLabel: rawCustom ? `${pm.toUpperCase()} ${operation} + Shell` : `${pm.toUpperCase()} ${operation}`,
    isCustomOnly: false,
  };
}

function runShellCommand(command, cwd) {
  const started = performance.now();
  const res = spawnSync('bash', ['-eo', 'pipefail', '-c', command], {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const durationMs = Math.round(performance.now() - started);
  const stdout = (res.stdout || '').trimEnd();
  const stderr = (res.stderr || res.error?.message || '').trimEnd();
  const exitCode = res.status ?? 1;

  return {
    ok: exitCode === 0 && !res.error,
    exitCode,
    stdout,
    stderr,
    durationMs,
  };
}

async function findOpenPullRequestForBranch(token, owner, repo, branch) {
  if (!token || !owner || !repo || !branch) return null;
  const baseUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  const headQuery = encodeURIComponent(`${owner}:${branch}`);
  const url = `${baseUrl}/repos/${owner}/${repo}/pulls?state=open&head=${headQuery}&per_page=10`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rod-ci-operations',
    },
  });

  if (!res.ok) return null;
  const pulls = await res.json();
  return Array.isArray(pulls) && pulls.length > 0 ? pulls[0] : null;
}

function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================================
// Pipeline Principal
// ============================================================================
export async function runOperation() {
  const log = new AgentReporter('PKG & SHELL OPS', 'Workflow Runner');
  log.banner();

  const cliArgs = parseCliArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  let context = null;
  try {
    context = buildCliContext();
  } catch {
    // Execução local fora do GitHub Actions
  }

  const { branch, operation, packages, customCommand } = resolveInputs({
    branch: [
      cliArgs.branch,
      process.env.INPUT_BRANCH,
      process.env.GITHUB_HEAD_REF,
      process.env.GITHUB_REF_NAME,
      'main',
    ],
    operation: [cliArgs.operation, process.env.INPUT_OPERATION, 'install'],
    packages: [cliArgs.packages, process.env.INPUT_PACKAGES, ''],
    customCommand: [cliArgs['custom-command'], process.env.INPUT_CUSTOM_CMD, ''],
  });

  const pkg = readPackageJson(rootDir);
  const pm = detectPackageManager(rootDir, pkg);
  const plan = resolveExecutionPlan({
    pm,
    operation,
    packagesInput: packages,
    customCommandInput: customCommand,
  });

  // --------------------------------------------------------------------------
  // Step 1: Executar comando detectado
  // --------------------------------------------------------------------------
  const execResult = await log.step(`Executar ${plan.modeLabel}`, async (step) => {
    step.info('Branch alvo', branch);
    step.info('Package Manager', pm);
    step.info(
      'Operação',
      plan.isCustomOnly ? 'Custom Command' : `${operation}${packages ? ` (${packages})` : ''}`,
    );
    log.cmdBlock('bash', ['-c', plan.command]);

    const res = runShellCommand(plan.command, rootDir);

    if (res.stdout) {
      process.stdout.write(`${res.stdout}\n`);
    }
    if (res.stderr) {
      process.stderr.write(`${res.stderr}\n`);
    }

    if (res.ok) {
      step.pass('Comando concluído com sucesso', formatDuration(res.durationMs));
    } else {
      step.fail(`Comando falhou com exit code ${res.exitCode}`, formatDuration(res.durationMs));
    }

    return res;
  });

  // --------------------------------------------------------------------------
  // Step 2: Verificar mudanças no Git, commitar e enviar para a branch
  // --------------------------------------------------------------------------
  const gitResult = await log.step('Sincronizar alterações no Git', async (step) => {
    if (!execResult.ok) {
      step.skip('Commit ignorado', 'Comando anterior retornou erro');
      return { changed: false, commitSha: '', shortSha: '', numstat: [], botLogin: '' };
    }

    const status = runCmd('git', ['status', '--porcelain'], { silent: true });
    if (!status.stdout) {
      step.pass('Working tree limpo', 'Nenhuma alteração de arquivo para commitar');
      return { changed: false, commitSha: '', shortSha: '', numstat: [], botLogin: '' };
    }

    const github = token ? createNativeGithubClient(token) : null;
    const identity = await configureGitBotUser(github, { logger: log, silent: true });

    runCmd('git', ['add', '-A'], { silent: true });

    const numstatRaw = runCmd('git', ['diff', '--cached', '--numstat'], { silent: true }).stdout;
    const numstat = numstatRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [added, removed, file] = line.split('\t');
        return { added: added || '0', removed: removed || '0', file };
      });

    const summarySubject = plan.isCustomOnly
      ? `chore(ops): ${plan.command.slice(0, 60)} [skip-ci]`
      : `chore(deps): ${operation}${packages ? ` ${packages}` : ''} [skip-ci]`;

    step.status(`Criando commit como ${identity.name}...`);
    const commitRes = runCmd('git', ['commit', '-m', summarySubject], { logger: log });
    if (!commitRes.ok) {
      throw new Error(`Falha ao criar commit: ${commitRes.stderr}`);
    }

    step.status(`Sincronizando e enviando para origin/${branch}...`);
    const pullRes = runCmd('git', ['pull', '--rebase', '--autostash', 'origin', branch], { logger: log });
    if (!pullRes.ok) {
      throw new Error(`Falha no git pull --rebase origin ${branch}: ${pullRes.stderr}`);
    }

    const pushRes = runCmd('git', ['push', 'origin', `HEAD:${branch}`], { logger: log });
    if (!pushRes.ok) {
      throw new Error(`Falha no git push origin HEAD:${branch}: ${pushRes.stderr}`);
    }

    const commitSha = runCmd('git', ['rev-parse', 'HEAD'], { silent: true }).stdout;
    const shortSha = runCmd('git', ['rev-parse', '--short', 'HEAD'], { silent: true }).stdout;

    step.pass('Alterações enviadas com sucesso', `${shortSha} → ${branch} (${numstat.length} arquivo(s))`);

    return {
      changed: true,
      commitSha,
      shortSha,
      numstat,
      botLogin: identity.login,
    };
  });

  // --------------------------------------------------------------------------
  // Step 3: Comentar no PR aberto da branch (se existir)
  // --------------------------------------------------------------------------
  const prCommentResult = await log.step('Verificar PR aberto na branch & comentar', async (step) => {
    const owner = context?.repo?.owner || (process.env.GITHUB_REPOSITORY || '').split('/')[0];
    const repo = context?.repo?.repo || (process.env.GITHUB_REPOSITORY || '').split('/')[1];

    if (!token || !owner || !repo) {
      step.skip('Sem token ou contexto de repositório', 'Pulando comentário em PR');
      return { commented: false, prNumber: '' };
    }

    const openPr = await findOpenPullRequestForBranch(token, owner, repo, branch);
    if (!openPr) {
      step.info('Nenhum PR aberto encontrado', `Branch: ${branch}`);
      return { commented: false, prNumber: '' };
    }

    const serverUrl = (context?.serverUrl || process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
    const repoFull = `${owner}/${repo}`;
    const runUrl = `${serverUrl}/${repoFull}/actions/runs/${context?.runId || process.env.GITHUB_RUN_ID || ''}`;
    const marker = `<!-- pkg-shell-operations-comment:${branch} -->`;

    const combinedOutput = [execResult.stdout, execResult.stderr].filter(Boolean).join('\n').trim();
    const truncatedOutput =
      combinedOutput.length > MAX_OUTPUT_CHARS
        ? `${combinedOutput.slice(0, MAX_OUTPUT_CHARS)}\n\n... [output truncado em ${MAX_OUTPUT_CHARS} caracteres]`
        : combinedOutput || '(sem saída no terminal)';

    const statusBadge = execResult.ok ? '✅ Sucesso' : `❌ Falhou (exit \`${execResult.exitCode}\`)`;
    const commitCell = gitResult.changed
      ? `[\`${gitResult.shortSha}\`](${serverUrl}/${repoFull}/commit/${gitResult.commitSha}) (${gitResult.numstat.length} arquivo(s))`
      : '_Nenhuma alteração commitada_';

    const filesSection =
      gitResult.changed && gitResult.numstat.length > 0
        ? [
            '### 📂 Arquivos Modificados',
            '',
            '| Arquivo | Adições | Remoções |',
            '| :--- | :---: | :---: |',
            ...gitResult.numstat.map((f) => `| \`${f.file}\` | \`+${f.added}\` | \`-${f.removed}\` |`),
            '',
          ].join('\n')
        : '';

    const body = [
      marker,
      `## 🥊 Package & Shell Operations — ${statusBadge}`,
      '',
      '| Propriedade | Detalhe |',
      '| :--- | :--- |',
      `| **Branch** | \`${branch}\` |`,
      `| **Operação** | \`${plan.modeLabel}\` (\`${pm}\`) |`,
      `| **Duração** | \`${formatDuration(execResult.durationMs)}\` |`,
      `| **Commit** | ${commitCell} |`,
      `| **Workflow Run** | [Ver execução #${context?.runNumber || process.env.GITHUB_RUN_NUMBER || ''}](${runUrl}) |`,
      '',
      '### 💻 Comando Executado',
      '',
      '```bash',
      plan.command,
      '```',
      '',
      filesSection,
      '<details>',
      `<summary>📜 <b>Visualizar output completo</b> (${combinedOutput.split('\n').filter(Boolean).length} linha(s))</summary>`,
      '',
      '```text',
      truncatedOutput,
      '```',
      '',
      '</details>',
      '',
      '---',
      `<sub>🥊 *Atualizado em ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC*</sub>`,
    ]
      .filter(Boolean)
      .join('\n');

    const github = createNativeGithubClient(token);
    const res = await upsertMarkedComment({
      github,
      owner,
      repo,
      issueNumber: openPr.number,
      marker,
      body,
    });

    step.pass(`Comentário ${res.action} no PR #${openPr.number}`, openPr.html_url);
    return { commented: true, prNumber: String(openPr.number), prUrl: openPr.html_url };
  });

  // --------------------------------------------------------------------------
  // Step 4: Gravar GITHUB_OUTPUT e Job Summary
  // --------------------------------------------------------------------------
  await log.step('Gravar outputs & Job Summary', async (step) => {
    setActionOutput('changed', gitResult.changed);
    setActionOutput('branch', branch);
    setActionOutput('package_manager', pm);
    setActionOutput('executed_command', plan.command);
    setActionOutput('commit_sha', gitResult.commitSha);
    setActionOutput('short_sha', gitResult.shortSha);
    setActionOutput('pr_number', prCommentResult.prNumber);

    const combinedOutput = [execResult.stdout, execResult.stderr].filter(Boolean).join('\n').trim();
    const safeOutput =
      combinedOutput.length > MAX_OUTPUT_CHARS
        ? `${combinedOutput.slice(0, MAX_OUTPUT_CHARS)}\n... [truncado]`
        : combinedOutput || '(sem saída no terminal)';

    const summary = createSummaryWriter();
    summary
      .addHeading(`🥊 Package & Shell Operations — ${execResult.ok ? '✅ Sucesso' : '❌ Falha'}`, 2)
      .addTable([
        [
          { data: 'Propriedade', header: true },
          { data: 'Valor', header: true },
        ],
        ['Branch alvo', `<code>${escapeHtml(branch)}</code>`],
        ['Package Manager', `<code>${pm}</code>`],
        ['Modo / Operação', `<code>${escapeHtml(plan.modeLabel)}</code>`],
        ['Status / Duração', `${execResult.ok ? '✅ Exit 0' : `❌ Exit ${execResult.exitCode}`} (<code>${formatDuration(execResult.durationMs)}</code>)`],
        ['Commit gerado', gitResult.changed ? `<code>${gitResult.shortSha}</code> (${gitResult.numstat.length} arquivo(s))` : '<i>Nenhum</i>'],
        ['PR Comentado', prCommentResult.commented ? `<a href="${prCommentResult.prUrl}">#${prCommentResult.prNumber}</a>` : '<i>Nenhum PR aberto na branch</i>'],
      ])
      .addHeading('💻 Comando Executado', 3)
      .addCodeBlock(plan.command, 'bash');

    if (gitResult.changed && gitResult.numstat.length > 0) {
      summary
        .addHeading('📂 Arquivos Modificados', 3)
        .addTable([
          [
            { data: 'Arquivo', header: true },
            { data: 'Adições', header: true },
            { data: 'Remoções', header: true },
          ],
          ...gitResult.numstat.map((f) => [
            `<code>${escapeHtml(f.file)}</code>`,
            `<code>+${f.added}</code>`,
            `<code>-${f.removed}</code>`,
          ]),
        ]);
    }

    summary.addDetails('📜 Output completo da execução', `<pre><code>${escapeHtml(safeOutput)}</code></pre>`);

    await summary.write();
    step.pass('Outputs e resumo publicados');
  });

  if (!execResult.ok) {
    log.summary('fail', {
      Branch: branch,
      'Package Manager': pm,
      'Exit Code': execResult.exitCode,
      Committed: String(gitResult.changed),
    });
    process.exitCode = execResult.exitCode || 1;
    return;
  }

  log.summary('success', {
    Branch: branch,
    'Package Manager': pm,
    Committed: gitResult.changed ? ansi.green(`true (${gitResult.shortSha})`) : 'false',
    'PR Comment': prCommentResult.commented ? ansi.cyan(`#${prCommentResult.prNumber}`) : 'none',
  });
}

// ============================================================================
// CLI Entrypoint
// ============================================================================
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  runOperation().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
