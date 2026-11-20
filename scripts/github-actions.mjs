import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AgentReporter, ansi } from './github/github-logger.mjs';

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

export async function collectComments({ github, context, core }) {
  const prNumber = context.issue?.number || context.payload.pull_request?.number;
  const log = new AgentReporter('PR PREVIEW', `PR #${prNumber}`);
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

export async function publishComment({ github, context, options = {} }) {
  const issue_number = context.issue?.number || context.payload.pull_request?.number;
  const log = new AgentReporter('PR COMMENT', `PR #${issue_number}`);
  log.banner();

  return log.step('Publicar ou atualizar comentário no Pull Request', async (step) => {
    const { owner, repo } = context.repo;
    if (!issue_number) {
      throw new Error('Não foi possível determinar o número do PR.');
    }

    const previewUrl = options.previewUrl || process.env.PREVIEW_URL || '';
    const shortSha =
      options.shortSha ||
      process.env.SHORT_SHA ||
      context.payload.pull_request?.head?.sha?.substring(0, 7) ||
      '';
    const commitUrl = options.commitUrl || process.env.COMMIT_URL || '';
    const newDiffEntry = (options.diffEntry || process.env.DIFF_ENTRY || '').trim();
    const branchName =
      options.branchName ||
      process.env.BRANCH_NAME ||
      process.env.GITHUB_HEAD_REF ||
      context.payload.pull_request?.head?.ref ||
      '';

    const nowBr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const mainMarker = '<!-- pr-preview-deploy-bot -->';
    const historyStart = '<!-- preview-history-start -->';
    const historyEnd = '<!-- preview-history-end -->';

    step.status('Identificando bot e listando comentários existentes...');
    let botLogin = 'github-actions[bot]';
    try {
      const { data: app } = await github.rest.apps.getAuthenticated();
      if (app?.slug) botLogin = `${app.slug}[bot]`;
    } catch {
      // Fallback para GITHUB_TOKEN padrão
    }

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
// Cliente GitHub Nativo & Runner CLI
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
  };
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  const command = args._[0] || args.action;

  const token = args.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error('Token ausente. Informe --token ou defina GITHUB_TOKEN / GH_TOKEN.');
  }

  const github = createNativeGithubClient(token);
  const context = buildCliContext();

  if (command === 'collect') {
    await collectComments({ github, context });
  } else if (command === 'publish') {
    await publishComment({
      github,
      context,
      options: {
        previewUrl: args['preview-url'] || (typeof args.preview === 'string' ? args.preview : undefined),
        shortSha: args['short-sha'],
        commitUrl: args['commit-url'],
        diffEntry: args['diff-entry'],
        branchName: args['branch-name'],
      },
    });
  } else {
    console.error('Uso: node scripts/github-actions.mjs <collect|publish>');
    process.exit(1);
  }
}

export default function main({ github, context, core, action = 'collect', options = {} }) {
  if (action === 'publish') {
    return publishComment({ github, context, options });
  }
  return collectComments({ github, context, core });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
