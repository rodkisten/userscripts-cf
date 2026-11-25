import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentReporter, ansi } from './utils/ci-logger.mjs';
import {
  buildCliContext,
  createNativeGithubClient,
  createSummaryWriter,
  parseCliArgs,
  resolveBotLogin,
  resolveInputs,
  setActionOutput,
} from './utils/ci-utils.mjs';

// ============================================================================
// 1. Coletar Diff e Metadados do Commit
// ============================================================================
export async function collectComments({ github, context, core }) {
  const prNumber = context.issue?.number || context.payload.pull_request?.number;
  const log = new AgentReporter('PR PREVIEW', prNumber ? `PR #${prNumber}` : '');
  log.banner();

  return log.step('Coletar metadados e diff do commit', async (step) => {
    const { owner, repo } = context.repo;
    const pr = context.payload.pull_request;
    if (!pr) {
      throw new Error('Contexto inválido: payload.pull_request não encontrado.');
    }

    const headSha = pr.head.sha;
    const shortSha = headSha.substring(0, 7);
    const beforeSha = context.payload.before;

    step.status(`Buscando commit ${shortSha}...`);
    const { data: commitData } = await github.rest.repos.getCommit({
      owner,
      repo,
      ref: headSha,
    });

    const commitMsg = commitData.commit.message.split('\n')[0].replace(/\|/g, '\\|');
    const authorLogin = commitData.author ? `@${commitData.author.login}` : commitData.commit.author.name;

    step.pass('Commit carregado', `${ansi.cyan(shortSha)} · ${commitMsg}`);

    let diffSummary = '';

    if (
      context.payload.action === 'synchronize' &&
      beforeSha &&
      beforeSha !== '0000000000000000000000000000000000000000'
    ) {
      try {
        step.status(`Comparando ${beforeSha.slice(0, 7)}...${shortSha}...`);
        const { data: compare } = await github.rest.repos.compareCommits({
          owner,
          repo,
          base: beforeSha,
          head: headSha,
        });

        const filesChanged = compare.files || [];
        const totalAdditions = filesChanged.reduce((acc, f) => acc + f.additions, 0);
        const totalDeletions = filesChanged.reduce((acc, f) => acc + f.deletions, 0);
        const compareUrl = `${pr.html_url}/files/${beforeSha}..${headSha}`;

        diffSummary += `- [\`${shortSha}\`](${commitData.html_url}) **${commitMsg}** — por ${authorLogin} (\`+${totalAdditions}\` / \`-${totalDeletions}\` linhas em **${filesChanged.length}** arquivo(s)) • [🔍 Ver Diff Completo](${compareUrl})\n`;

        const topFiles = filesChanged
          .slice(0, 10)
          .map((f) => {
            const icon = f.status === 'added' ? '🟢' : f.status === 'removed' ? '🔴' : '🟡';
            return `  - ${icon} \`${f.filename}\` (\`+${f.additions}\` / \`-${f.deletions}\`)`;
          })
          .join('\n');

        if (topFiles) diffSummary += `${topFiles}\n`;
        if (filesChanged.length > 10) {
          diffSummary += `  - *...e mais ${filesChanged.length - 10} arquivo(s) modificado(s).*\n`;
        }

        step.pass(
          'Diff calculado',
          `${filesChanged.length} arquivo(s) (${ansi.green(`+${totalAdditions}`)} / ${ansi.red(`-${totalDeletions}`)})`,
        );
      } catch {
        step.warn('Force-push detectado', 'Histórico reescrito; usando fallback de commit único');
        diffSummary += `- [\`${shortSha}\`](${commitData.html_url}) **${commitMsg}** — por ${authorLogin} *(Force-push detectado: histórico reescrito)*\n`;
      }
    } else {
      step.info('Deploy inicial do PR', `Branch ${pr.head.ref}`);
      diffSummary += `- [\`${shortSha}\`](${commitData.html_url}) **${commitMsg}** — *Deploy inicial do PR* por ${authorLogin}\n`;
    }

    setActionOutput('short_sha', shortSha, core);
    setActionOutput('commit_url', commitData.html_url, core);
    setActionOutput('diff_entry', diffSummary.trim(), core);

    log.summary('success', {
      Commit: shortSha,
      Autor: authorLogin,
    });

    return { shortSha, commitUrl: commitData.html_url, diffEntry: diffSummary.trim() };
  });
}

// ============================================================================
// 2. Publicar ou Atualizar Comentário de Preview no PR
// ============================================================================
export async function publishComment({ github, context, options = {} }) {
  const issue_number = context.issue?.number || context.payload.pull_request?.number;
  const log = new AgentReporter('PR COMMENT', issue_number ? `PR #${issue_number}` : '');
  log.banner();

  return log.step('Publicar ou atualizar comentário no Pull Request', async (step) => {
    const { owner, repo } = context.repo;
    if (!issue_number) {
      throw new Error('Não foi possível determinar o número do PR.');
    }

    const { previewUrl, shortSha, commitUrl, diffEntry, branchName } = resolveInputs({
      previewUrl: [options.previewUrl, process.env.PREVIEW_URL],
      shortSha: [
        options.shortSha,
        process.env.SHORT_SHA,
        context.payload.pull_request?.head?.sha?.substring(0, 7),
      ],
      commitUrl: [options.commitUrl, process.env.COMMIT_URL],
      diffEntry: [options.diffEntry, process.env.DIFF_ENTRY],
      branchName: [
        options.branchName,
        process.env.BRANCH_NAME,
        process.env.GITHUB_HEAD_REF,
        context.payload.pull_request?.head?.ref,
      ],
    });

    const newDiffEntry = diffEntry.trim();
    const nowBr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const mainMarker = '<!-- pr-preview-deploy-bot -->';
    const historyStart = '<!-- preview-history-start -->';
    const historyEnd = '<!-- preview-history-end -->';

    step.status('Identificando bot e listando comentários existentes...');
    const botLogin = await resolveBotLogin(github);

    const comments = [];
    for (let page = 1; ; page++) {
      const { data } = await github.rest.issues.listComments({owner, repo, issue_number, per_page: 100, page});
      comments.push(...data);
      if (data.length < 100) break;
    }
    const matches = comments.filter(c => c.user?.login === (process.env.APP_SLUG ? process.env.APP_SLUG + '[bot]' : 'ploocky[bot]') && c.body?.includes(mainMarker));
    const existingComment = matches[0];
    let previousHistory = '';
    if (existingComment) {
      const historyRegex = new RegExp(`${historyStart}([\\s\\S]*?)${historyEnd}`);
      const match = existingComment.body.match(historyRegex);
      if (match?.[1]) {
        previousHistory = match[1].trim();
      }
    }

    const updatedHistory = [...new Set([newDiffEntry, previousHistory].filter(Boolean))].join('\n').slice(0, 24000);
    const deployCount = updatedHistory.split('\n').filter((line) => line.startsWith('- [')).length;

    const body = [
      mainMarker,
      '### 🚀 Preview disponível',
      '',
      '**[Abrir ambiente de testes](' + previewUrl + ')** · [Commit ' + shortSha + '](' + commitUrl + ')',
      '',
      '> [!NOTE]',
      '> INFO: Abra o preview para testar a revisão publicada. Expanda o histórico para consultar os diffs de cada deploy.',
      '',
      '<details>',
      '<summary>📜 Histórico de deploys (' + deployCount + ')</summary>',
      '',
      historyStart,
      updatedHistory,
      historyEnd,
      '',
      '</details>',
      '',
      '---',
      `<sub>🤖 Gerado automaticamente por **${botLogin}** • Este comentário é atualizado dinamicamente a cada novo commit sem gerar spam.</sub>`,
    ].join('\n');

    if (existingComment) {
      step.status(`Atualizando comentário #${existingComment.id}...`);
      await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
      step.pass('Comentário atualizado', `ID #${existingComment.id} (${deployCount} deploy(s) no histórico)`);
    } else {
      step.status('Criando novo comentário de preview...');
      const { data: created } = await github.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body,
      });
      step.pass('Comentário criado', `ID #${created.id}`);
    }

    for (const duplicate of matches.slice(1)) await github.rest.issues.deleteComment({owner, repo, comment_id: duplicate.id});

    log.summary('success', {
      Preview: previewUrl,
      Branch: branchName,
      Deploys: `${deployCount} registro(s)`,
    });
  });
}

// ============================================================================
// 3. Gerar Rich Step Summary (Operação / Pipeline)
// ============================================================================
export async function generateOperationSummary({ context, core, options = {} }) {
  const {
    operation: INPUT_OPERATION,
    branch: INPUT_BRANCH,
    packages: INPUT_PACKAGES,
    customCmd: INPUT_CUSTOM_CMD,
    outChanged: OUT_CHANGED,
    outBranch: OUT_BRANCH,
  } = resolveInputs({
    operation: [options.operation, process.env.INPUT_OPERATION, 'unknown'],
    branch: [options.branch, process.env.INPUT_BRANCH, context.refName],
    packages: [options.packages, process.env.INPUT_PACKAGES],
    customCmd: [options.customCmd, process.env.INPUT_CUSTOM_CMD],
    outChanged: [options.outChanged, process.env.OUT_CHANGED, 'false'],
    outBranch: [options.outBranch, process.env.OUT_BRANCH, process.env.INPUT_BRANCH, context.refName],
  });

  const log = new AgentReporter('STEP SUMMARY', INPUT_OPERATION.toUpperCase());
  log.banner();

  return log.step(`Gerar relatório da operação "${INPUT_OPERATION}"`, async (step) => {
    const repoUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;
    const runUrl = `${repoUrl}/actions/runs/${context.runId}`;
    const shortSha = (context.sha || '').substring(0, 7);

    const comandoExecutado =
      INPUT_OPERATION === 'custom'
        ? INPUT_CUSTOM_CMD || 'nenhum comando customizado informado'
        : `npm ${INPUT_OPERATION} ${INPUT_PACKAGES}`.trim();

    step.status('Montando estrutura do GitHub Step Summary...');
    const summary = createSummaryWriter(core);

    await summary
      .addHeading(`🥊 Relatório: ${INPUT_OPERATION.toUpperCase()}`, 1)
      .addHeading(`Branch alvo: ${INPUT_BRANCH}`, 2)
      .addRaw(`Disparado por **@${context.actor}** no evento \`${context.eventName}\`. `)
      .addRaw(`Status de alteração nos arquivos: **${OUT_CHANGED}**.`, true)
      .addBreak()
      .addEOL()
      .addQuote(`Comando processado: ${comandoExecutado}`, `Run #${context.runNumber}`)
      .addSeparator()
      .addLink('🔗 Ver execução completa deste Workflow', runUrl)
      .addBreak()
      .addImage('https://githubassets.com', 'Logo do GitHub', { width: '48', height: '48' })
      .addHeading('Parâmetros Recebidos', 3)
      .addList(
        [
          `Operação: ${INPUT_OPERATION}`,
          `Branch selecionada: ${INPUT_BRANCH}`,
          `Pacotes: ${INPUT_PACKAGES || 'N/A'}`,
          `Comando Custom: ${INPUT_CUSTOM_CMD || 'N/A'}`,
        ],
        false,
      )
      .addHeading('Etapas do Pipeline', 3)
      .addList(
        [
          'Autenticação via GitHub App',
          `Checkout na branch ${OUT_BRANCH}`,
          'Execução da operação e geração de resumo',
        ],
        true,
      )
      .addHeading('Contexto & Outputs (JSON)', 3)
      .addCodeBlock(
        JSON.stringify(
          {
            actor: context.actor,
            sha: shortSha,
            inputs: {
              operation: INPUT_OPERATION,
              branch: INPUT_BRANCH,
              packages: INPUT_PACKAGES || null,
              customCommand: INPUT_CUSTOM_CMD || null,
            },
            outputs: {
              changed: OUT_CHANGED,
              branch: OUT_BRANCH,
            },
          },
          null,
          2,
        ),
        'json',
      )
      .addHeading('Resumo da Execução', 3)
      .addTable([
        [
          { data: 'Variável / Parâmetro', header: true },
          { data: 'Valor Resolvido', header: true },
          { data: 'Origem', header: true },
        ],
        ['Operation', `<code>${INPUT_OPERATION}</code>`, 'inputs.operation'],
        ['Target Branch', `<code>${INPUT_BRANCH}</code>`, 'inputs / github.ref_name'],
        ['Changed?', OUT_CHANGED === 'true' ? '✅ Sim' : '❌ Não', 'steps.generated_output'],
        [
          {
            data: `Repositório: ${context.repo.owner}/${context.repo.repo} (Commit ${shortSha})`,
            colspan: '3',
          },
        ],
      ])
      .addDetails(
        'Clique para ver o comando exato montado',
        `Executado em ${new Date().toISOString()}:\n$ ${comandoExecutado}`,
      )
      .write();

    step.pass('Summary gravado', `Run #${context.runNumber} · ${ansi.cyan(INPUT_BRANCH)}`);

    log.summary('success', {
      Operação: INPUT_OPERATION,
      Branch: INPUT_BRANCH,
      Alterações: OUT_CHANGED === 'true' ? 'Sim' : 'Não',
    });
  });
}

// ============================================================================
// Dispatcher CLI & Module Export
// ============================================================================
const COMMANDS = {
  collect: ({ github, context, core }) => collectComments({ github, context, core }),
  publish: ({ github, context, args, options }) =>
    publishComment({
      github,
      context,
      options: {
        previewUrl: args?.['preview-url'] || (typeof args?.preview === 'string' ? args.preview : undefined),
        shortSha: args?.['short-sha'],
        commitUrl: args?.['commit-url'],
        diffEntry: args?.['diff-entry'],
        branchName: args?.['branch-name'],
        ...options,
      },
    }),
  summary: ({ context, core, args, options }) =>
    generateOperationSummary({
      context,
      core,
      options: {
        operation: args?.operation,
        branch: args?.branch,
        packages: args?.packages,
        customCmd: args?.['custom-cmd'],
        outChanged: args?.['out-changed'],
        outBranch: args?.['out-branch'],
        ...options,
      },
    }),
};

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  const command = args._[0] || args.action;
  const handler = COMMANDS[command];

  if (!handler) {
    console.error(`Uso: node scripts/github-actions.mjs <${Object.keys(COMMANDS).join('|')}> [opções]`);
    process.exit(1);
  }

  const token = args.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token && command !== 'summary') {
    throw new Error('Token ausente. Informe --token ou defina GITHUB_TOKEN / GH_TOKEN.');
  }

  const github = token ? createNativeGithubClient(token) : null;
  const context = buildCliContext();

  await handler({ github, context, args });
}

export default function main({ github, context, core, action = 'collect', options = {} }) {
  const handler = COMMANDS[action];
  if (!handler) {
    throw new Error(`Ação inválida: "${action}". Use: ${Object.keys(COMMANDS).join(', ')}`);
  }
  return handler({ github, context, core, options });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
