#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';

// ============================================================================
// 1. CLI & Parse de Argumentos
// ============================================================================
const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`
${styleText(['bold', 'cyan'], 'validate-workflows')} — Valida caminhos de scripts (.js/.mjs/.cjs/.ts/.tsx) dentro de .github/workflows

${styleText('bold', 'USO:')}
  node validate-workflows.mjs [diretorioRepo] [flags]

${styleText('bold', 'FLAGS:')}
  --json          Imprime saída estruturada em JSON puro
  --annotations   Emite GitHub Actions annotations (::error)
  --strict        Retorna exit code 1 se encontrar caminhos inválidos
  -h, --help      Exibe esta ajuda
`);
  process.exit(0);
}

const isJson = rawArgs.includes('--json');
const isStrict = rawArgs.includes('--strict');
const emitAnnotations =
  rawArgs.includes('--annotations') || process.env.GITHUB_ACTIONS === 'true';
const positionalArgs = rawArgs.filter((arg) => !arg.startsWith('-'));

const repoRoot = path.resolve(positionalArgs[0] || process.cwd());
const workflowsDir = path.join(repoRoot, '.github', 'workflows');

const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.turbo',
  '.cache'
]);

const log = {
  step: (msg) => {
    if (!isJson) console.log(`${styleText('blue', 'ℹ')} ${msg}`);
  },
  success: (msg) => {
    if (!isJson) console.log(`${styleText('green', '✔')} ${msg}`);
  },
  warn: (msg) => {
    if (!isJson) console.log(`${styleText('yellow', '⚠')} ${msg}`);
  },
  error: (msg) => {
    if (!isJson) console.error(`${styleText('red', '✖')} ${msg}`);
  }
};

// ============================================================================
// 2. Helpers de Git & URL de Edição do GitHub
// ============================================================================
function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function getGitContext() {
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  let repository = process.env.GITHUB_REPOSITORY || '';

  if (!repository) {
    const remoteUrl = runGit(['remote', 'get-url', 'origin']) || '';
    const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    if (match) repository = match[1];
  }

  let branch =
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']) ||
    'main';

  if (branch === 'HEAD') {
    branch = runGit(['rev-parse', '--short', 'HEAD']) || 'main';
  }

  return { serverUrl, repository, branch };
}

function buildEditUrl(gitCtx, relWorkflowPath, line) {
  if (!gitCtx.repository) return null;
  const encodedBranch = gitCtx.branch
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const cleanPath = relWorkflowPath.replace(/\\/g, '/');
  return `${gitCtx.serverUrl}/${gitCtx.repository}/edit/${encodedBranch}/${cleanPath}#L${line}`;
}

// ============================================================================
// 3. Levenshtein & Sugestões de Arquivos Semelhantes
// ============================================================================
function levenshtein(a, b) {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  let prev = Array.from({ length: len2 + 1 }, (_, i) => i);
  let curr = new Array(len2 + 1);

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[len2];
}

function tokenizePath(p) {
  return p
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function findSimilarFiles(missingPath, allRepoScripts, limit = 4) {
  const cleanMissing = missingPath.replace(/^\.\//, '');
  const missingBase = path.basename(cleanMissing);
  const missingNoExt = path.basename(cleanMissing, path.extname(cleanMissing));
  const missingTokens = new Set(tokenizePath(cleanMissing));

  return allRepoScripts
    .map((candidate) => {
      const candBase = path.basename(candidate);
      const candNoExt = path.basename(candidate, path.extname(candidate));

      // Score por caminho completo
      const fullDist = levenshtein(cleanMissing, candidate);
      const fullMax = Math.max(cleanMissing.length, candidate.length);
      const fullScore = fullMax === 0 ? 1 : 1 - fullDist / fullMax;

      // Score focado no nome do arquivo (caso tenha movido de pasta ou trocado extensão .js -> .mjs)
      const baseDist = levenshtein(missingNoExt, candNoExt);
      const baseMax = Math.max(missingNoExt.length, candNoExt.length);
      const baseScore = baseMax === 0 ? 1 : 1 - baseDist / baseMax;

      // Score por tokens em comum
      const candTokens = tokenizePath(candidate);
      let tokenMatches = 0;
      for (const t of candTokens) {
        if (missingTokens.has(t)) tokenMatches++;
      }
      const tokenScore =
        missingTokens.size > 0 && candTokens.length > 0
          ? tokenMatches / Math.max(missingTokens.size, candTokens.length)
          : 0;

      let score = Math.max(fullScore, baseScore * 0.85, fullScore * 0.5 + tokenScore * 0.5);
      if (candBase === missingBase) score = Math.max(score, 0.92);

      return {
        path: candidate,
        similarity: Math.round(score * 100),
        score,
        fullDist
      };
    })
    .filter((item) => item.score >= 0.45)
    .sort((a, b) => b.score - a.score || a.fullDist - b.fullDist)
    .slice(0, limit)
    .map(({ path: p, similarity }) => ({ path: p, similarity }));
}

// ============================================================================
// 4. Indexação de Scripts do Repositório e Parser de Workflows
// ============================================================================
function indexAllRepoScripts(rootDir) {
  const scripts = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (SCRIPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        scripts.push(rel);
      }
    }
  }

  walk(rootDir);
  return scripts.sort();
}

function getWorkflowFiles(wfDir) {
  if (!fs.existsSync(wfDir)) return [];
  return fs
    .readdirSync(wfDir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        (e.name.endsWith('.yml') || e.name.endsWith('.yaml'))
    )
    .map((e) => path.join(wfDir, e.name))
    .sort();
}

/**
 * Extrai snippet real do YAML ao redor da linha com problema (contexto de +-2 linhas)
 */
function extractCodeSnippet(lines, targetLineIndex, contextRadius = 2) {
  const start = Math.max(0, targetLineIndex - contextRadius);
  const end = Math.min(lines.length - 1, targetLineIndex + contextRadius);
  const snippetLines = [];

  for (let i = start; i <= end; i++) {
    const lineNum = i + 1;
    const prefix = i === targetLineIndex ? '>' : ' ';
    snippetLines.push(`${prefix} ${String(lineNum).padStart(3, ' ')} | ${lines[i]}`);
  }

  return snippetLines.join('\n');
}

/**
 * Varre cada arquivo de workflow procurando referências a arquivos .js/.mjs/.cjs/.ts/.tsx
 * em comandos shell (run:), inputs (with:), env, etc.
 */
function analyzeWorkflowFile(absWorkflowPath, allRepoScripts, gitCtx) {
  const content = fs.readFileSync(absWorkflowPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const relWorkflowPath = path.relative(repoRoot, absWorkflowPath).replace(/\\/g, '/');

  const findings = [];
  const generated = new Set();
  let currentWorkingDir = null;
  let currentWorkingDirIndent = -1;

  // Captura tokens que terminam com .js, .mjs, .cjs, .ts ou .tsx
  // Only inspect literal entrypoints passed to a script interpreter.
  const fileRefRegex = /(?:^|[\s;&|])(?:node|tsx|ts-node|bun|deno\s+run)\s+(?:--[\w-]+(?:=[^\s]+)?\s+)*["']?([\w./-]+\.(?:mjs|cjs|tsx|ts|js))(?=$|[\s"' ;&|])/g;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNum = i + 1;
    const indent = rawLine.match(/^\s*/)[0].length;

    // Reseta working-directory se saiu do bloco do step/job
    if (rawLine.trim().length > 0 && indent <= currentWorkingDirIndent) {
      currentWorkingDir = null;
      currentWorkingDirIndent = -1;
    }

    // Ignora comentários YAML
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('#')) continue;

    // Detecta working-directory no step ou defaults
    const wdMatch = trimmed.match(/^working-directory:\s*['"]?([^'"#\s]+)['"]?/);
    if (wdMatch) {
      currentWorkingDir = wdMatch[1];
      currentWorkingDirIndent = indent;
      continue;
    }

    // Ignora globs de filtro de trigger (ex: paths: ['**.ts'])
    if (trimmed.startsWith('-') && trimmed.includes('*')) continue;

    // YAML metadata, artifact paths and prose are not executable commands.
    if (/^(?:-\s*)?(?:name|uses|path|paths|description|if|echo):/.test(trimmed)) continue;
    if (/^(?:echo|printf)\s/.test(trimmed)) continue;
    // Track literal output paths produced earlier in this workflow.
    for (const output of rawLine.matchAll(/(?:^|\s)--out(?:=|\s+)["']?([\w./-]+\.(?:mjs|cjs|tsx|ts|js))(?=$|[\s"'])/g)) {
      generated.add(path.resolve(repoRoot, currentWorkingDir || '.', output[1]));
    }
    fileRefRegex.lastIndex = 0;
    let match;

    while ((match = fileRefRegex.exec(rawLine)) !== null) {
      const rawRef = match[1];
      const col = match.index + match[0].indexOf(rawRef) + 1;

      // Ignora URLs remotas (https://...) e variáveis dinâmicas não resolvíveis (${{ ... }} ou $VAR)
      if (
        rawRef.startsWith('http://') ||
        rawRef.startsWith('https://') ||
        rawRef.includes('$') ||
        rawRef.includes('*')
      ) {
        continue;
      }

      // Ignora redirecionamentos de saída (ex: > output.js ou 2> log.js)
      const beforeRef = rawLine.slice(0, col - 1).trimEnd();
      if (beforeRef.endsWith('>') || beforeRef.endsWith('>>')) {
        continue;
      }

      // Resolve o caminho considerando working-directory (se houver) ou a raiz do repositório
      const baseDir = currentWorkingDir
        ? path.resolve(repoRoot, currentWorkingDir)
        : repoRoot;

      const resolvedAbs = path.resolve(baseDir, rawRef);
      const exists = fs.existsSync(resolvedAbs) && fs.statSync(resolvedAbs).isFile();

      if (!exists && !generated.has(resolvedAbs)) {
        const normalizedRef = path.relative(repoRoot, resolvedAbs).replace(/\\/g, '/');
        const suggestions = findSimilarFiles(normalizedRef, allRepoScripts);
        const editUrl = buildEditUrl(gitCtx, relWorkflowPath, lineNum);
        const snippet = extractCodeSnippet(lines, i, 2);

        const suggText =
          suggestions.length > 0
            ? ` Você quis dizer: ${suggestions.map((s) => `${s.path} (${s.similarity}%)`).join(', ')}?`
            : '';

        const annotationRaw = `::error file=${relWorkflowPath},line=${lineNum},col=${col},title=INVALID_WORKFLOW_SCRIPT::O arquivo '${rawRef}' referenciado neste workflow não existe.${suggText}`;

        findings.push({
          workflowFile: relWorkflowPath,
          line: lineNum,
          col,
          referencedPath: rawRef,
          resolvedRelativePath: normalizedRef,
          workingDirectory: currentWorkingDir,
          lineContent: rawLine.trim(),
          snippet,
          editUrl,
          suggestions,
          annotationRaw
        });
      }
    }
  }

  return findings;
}

// ============================================================================
// 5. Execução Principal
// ============================================================================
function main() {
  const startTime = performance.now();
  const gitCtx = getGitContext();

  if (!fs.existsSync(workflowsDir)) {
    const emptyReport = {
      repository: gitCtx.repository,
      branch: gitCtx.branch,
      workflowsScanned: 0,
      totalScriptsIndexed: 0,
      invalidCount: 0,
      existingScripts: [],
      invalidReferences: []
    };
    if (isJson) {
      console.log(JSON.stringify(emptyReport, null, 2));
    } else {
      log.warn(`Diretório ${styleText('dim', '.github/workflows')} não encontrado em ${repoRoot}.`);
    }
    return;
  }

  const allRepoScripts = indexAllRepoScripts(repoRoot);
  const workflowFiles = getWorkflowFiles(workflowsDir);

  const allFindings = [];
  for (const wfFile of workflowFiles) {
    allFindings.push(...analyzeWorkflowFile(wfFile, allRepoScripts, gitCtx));
  }

  const elapsed = (performance.now() - startTime).toFixed(1);

  const report = {
    repository: gitCtx.repository,
    branch: gitCtx.branch,
    workflowsScanned: workflowFiles.length,
    totalScriptsIndexed: allRepoScripts.length,
    invalidCount: allFindings.length,
    existingScripts: allRepoScripts,
    invalidReferences: allFindings
  };

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    if (isStrict && allFindings.length > 0) process.exit(1);
    return;
  }

  console.log('');
  log.step(
    `Analisados ${styleText('bold', String(workflowFiles.length))} workflow(s) contra ${styleText('bold', String(allRepoScripts.length))} script(s) do repositório ${styleText('dim', `(${elapsed}ms)`)}`
  );

  if (allFindings.length === 0) {
    log.success('Todas as referências de scripts nos workflows são válidas!\n');
    return;
  }

  log.error(
    `Encontrado(s) ${styleText(['bold', 'red'], String(allFindings.length))} caminho(s) de script inválido(s):\n`
  );

  for (const item of allFindings) {
    console.log(
      `📄 ${styleText(['bold', 'yellow'], `${item.workflowFile}:${item.line}:${item.col}`)} — arquivo inexistente: ${styleText(['bold', 'red'], item.referencedPath)}`
    );

    if (item.suggestions.length > 0) {
      const formattedSuggs = item.suggestions
        .map((s) => `${styleText('green', s.path)} ${styleText('dim', `(${s.similarity}%)`)}`)
        .join(', ');
      console.log(`   ${styleText('yellow', '💡 Você quis dizer:')} ${formattedSuggs}`);
    }

    if (item.editUrl) {
      console.log(`   ${styleText('cyan', '✏️  Editar na branch:')} ${item.editUrl}`);
    }

    console.log(styleText('dim', '   ┌──────────────────────────────────────────────────────────────'));
    for (const sLine of item.snippet.split('\n')) {
      const isTarget = sLine.startsWith('>');
      console.log(`   ${isTarget ? styleText('red', sLine) : styleText('dim', sLine)}`);
    }
    console.log(styleText('dim', '   └──────────────────────────────────────────────────────────────\n'));
  }

  if (emitAnnotations) {
    for (const item of allFindings) {
      console.log(item.annotationRaw);
    }
  }

  if (isStrict) {
    process.exit(1);
  }
}

main();
