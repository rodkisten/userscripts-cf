import { AgentReporter, ansi } from './utils/github-logger.mjs';

async function collectComments({ github, context, core }) {
  const log = new AgentReporter('PR PREVIEW', `PR #${context.issue.number}`);
  log.banner();

  return log.step('Coletar metadados e diff do commit', async (step) => {
    const { owner, repo } = context.repo;
    const pr = context.payload.pull_request;
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

async function publishComment({ github, context, options = {} }) {
  const log = new AgentReporter('PR COMMENT', `PR #${context.issue?.number || context.payload.pull_request?.number}`);
  log.banner();

  return log.step('Publicar ou atualizar comentário no Pull Request', async (step) => {
    // ... mesma lógica de leitura de options/env ...

    step.status('Identificando bot e listando comentários existentes...');
    // ... busca app e comentários ...

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
