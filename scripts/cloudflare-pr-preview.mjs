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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function collectPublishedArtifacts(dir, baseDir = dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPublishedArtifacts(full, baseDir, acc);
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full).split('\\').join('/');
      const stat = fs.statSync(full);
      acc.push({
        file: rel,
        size: stat.size,
        isUserscript: rel.endsWith('.user.js'),
      });
    }
  }
  return acc.sort((a, b) => a.file.localeCompare(b.file));
}

function runOrThrow(cmd, args, { log, label, env }) {
  const res = runCmd(cmd, args, {
    logger: log,
    env: { ...process.env, ...env },
  });

  if (res.stdout) {
    process.stdout.write(`${res.stdout}\n`);
  }
  if (res.stderr) {
    process.stderr.write(`${res.stderr}\n`);
  }

  if (!res.ok) {
    throw new Error(`${label} falhou (exit ${res.status}): ${res.stderr || res.stdout}`);
  }

  return res;
}

// ============================================================================
// Modo 1: Build, gerar installers isolados, publicar no R2 e gerar Summary
// ============================================================================
async function runPublishPreview({ log, args, context }) {
  const { prNumber, headSha, outRoot, skipBuild } = resolveInputs({
    prNumber: [
      args['pr-number'],
      process.env.PR_NUMBER,
      context?.payload?.pull_request?.number,
      context?.issue?.number,
    ],
    headSha: [
      args['head-sha'],
      process.env.PR_HEAD_SHA,
      process.env.HEAD_SHA,
      context?.payload?.pull_request?.head?.sha,
      context?.sha,
      '',
    ],
    outRoot: [args['out-dir'], process.env.PREVIEW_OUT_DIR, 'dist/pr-preview'],
    skipBuild: [args['skip-build'], process.env.SKIP_BUILD, 'false'],
  });

  const uploadToken = args.token || process.env.PREVIEW_UPLOAD_TOKEN || '';

  if (!prNumber) {
    throw new Error('PR_NUMBER é obrigatório para publicar o preview.');
  }
  if (!uploadToken) {
    throw new Error('PREVIEW_UPLOAD_TOKEN é obrigatório para publicar no Cloudflare R2.');
  }

  const previewDir = path.join(outRoot, String(prNumber));
  const previewUrl = `${PREVIEW_BASE_URL}/${encodeURIComponent(prNumber)}/`;

  // Step 1: Build dos userscripts (se não foi executado antes)
  if (String(skipBuild).toLowerCase() !== 'true') {
    await log.step('Compilar userscripts (npm run build)', async (step) => {
      runOrThrow('npm', ['run', 'build'], {
        log,
        label: 'npm run build',
      });
      step.pass('Build concluído com sucesso');
    });
  }

  // Step 2: Gerar installers isolados do PR e gravar source-sha.txt
  await log.step(`Gerar installers isolados do PR #${prNumber}`, async (step) => {
    runOrThrow('node', ['build/pr-preview.mjs'], {
      log,
      label: 'build/pr-preview.mjs',
      env: { PR_NUMBER: String(prNumber) },
    });

    fs.mkdirSync(previewDir, { recursive: true });
    if (headSha) {
      fs.writeFileSync(path.join(previewDir, 'source-sha.txt'), `${headSha}\n`, 'utf8');
    }

    if (!fs.existsSync(previewDir)) {
      throw new Error(`Diretório esperado não foi gerado: ${previewDir}`);
    }

    runOrThrow('node', ['build/design-system.mjs'], { log, label: 'build/design-system.mjs' });
    for (const file of ['design-system.js', 'design-system.css']) {
      const source = path.join('dist', file);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(previewDir, file));
    }
    let html = fs.readFileSync('hosting/design-system.html', 'utf8');
    html = html.replace('src="/design-system.js"', 'src="./design-system.js"');
    if (fs.existsSync(path.join(previewDir, 'design-system.css'))) {
      html = html.replace('</head>', '<link rel="stylesheet" href="./design-system.css"></head>');
    }
    fs.writeFileSync(path.join(previewDir, 'design-system.html'), html);
    step.pass('Installers gerados', previewDir);
  });

  // Step 3: Publicar arquivos no Cloudflare R2 via build/publish-pr-preview.mjs
  await log.step(`Publicar preview #${prNumber} no Cloudflare R2`, async (step) => {
    runOrThrow('node', ['build/publish-pr-preview.mjs', previewDir], {
      log,
      label: 'build/publish-pr-preview.mjs',
      env: {
        PR_NUMBER: String(prNumber),
        PREVIEW_UPLOAD_TOKEN: uploadToken,
      },
    });

    step.pass('Arquivos enviados para Cloudflare R2', previewUrl);
  });

  // Step 4: Coletar artefatos publicados, exportar outputs e gerar Job Summary
  const artifacts = collectPublishedArtifacts(previewDir);
  const userscripts = artifacts.filter((a) => a.isUserscript);
  const totalBytes = artifacts.reduce((sum, item) => sum + item.size, 0);

  setActionOutput('pr_number', prNumber);
  setActionOutput('preview_url', previewUrl);
  setActionOutput('artifact_dir', previewDir);
  setActionOutput('artifact_count', artifacts.length);
  setActionOutput('userscript_count', userscripts.length);

  const summary = createSummaryWriter();
  summary
    .addHeading(`▲ Cloudflare PR Preview — #${escapeHtml(prNumber)}`, 2)
    .addTable([
      [
        { data: 'Propriedade', header: true },
        { data: 'Valor', header: true },
      ],
      ['Pull Request', `<code>#${escapeHtml(prNumber)}</code>`],
      ...(headSha ? [['Commit SHA', `<code>${escapeHtml(headSha.slice(0, 7))}</code>`]] : []),
      ['URL Base do Preview', `<a href="${previewUrl}">${previewUrl}</a>`],
      [
        'Arquivos Publicados',
        `<code>${artifacts.length}</code> arquivo(s) · <code>${userscripts.length}</code> userscript(s) · <code>${formatBytes(totalBytes)}</code>`,
      ],
    ]);

  if (userscripts.length > 0) {
    summary
      .addHeading('🧩 Userscripts Disponíveis para Instalação', 3)
      .addTable([
        [
          { data: 'Userscript', header: true },
          { data: 'Tamanho', header: true },
          { data: 'Link Direto', header: true },
        ],
        ...userscripts.map((u) => {
          const itemUrl = `${previewUrl}${u.file.split('/').map(encodeURIComponent).join('/')}`;
          return [
            `<code>${escapeHtml(u.file)}</code>`,
            `<code>${formatBytes(u.size)}</code>`,
            `<a href="${itemUrl}">Instalar / Abrir</a>`,
          ];
        }),
      ]);
  }

  if (artifacts.length > 0) {
    summary.addDetails(
      `📦 Ver todos os ${artifacts.length} arquivo(s) publicados`,
      artifacts
        .map((a) => `- <code>${escapeHtml(a.file)}</code> (${formatBytes(a.size)})`)
        .join('\n'),
    );
  }

  await summary.write();

  log.summary('success', {
    Mode: 'publish',
    PR: `#${prNumber}`,
    Userscripts: ansi.cyan(userscripts.length),
    'Preview URL': ansi.green(previewUrl),
  });
}

// ============================================================================
// Modo 2: Remover preview do Cloudflare quando o PR for fechado
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
    .addQuote(
      `Preview do PR <code>#${escapeHtml(prNumber)}</code> removido de <code>${PREVIEW_BASE_URL}/${escapeHtml(prNumber)}/</code>.`,
    );

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
  const mode = String(args.mode || process.env.PREVIEW_MODE || 'publish').trim().toLowerCase();

  const log = new AgentReporter('CF PR PREVIEW', `Mode: ${mode}`);
  log.banner();

  let context = null;
  try {
    context = buildCliContext();
  } catch {
    // Execução local fora do GitHub Actions
  }

  if (mode === 'publish') {
    await runPublishPreview({ log, args, context });
  } else if (mode === 'cleanup') {
    await runCleanupPreview({ log, args, context });
  } else {
    throw new Error(`Modo inválido "${mode}". Use --mode=publish ou --mode=cleanup.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
