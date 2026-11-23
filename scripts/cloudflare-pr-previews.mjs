import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { AgentReporter, ansi } from './utils/ci-logger.mjs';
import {
  buildCliContext,
  createSummaryWriter,
  parseCliArgs,
  resolveInputs,
  runCmd,
  setActionOutput,
} from './utils/ci-utils.mjs';

const PREVIEW_BASE_URL = 'https://userscripts.preview.migos.club';

async function fetchGitHubPullRequest({ token, owner, repo, prNumber }) {
  const apiBase = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const url = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(prNumber)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rod-cf-pr-preview',
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub API GET /repos/${owner}/${repo}/pulls/${prNumber} falhou (${res.status}): ${errBody}`);
  }

  return res.json();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================================
// Modo 1: Baixar artifact não confiável e validar SHA contra a API do GitHub
// ============================================================================
async function runValidateArtifact({ log, args, context }) {
  const { runId, prNumber, outDir } = resolveInputs({
    runId: [args['run-id'], process.env.RUN_ID, context?.payload?.workflow_run?.id],
    prNumber: [
      args['pr-number'],
      process.env.PR_NUMBER,
      context?.payload?.workflow_run?.pull_requests?.[0]?.number,
      context?.issue?.number,
    ],
    outDir: [args['out-dir'], process.env.PREVIEW_OUT_DIR, 'dist/pr-preview'],
  });

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const owner = context?.repo?.owner || (process.env.GITHUB_REPOSITORY || '').split('/')[0];
  const repo = context?.repo?.repo || (process.env.GITHUB_REPOSITORY || '').split('/')[1];

  if (!runId || !prNumber) {
    throw new Error('RUN_ID e PR_NUMBER são obrigatórios para validar o artifact de preview.');
  }
  if (!token || !owner || !repo) {
    throw new Error('GH_TOKEN e GITHUB_REPOSITORY (owner/repo) são obrigatórios para consultar a API do GitHub.');
  }

  const artifactName = `userscripts-pr-${prNumber}`;
  const targetDir = path.join(outDir, String(prNumber));

  // Step 1: Download do artifact do workflow_run (sem executar nenhum arquivo dele)
  await log.step(`Baixar artifact "${artifactName}"`, async (step) => {
    fs.mkdirSync(outDir, { recursive: true });
    const dl = runCmd(
      'gh',
      ['run', 'download', String(runId), '--name', artifactName, '--dir', outDir],
      {
        logger: log,
        env: { ...process.env, GH_TOKEN: token },
      },
    );

    if (!dl.ok) {
      throw new Error(`Falha ao baixar artifact "${artifactName}" do run ${runId}: ${dl.stderr || dl.stdout}`);
    }

    step.pass('Artifact baixado', targetDir);
  });

  // Step 2: Validar estado do PR e SHA via GitHub REST API nativa
  const validation = await log.step(`Validar PR #${prNumber} via GitHub API`, async (step) => {
    const shaFile = path.join(targetDir, 'source-sha.txt');
    if (!fs.existsSync(shaFile)) {
      throw new Error(`Arquivo de verificação ausente no artifact: ${shaFile}`);
    }

    const artifactSha = fs.readFileSync(shaFile, 'utf8').trim();
    if (!artifactSha) {
      throw new Error(`Arquivo ${shaFile} está vazio.`);
    }

    const pr = await fetchGitHubPullRequest({ token, owner, repo, prNumber });
    const prState = pr.state;
    const headSha = pr.head?.sha || '';

    step.info('Estado do PR', prState);
    step.info('Artifact SHA', artifactSha.slice(0, 12));
    step.info('PR Head SHA', headSha.slice(0, 12));

    if (prState !== 'open' || headSha !== artifactSha) {
      throw new Error(
        `PR fechado ou existe um head mais recente (state=${prState}, expected=${headSha}, got=${artifactSha}); publicação cancelada.`,
      );
    }

    step.pass('SHA e estado do PR validados', `${headSha.slice(0, 7)} (open)`);
    return { pr, artifactSha, headSha };
  });

  const previewUrl = `${PREVIEW_BASE_URL}/${prNumber}/`;

  setActionOutput('pr_number', prNumber);
  setActionOutput('artifact_dir', targetDir);
  setActionOutput('head_sha', validation.headSha);
  setActionOutput('preview_url', previewUrl);

  log.summary('success', {
    Mode: 'validate',
    PR: `#${prNumber}`,
    'Head SHA': ansi.cyan(validation.headSha.slice(0, 7)),
    'Artifact Dir': targetDir,
  });
}

// ============================================================================
// Modo 2: Publicar Job Summary após upload para Cloudflare R2
// ============================================================================
async function runPublishSummary({ log, args, context }) {
  const { prNumber, headSha } = resolveInputs({
    prNumber: [
      args['pr-number'],
      process.env.PR_NUMBER,
      context?.payload?.workflow_run?.pull_requests?.[0]?.number,
      context?.issue?.number,
    ],
    headSha: [args['head-sha'], process.env.HEAD_SHA, ''],
  });

  if (!prNumber) {
    throw new Error('PR_NUMBER é obrigatório para gerar o resumo de preview.');
  }

  const previewUrl = `${PREVIEW_BASE_URL}/${prNumber}/`;
  setActionOutput('preview_url', previewUrl);

  const summary = createSummaryWriter();
  summary
    .addHeading('▲ Cloudflare PR Preview Publicado', 2)
    .addTable([
      [
        { data: 'Propriedade', header: true },
        { data: 'Valor', header: true },
      ],
      ['Pull Request', `<code>#${escapeHtml(prNumber)}</code>`],
      ...(headSha ? [['Commit SHA', `<code>${escapeHtml(headSha.slice(0, 7))}</code>`]] : []),
      ['URL de Preview', `<a href="${previewUrl}">${previewUrl}</a>`],
    ]);

  await summary.write();

  log.summary('success', {
    Mode: 'summary',
    PR: `#${prNumber}`,
    'Preview URL': ansi.cyan(previewUrl),
  });
}

// ============================================================================
// Modo 3: Remover preview do Cloudflare quando o PR for fechado
// ============================================================================
async function runCleanupPreview({ log, args, context }) {
  const { prNumber, uploadToken } = resolveInputs({
    prNumber: [
      args['pr-number'],
      process.env.PR_NUMBER,
      context?.payload?.pull_request?.number,
      context?.issue?.number,
    ],
    uploadToken: [args.token, process.env.PREVIEW_UPLOAD_TOKEN],
  });

  if (!prNumber) {
    throw new Error('PR_NUMBER é obrigatório para limpar o preview no Cloudflare.');
  }
  if (!uploadToken) {
    throw new Error('PREVIEW_UPLOAD_TOKEN é obrigatório para remover o preview no Cloudflare.');
  }

  const deleteEndpoint = `${PREVIEW_BASE_URL}/_publish/${encodeURIComponent(prNumber)}`;

  await log.step(`Remover preview do PR #${prNumber} no Cloudflare`, async (step) => {
    step.info('Endpoint', deleteEndpoint);

    const response = await fetch(deleteEndpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${uploadToken}`,
        'User-Agent': 'rod-cf-pr-preview',
      },
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`Cleanup falhou (${response.status}): ${bodyText || response.statusText}`);
    }

    step.pass('Preview removido com sucesso', `PR #${prNumber}`);
  });

  setActionOutput('pr_number', prNumber);
  setActionOutput('cleaned', true);

  const summary = createSummaryWriter();
  summary
    .addHeading('🧹 Cloudflare PR Preview Removido', 2)
    .addQuote(`Preview do PR <code>#${escapeHtml(prNumber)}</code> removido de <code>${PREVIEW_BASE_URL}/${escapeHtml(prNumber)}/</code>.`);

  await summary.write();

  log.summary('success', {
    Mode: 'cleanup',
    PR: `#${prNumber}`,
    Removed: ansi.green('true'),
  });
}

// ============================================================================
// Entrypoint Principal
// ============================================================================
export async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const mode = String(args.mode || process.env.PREVIEW_MODE || 'validate').trim().toLowerCase();

  const log = new AgentReporter('CF PR PREVIEW', `Mode: ${mode}`);
  log.banner();

  let context = null;
  try {
    context = buildCliContext();
  } catch {
    // Execução local fora do GitHub Actions
  }

  if (mode === 'validate') {
    await runValidateArtifact({ log, args, context });
  } else if (mode === 'summary') {
    await runPublishSummary({ log, args, context });
  } else if (mode === 'cleanup') {
    await runCleanupPreview({ log, args, context });
  } else {
    throw new Error(`Modo inválido "${mode}". Use --mode=validate, --mode=summary ou --mode=cleanup.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
