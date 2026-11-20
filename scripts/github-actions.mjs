import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AgentReporter, ansi } from './github/github-logger.mjs';

// ============================================================================
// Utilitários Compartilhados (Inputs, Outputs, Summary & Auth)
// ============================================================================
function resolveInputs(sources, fallbackMap) {
  const resolved = {};
  for (const [key, candidates] of Object.entries(fallbackMap)) {
    const found = candidates.find((val) => val !== undefined && val !== null && val !== '');
    resolved[key] = found ?? '';
  }
  return resolved;
}

function setActionOutput(name, value, core) {
  const strValue = String(value ?? '');
  if (core && typeof core.setOutput === 'function') {
    core.setOutput(name, strValue);
    return;
  }

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const delimiter = `EOF_${crypto.randomBytes(8).toString('hex')}`;
    fs.appendFileSync(outputFile, `${name}<<${delimiter}\n${strValue}\n${delimiter}\n`, 'utf8');
  } else {
    console.log(`[output] ${name}=\n${strValue}`);
  }
}

async function resolveBotLogin(github) {
  try {
    const { data: app } = await github.rest.apps.getAuthenticated();
    if (app?.slug) return `${app.slug}[bot]`;
  } catch {
    // Fallback quando autenticado via GITHUB_TOKEN padrão
  }
  return 'github-actions[bot]';
}

/**
 * Retorna `core.summary` se disponível (github-script) ou um builder compatível
 * que grava diretamente em `GITHUB_STEP_SUMMARY` (CLI nativa sem dependências).
 */
function createSummaryWriter(core) {
  if (core?.summary) return core.summary;

  const chunks = [];
  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const api = {
    addHeading(text, level = 1) {
      chunks.push(`<h${level}>${text}</h${level}>\n`);
      return api;
    },
    addRaw(text, addEOL = false) {
      chunks.push(`${text}${addEOL ? '\n' : ''}`);
      return api;
    },
    addBreak() {
      chunks.push('<br>\n');
      return api;
    },
    addEOL() {
      chunks.push('\n');
      return api;
    },
    addQuote(text, cite) {
      const citeAttr = cite ? ` cite="${escapeHtml(cite)}"` : '';
      chunks.push(`<blockquote${citeAttr}>\n${text}\n</blockquote>\n`);
      return api;
    },
    addSeparator() {
      chunks.push('<hr>\n');
      return api;
    },
    addLink(text, href) {
      chunks.push(`<a href="${escapeHtml(href)}">${text}</a>\n`);
      return api;
    },
    addImage(src, alt, opts = {}) {
      const attrs = [
        `src="${escapeHtml(src)}"`,
        `alt="${escapeHtml(alt)}"`,
        opts.width ? `width="${opts.width}"` : '',
        opts.height ? `height="${opts.height}"` : '',
      ]
        .filter(Boolean)
        .join(' ');
      chunks.push(`<img ${attrs}>\n`);
      return api;
    },
    addList(items, ordered = false) {
      const tag = ordered ? 'ol' : 'ul';
      const li = items.map((item) => `<li>${item}</li>`).join('\n');
      chunks.push(`<${tag}>\n${li}\n</${tag}>\n`);
      return api;
    },
    addCodeBlock(code, lang = '') {
      const langAttr = lang ? ` lang="${escapeHtml(lang)}"` : '';
      chunks.push(`<pre${langAttr}><code>${escapeHtml(code)}</code></pre>\n`);
      return api;
    },
    addTable(rows) {
      const htmlRows = rows
        .map((row) => {
          const cells = row
            .map((cell) => {
              if (typeof cell === 'object' && cell !== null) {
                const tag = cell.header ? 'th' : 'td';
                const colspan = cell.colspan ? ` colspan="${cell.colspan}"` : '';
                const rowspan = cell.rowspan ? ` rowspan="${cell.rowspan}"` : '';
                return `<${tag}${colspan}${rowspan}>${cell.data}</${tag}>`;
              }
              return `<td>${cell}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('\n');
      chunks.push(`<table>\n${htmlRows}\n</table>\n`);
      return api;
    },
    addDetails(label, content) {
      chunks.push(`<details>\n<summary>${label}</summary>\n\n${content}\n</details>\n`);
      return api;
    },
    async write() {
      const output = chunks.join('\n');
      const summaryFile = process.env.GITHUB_STEP_SUMMARY;
      if (summaryFile) {
        fs.appendFileSync(summaryFile, `${output}\n`, 'utf8');
      } else {
        process.stdout.write(`\n--- STEP SUMMARY PREVIEW ---\n${output}\n`);
      }
      chunks.length = 0;
    },
  };

  return api;
}

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

    const { previewUrl, shortSha, commitUrl, diffEntry, branchName } = resolveInputs(options, {
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

    const { data: comments } = await github.rest.issues.listComments({
      owner,
      repo,
      issue_number,
      per_page: 100,
    });

    const existingComment = comments.find(
      (c) => c.user?.login === botLogin && c.body?.includes(mainMarker),
    );

    let previousHistory = '';
    if (existingComment) {
      const historyRegex = new RegExp(`${historyStart}([\\s\\S]*?)${historyEnd}`);
      const match = existingComment.body.match(historyRegex);
      if (match?.[1]) {
        previousHistory = match[1].trim();
      }
    }

    const updatedHistory = [newDiffEntry, previousHistory].filter(Boolean).join('\n');
    const deployCount = updatedHistory.split('\n').filter((line) => line.startsWith('- [')).length;

    const body = [
      mainMarker,
      '# 🚀✨ PREVIEW NO AR! AMBIENTE PRONTO PARA TESTES ✨🚀',
      '',
      '> [!TIP]',
      '> 🎉 **Deploy concluído com sucesso!** Sua versão de homologação deste Pull Request já está publicada, ativa e pronta para ser testada em tempo real.',
      '',
      '### 🔗 Acesso Rápido ao Ambiente',
      '',
      '| 🌐 Status | 🚀 URL do Preview | 🌿 Branch | 📦 Commit Atual | 🕒 Última Atualização |',
      '| :---: | :--- | :--- | :---: | :---: |',
      `| ![Online](https://img.shields.io/badge/STATUS-ONLINE-brightgreen?style=for-the-badge&logo=cloudflare) | **[👉 ABRIR PREVIEW AO VIVO](${previewUrl})**<br><sub>\`${previewUrl}\`</sub> | \`${branchName}\` | [\`${shortSha}\`](${commitUrl}) | \`${nowBr}\` |`,
      '',
      '---',
      '',
      `### 📜 Histórico de Deploys & Diffs deste PR (${deployCount} atualização(ões))`,
      '',
      '<details open>',
      '<summary>🔎 <b>Clique para expandir/recolher o que foi modificado a cada push</b></summary>',
      '',
      '<br>',
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
  } = resolveInputs(options, {
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
// Cliente GitHub Nativo & Dispatcher CLI / Module
// ============================================================================
function createNativeGithubClient(token) {
  const request = async (method, urlPath, body) => {
    const res = await fetch(`https://api.github.com${urlPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub API ${method} ${urlPath} failed (${res.status}): ${errText}`);
    }
    return { data: res.status === 204 ? null : await res.json() };
  };

  return {
    rest: {
      apps: {
        getAuthenticated: () => request('GET', '/app'),
      },
      repos: {
        getCommit: ({ owner, repo, ref }) => request('GET', `/repos/${owner}/${repo}/commits/${ref}`),
        compareCommits: ({ owner, repo, base, head }) =>
          request('GET', `/repos/${owner}/${repo}/compare/${base}...${head}`),
      },
      issues: {
        listComments: ({ owner, repo, issue_number, per_page = 100 }) =>
          request('GET', `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=${per_page}`),
        createComment: ({ owner, repo, issue_number, body }) =>
          request('POST', `/repos/${owner}/${repo}/issues/${issue_number}/comments`, { body }),
        updateComment: ({ owner, repo, comment_id, body }) =>
          request('PATCH', `/repos/${owner}/${repo}/issues/comments/${comment_id}`, { body }),
      },
    },
  };
}

function parseCliArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        args[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args[token.slice(2)] = argv[++i];
      } else {
        args[token.slice(2)] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function buildCliContext() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  if (!owner || !repo) {
    throw new Error('Variável GITHUB_REPOSITORY (owner/repo) não definida.');
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  const payload =
    eventPath && fs.existsSync(eventPath) ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};

  return {
    repo: { owner, repo },
    issue: { number: payload.pull_request?.number || payload.issue?.number },
    payload,
    serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
    runId: process.env.GITHUB_RUN_ID || '0',
    runNumber: process.env.GITHUB_RUN_NUMBER || '0',
    actor: process.env.GITHUB_ACTOR || 'unknown',
    eventName: process.env.GITHUB_EVENT_NAME || 'workflow_dispatch',
    sha: process.env.GITHUB_SHA || payload.pull_request?.head?.sha || '',
    refName: process.env.GITHUB_REF_NAME || '',
  };
}

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

  // O comando "summary" não precisa de token da API do GitHub
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
