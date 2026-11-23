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
} from './utils/ci-utils.mjs';

const PLAYGROUND_URL = 'https://userscripts-playground.migos.club/';

const RELEVANT_CHANGE_PATTERN =
  /^(src\/|playground\/|studio\/|build\/|hosting\/|assets\/|package(-lock)?\.json$|userscripts\.config\.js$|distribution\.config\.js$|vite\.config\.js$|\.github\/workflows\/playground-pages\.yml$)/;

const REQUIRED_REACT_DEPS = ['vite', 'typescript', 'react', 'react-dom'];
const FORBIDDEN_LEGACY_DEPS = ['solid-js', '@solidjs/vite-plugin', '@solidjs/compiler'];

const REQUIRED_STATIC_PAGES = [
  'index.html',
  'manifest.json',
  'playground/instagram-bookmark.html',
  'playground/form-controls.html',
  'playground/ast-errors.html',
  'playground/diagnostics.html',
  'playground/inspector.html',
  'icons/preview.svg',
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function runOrThrow(cmd, args, { log, label, env } = {}) {
  const res = runCmd(cmd, args, {
    logger: log,
    env: env ? { ...process.env, ...env } : process.env,
  });

  if (res.stdout) {
    process.stdout.write(`${res.stdout}\n`);
  }
  if (res.stderr) {
    process.stderr.write(`${res.stderr}\n`);
  }

  if (!res.ok) {
    throw new Error(`${label || cmd} falhou (exit ${res.status}): ${res.stderr || res.stdout}`);
  }

  return res;
}

// ============================================================================
// Modo 1: Sincronizar package-lock.json e exportar SHA final
// ============================================================================
async function runSyncLockfile({ log, args }) {
  const { branch } = resolveInputs({
    branch: [args.branch, process.env.GITHUB_REF_NAME, 'main'],
  });

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  await log.step('Sincronizar npm lockfile', async (step) => {
    runOrThrow(
      'npm',
      ['install', '--package-lock-only', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'],
      { log, label: 'npm install --package-lock-only' },
    );

    runOrThrow(
      'npm',
      ['ci', '--legacy-peer-deps', '--no-audit', '--no-fund'],
      { log, label: 'npm ci' },
    );

    step.pass('Dependências e lockfile sincronizados');
  });

  const finalSha = await log.step('Verificar alterações em package-lock.json', async (step) => {
    const diff = runCmd('git', ['diff', '--quiet', '--', 'package-lock.json'], { silent: true });

    if (!diff.ok) {
      if (branch !== 'main') {
        throw new Error(`Lockfile fora de sincronia fora da branch main (branch atual: ${branch})`);
      }

      const github = token ? createNativeGithubClient(token) : null;
      const identity = await configureGitBotUser(github, { logger: log, silent: true });

      runOrThrow('git', ['add', 'package-lock.json'], { log, label: 'git add package-lock.json' });
      runOrThrow('git', ['commit', '-m', 'fix(deps): synchronize lockfile [skip ci]'], {
        log,
        label: 'git commit lockfile',
      });
      runOrThrow('git', ['push', 'origin', 'HEAD:main'], {
        log,
        label: 'git push origin HEAD:main',
      });

      const sha = runCmd('git', ['rev-parse', 'HEAD'], { silent: true }).stdout;
      step.pass(`Lockfile commitado como ${identity.name}`, sha.slice(0, 7));
      return sha;
    }

    const sha = runCmd('git', ['rev-parse', 'HEAD'], { silent: true }).stdout;
    step.pass('package-lock.json já está sincronizado', sha.slice(0, 7));
    return sha;
  });

  setActionOutput('sha', finalSha);

  log.summary('success', {
    Mode: 'sync-lockfile',
    Branch: branch,
    SHA: ansi.cyan(finalSha.slice(0, 7)),
  });
}

// ============================================================================
// Modo 2: Detectar se há mudanças relevantes para deploy no GitHub Pages
// ============================================================================
async function runDetectChanges({ log, args, context }) {
  const { eventName, before, head, commitMessage } = resolveInputs({
    eventName: [args['event-name'], process.env.EVENT_NAME, context?.eventName, process.env.GITHUB_EVENT_NAME, ''],
    before: [args.before, process.env.BEFORE, context?.payload?.before, ''],
    head: [args.head, process.env.HEAD, context?.sha, process.env.GITHUB_SHA, ''],
    commitMessage: [
      args['commit-message'],
      process.env.COMMIT_MESSAGE,
      context?.payload?.head_commit?.message,
      '',
    ],
  });

  const decision = await log.step('Avaliar necessidade de deploy do Playground', async (step) => {
    if (eventName === 'workflow_dispatch') {
      step.pass('Deploy habilitado', 'manual dispatch');
      return { deploy: true, reason: 'manual dispatch' };
    }

    if (
      commitMessage.includes('[deploy]') ||
      commitMessage.startsWith('fix(deps): regenerate npm lockfile')
    ) {
      step.pass('Deploy habilitado', 'explicit commit marker');
      return { deploy: true, reason: 'explicit commit marker' };
    }

    const isZeroSha = !before || /^0+$/.test(before);
    const hasBeforeCommit =
      !isZeroSha && runCmd('git', ['cat-file', '-e', `${before}^{commit}`], { silent: true }).ok;

    if (!hasBeforeCommit) {
      step.pass('Deploy habilitado', 'unavailable push base; conservative deployment');
      return { deploy: true, reason: 'unavailable push base; conservative deployment' };
    }

    const diffRes = runCmd('git', ['diff', '--name-only', before, head, '--'], { silent: true });
    const changedFiles = diffRes.stdout.split('\n').filter(Boolean);
    const matchedFiles = changedFiles.filter((file) => RELEVANT_CHANGE_PATTERN.test(file));

    if (matchedFiles.length > 0) {
      step.pass('Deploy habilitado', `${matchedFiles.length} arquivo(s) relevante(s) alterado(s)`);
      return { deploy: true, reason: 'relevant file changed' };
    }

    step.info('Deploy ignorado', 'Nenhum arquivo relevante ou marcador explícito encontrado');
    return { deploy: false, reason: 'no relevant files or explicit marker' };
  });

  setActionOutput('deploy', decision.deploy);
  setActionOutput('reason', decision.reason);

  log.summary('success', {
    Mode: 'detect-changes',
    Deploy: decision.deploy ? ansi.green('true') : ansi.yellow('false'),
    Reason: decision.reason,
  });
}

// ============================================================================
// Modo 3: Validar dependências React-only e ausência de pacotes Solid legados
// ============================================================================
async function runVerifyDeps({ log }) {
  const rootDir = process.cwd();

  const versions = await log.step('Verificar dependências React-only', async (step) => {
    const resolved = [];

    for (const name of REQUIRED_REACT_DEPS) {
      const pkgFile = path.join(rootDir, 'node_modules', name, 'package.json');
      if (!fs.existsSync(pkgFile)) {
        throw new Error(`Dependência obrigatória ausente em node_modules: ${name}`);
      }
      const { version } = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      resolved.push({ name, version });
      step.info(name, version);
    }

    const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    for (const legacyName of FORBIDDEN_LEGACY_DEPS) {
      if (rootPkg.dependencies?.[legacyName] || rootPkg.devDependencies?.[legacyName]) {
        throw new Error(`Dependência legada do Solid não deve ser restaurada: ${legacyName}`);
      }
    }

    step.pass('Dependências React validadas e sem resíduos Solid');
    return resolved;
  });

  log.summary('success', {
    Mode: 'verify-deps',
    Packages: versions.map((v) => `${v.name}@${v.version}`).join(', '),
  });
}

// ============================================================================
// Modo 4: Verificar integridade do manifest.json e bundles em dist/
// ============================================================================
async function runVerifyDist({ log, args }) {
  const distDir = path.resolve(process.cwd(), args.dir || 'dist');

  const count = await log.step('Validar artefatos de distribuição em dist/', async (step) => {
    const manifestPath = path.join(distDir, 'manifest.json');
    if (!fs.existsSync(manifestPath) || fs.statSync(manifestPath).size === 0) {
      throw new Error(`Manifest ausente ou vazio: ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.scripts) || manifest.scripts.length === 0) {
      throw new Error('Cache de distribuição vazio: manifest.scripts não possui itens');
    }

    for (const script of manifest.scripts) {
      for (const fileName of [script.file, script.metaFile]) {
        const target = fileName ? path.join(distDir, fileName) : '';
        if (!fileName || !fs.existsSync(target) || fs.statSync(target).size === 0) {
          throw new Error(`Artefato de distribuição ausente ou vazio: ${fileName}`);
        }
      }
    }

    step.pass('Distribuição validada', `${manifest.scripts.length} installer(s) íntegro(s)`);
    return manifest.scripts.length;
  });

  log.summary('success', {
    Mode: 'verify-dist',
    Installers: ansi.cyan(count),
  });
}

// ============================================================================
// Modo 5: Validar saída estática gerada em dist/pages/
// ============================================================================
async function runVerifyPages({ log, args }) {
  const pagesDir = path.resolve(process.cwd(), args.dir || 'dist/pages');

  const count = await log.step('Validar saída estática do GitHub Pages', async (step) => {
    for (const relFile of REQUIRED_STATIC_PAGES) {
      const fullPath = path.join(pagesDir, relFile);
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
        throw new Error(`Arquivo estático obrigatório ausente ou vazio: ${path.join('dist/pages', relFile)}`);
      }
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(pagesDir, 'manifest.json'), 'utf8'));
    if (manifest.channel !== 'preview' || !Array.isArray(manifest.scripts) || manifest.scripts.length === 0) {
      throw new Error('Catálogo de preview inválido ou vazio em dist/pages/manifest.json');
    }

    for (const item of manifest.scripts) {
      if (!item.file?.endsWith('.preview.user.js') || !item.metaFile?.endsWith('.preview.meta.js')) {
        throw new Error(`Nomes de arquivo de preview inválidos para "${item.id}": ${item.file} / ${item.metaFile}`);
      }

      const source = fs.readFileSync(path.join(pagesDir, item.file), 'utf8');
      const meta = fs.readFileSync(path.join(pagesDir, item.metaFile), 'utf8');

      for (const [kind, content] of [
        ['script', source],
        ['metadata', meta],
      ]) {
        const hasPreName = content
          .split('\n')
          .some((line) => line.startsWith('// @name') && line.includes('[PRE] '));

        if (!hasPreName) {
          throw new Error(`Prefixo [PRE] ausente em // @name (${item.id} ${kind})`);
        }
        if (!content.includes(`/${item.file}`) || !content.includes(`/${item.metaFile}`)) {
          throw new Error(`Links de preview incorretos em ${item.id} ${kind}`);
        }
        if (!content.includes('/icons/preview.svg')) {
          throw new Error(`Ícone /icons/preview.svg ausente em ${item.id} ${kind}`);
        }
      }
    }

    step.pass('Saída estática e installers de preview validados', `${manifest.scripts.length} userscript(s)`);
    return manifest.scripts.length;
  });

  log.summary('success', {
    Mode: 'verify-pages',
    'Preview Installers': ansi.cyan(count),
  });
}

// ============================================================================
// Modo 6: Rejeitar build obsoleto caso a branch main tenha avançado
// ============================================================================
async function runCheckLatest({ log, args }) {
  const branch = args.branch || 'main';

  const headSha = await log.step(`Verificar se HEAD ainda é o topo de origin/${branch}`, async (step) => {
    const lsRemote = runOrThrow('git', ['ls-remote', 'origin', `refs/heads/${branch}`], {
      log,
      label: 'git ls-remote',
    });

    const latestRemote = (lsRemote.stdout.split(/\s+/)[0] || '').trim();
    const localHead = runCmd('git', ['rev-parse', 'HEAD'], { silent: true }).stdout.trim();

    step.info('Remote HEAD', latestRemote.slice(0, 12));
    step.info('Local HEAD', localHead.slice(0, 12));

    if (!latestRemote || latestRemote !== localHead) {
      throw new Error(
        `Workflow obsoleto: origin/${branch} atual é ${latestRemote || 'desconhecido'}, commit em execução é ${localHead}`,
      );
    }

    step.pass('Commit sincronizado com o topo remoto', localHead.slice(0, 7));
    return localHead;
  });

  log.summary('success', {
    Mode: 'check-latest',
    Branch: branch,
    HEAD: ansi.green(headSha.slice(0, 7)),
  });
}

// ============================================================================
// Modo 7: Consolidar diagnóstico, caches, identidade e link no Job Summary
// ============================================================================
async function runPublishReport({ log, args, context }) {
  const {
    eventName,
    pushActor,
    commitAuthor,
    commitCommitter,
    depsCache,
    bundlesCache,
    designSystemCache,
    startedAt,
    published,
  } = resolveInputs({
    eventName: [args['event-name'], process.env.EVENT_NAME, context?.eventName, process.env.GITHUB_EVENT_NAME, ''],
    pushActor: [args.actor, process.env.PUSH_ACTOR, context?.actor, process.env.GITHUB_ACTOR, 'unknown'],
    commitAuthor: [
      args.author,
      process.env.COMMIT_AUTHOR,
      context?.payload?.head_commit?.author?.username,
      'unknown',
    ],
    commitCommitter: [
      args.committer,
      process.env.COMMIT_COMMITTER,
      context?.payload?.head_commit?.committer?.username,
      'unknown',
    ],
    depsCache: [args['deps-cache'], process.env.DEPS_CACHE, 'miss'],
    bundlesCache: [args['bundles-cache'], process.env.BUNDLES_CACHE, 'miss'],
    designSystemCache: [args['design-system-cache'], process.env.DESIGN_SYSTEM_CACHE, 'miss'],
    startedAt: [args['started-at'], process.env.PAGES_STARTED_AT, ''],
    published: [args.published, process.env.PAGES_PUBLISHED, 'false'],
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = Number(startedAt);
  const elapsedSec = Number.isFinite(startSec) && startSec > 0 ? Math.max(0, nowSec - startSec) : null;

  const isPublished = String(published).toLowerCase() === 'true';
  const isBundlesHit = String(bundlesCache).toLowerCase() === 'true';

  const summary = createSummaryWriter();
  summary.addHeading(
    isPublished ? '🛝 Playground publicado no GitHub Pages' : '⚡ Diagnóstico de Build do Playground',
    2,
  );

  if (isPublished) {
    summary.addQuote(`🚀 URL ativa: <a href="${PLAYGROUND_URL}">${PLAYGROUND_URL}</a>`);
  }

  if (eventName === 'push') {
    let actorNote = '👤 Push humano; deploy padrão habilitado.';
    if (pushActor === 'ploocky[bot]') {
      actorNote = '🤖 Push autenticado via Ploocky App; deploy habilitado.';
    } else if (pushActor.endsWith('[bot]')) {
      actorNote = `🤖 Bot GitHub (<code>${escapeHtml(pushActor)}</code>); deploy padrão habilitado.`;
    }

    summary
      .addHeading('🚀 Identidade do Gatilho', 3)
      .addTable([
        [
          { data: 'Campo', header: true },
          { data: 'Valor', header: true },
        ],
        ['Actor', `<code>${escapeHtml(pushActor)}</code>`],
        ['Author', `<code>${escapeHtml(commitAuthor || 'unknown')}</code>`],
        ['Committer', `<code>${escapeHtml(commitCommitter || 'unknown')}</code>`],
        ['Origem', actorNote],
      ]);
  }

  summary
    .addHeading('⚡ Métricas & Caches do Pipeline', 3)
    .addTable([
      [
        { data: 'Métrica', header: true },
        { data: 'Status / Valor', header: true },
      ],
      ['Cache de dependências', `<code>${escapeHtml(depsCache || 'miss')}</code>`],
      [
        'Cache de distribuição',
        isBundlesHit
          ? '⚡ <code>hit</code> (installers reutilizados sem rebuild Vite completo)'
          : `📦 <code>${escapeHtml(bundlesCache || 'miss')}</code> (compilado a partir do código-fonte)`,
      ],
      ['Cache de design-system', `<code>${escapeHtml(designSystemCache || 'miss')}</code>`],
      [
        'Tempo até saída estática',
        elapsedSec !== null ? `<code>${elapsedSec}s</code>` : '<i>N/A</i>',
      ],
    ]);

  await summary.write();

  log.summary('success', {
    Mode: 'report',
    Published: isPublished ? ansi.green('true') : 'false',
    ...(elapsedSec !== null ? { Duration: `${elapsedSec}s` } : {}),
  });
}

// ============================================================================
// Entrypoint Principal
// ============================================================================
export async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const mode = String(args.mode || process.env.PAGES_MODE || 'report').trim().toLowerCase();

  const log = new AgentReporter('PLAYGROUND PAGES', `Mode: ${mode}`);
  log.banner();

  let context = null;
  try {
    context = buildCliContext();
  } catch {
    // Execução local fora do GitHub Actions
  }

  switch (mode) {
    case 'sync-lockfile':
      await runSyncLockfile({ log, args });
      break;
    case 'detect-changes':
      await runDetectChanges({ log, args, context });
      break;
    case 'verify-deps':
      await runVerifyDeps({ log });
      break;
    case 'verify-dist':
      await runVerifyDist({ log, args });
      break;
    case 'verify-pages':
      await runVerifyPages({ log, args });
      break;
    case 'check-latest':
      await runCheckLatest({ log, args });
      break;
    case 'report':
      await runPublishReport({ log, args, context });
      break;
    default:
      throw new Error(
        `Modo inválido "${mode}". Use: sync-lockfile, detect-changes, verify-deps, verify-dist, verify-pages, check-latest ou report.`,
      );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
