#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import ts from 'typescript';

// ============================================================================
// 1. CLI & Parse de Argumentos
// ============================================================================
const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`
${styleText(['bold', 'cyan'], 'find-fn')} — Inspetor AST de funções, marcadores de refatoração e auditoria de PR/Commit

${styleText('bold', 'USO:')}
  node find-fn.mjs [alvo] [diretorio] [flags]

${styleText('bold', 'EXEMPLOS:')}
  node find-fn.mjs                          ${styleText('dim', '# Lista funções, TODO/FIXME e audita o PR/commit atual')}
  node find-fn.mjs calcularFrete            ${styleText('dim', '# Busca a função "calcularFrete" e exibe o bloco completo')}
  node find-fn.mjs src/api.ts --watch       ${styleText('dim', '# Monitora um arquivo específico em tempo real')}
  node find-fn.mjs --tasks                  ${styleText('dim', '# Exibe apenas TODO, EXTRACT, REFACTOR e diagnósticos FIXME')}
  node find-fn.mjs --base origin/main       ${styleText('dim', '# Audita comentários novos e funções repetidas contra origin/main')}
  node find-fn.mjs --json                   ${styleText('dim', '# Saída estruturada em JSON puro (inclui "code" e "gitAudit")')}

${styleText('bold', 'FLAGS:')}
  -w, --watch       Monitora alterações no arquivo ou diretório alvo
  --tasks           Mostra apenas comentários de refatoração e diagnósticos FIXME
  --no-code         Oculta o bloco de código completo na saída visual do terminal
  --base <ref>      Define a ref base do Git para auditoria de PR/commit (ex: main, HEAD~1)
  --no-git          Desativa a auditoria de diff do Git
  --json            Silencia logs visuais e imprime apenas JSON válido
  --no-cache        Força reanálise completa ignorando o cache em disco
  -h, --help        Exibe esta ajuda
`);
  process.exit(0);
}

const isJson = rawArgs.includes('--json');
const isWatch = rawArgs.includes('--watch') || rawArgs.includes('-w');
const onlyTasks = rawArgs.includes('--tasks') || rawArgs.includes('--todos');
const hideCode = rawArgs.includes('--no-code');
const noCache = rawArgs.includes('--no-cache');
const noGit = rawArgs.includes('--no-git');

let explicitGitBase = null;
const positionalArgs = [];

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--base' && rawArgs[i + 1]) {
    explicitGitBase = rawArgs[++i];
  } else if (arg.startsWith('--base=')) {
    explicitGitBase = arg.slice('--base='.length);
  } else if (!arg.startsWith('-')) {
    positionalArgs.push(arg);
  }
}

let targetFunctionName = null;
let targetPath = process.cwd();

if (positionalArgs.length === 1) {
  if (fs.existsSync(positionalArgs[0])) {
    targetPath = path.resolve(positionalArgs[0]);
  } else {
    targetFunctionName = positionalArgs[0];
  }
} else if (positionalArgs.length >= 2) {
  targetFunctionName = positionalArgs[0];
  targetPath = path.resolve(positionalArgs[1]);
}

if (!fs.existsSync(targetPath)) {
  if (isJson) {
    console.error(JSON.stringify({ error: `Caminho não encontrado: ${targetPath}` }));
  } else {
    console.error(styleText('red', `✖ Erro: Caminho não encontrado -> ${targetPath}`));
  }
  process.exit(1);
}

const isSingleFile = fs.statSync(targetPath).isFile();

function findProjectRoot(startPath) {
  let current = fs.statSync(startPath).isFile() ? path.dirname(startPath) : startPath;
  const { root } = path.parse(current);

  while (current !== root) {
    if (
      fs.existsSync(path.join(current, 'package.json')) ||
      fs.existsSync(path.join(current, '.git'))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  return fs.statSync(startPath).isFile() ? path.dirname(startPath) : startPath;
}

const projectRoot = findProjectRoot(targetPath);

// ============================================================================
// 2. Configurações, Logs & Sistema de Cache (RAM + Disco)
// ============================================================================
const CACHE_VERSION = 4; // Inclui isClassMember e ignora closures/funções aninhadas
const CACHE_DIR = path.join(projectRoot, 'node_modules', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'find-fn-ast.json');

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
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

const GENERIC_FUNCTION_NAMES = new Set([
  'default',
  'main',
  'run',
  'init',
  'setup',
  'teardown',
  'start',
  'stop',
  'close',
  'dispose',
  'destroy',
  'execute',
  'handler',
  'handle',
  'render',
  'update',
  'reset',
  'clear',
  'parse',
  'format',
  'validate',
  'build',
  'create',
  'get',
  'set'
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
  watch: (msg) => {
    if (!isJson) {
      const time = styleText('dim', `[${new Date().toLocaleTimeString()}]`);
      console.log(`${styleText('magenta', '👀')} ${time} ${msg}`);
    }
  }
};

const memoryCache = new Map();
let cacheDirty = false;

function loadDiskCache() {
  if (noCache) return;
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    if (raw.version !== CACHE_VERSION || !raw.entries) return;

    for (const [absFile, entry] of Object.entries(raw.entries)) {
      memoryCache.set(absFile, entry);
    }
  } catch {
    // Ignora cache corrompido
  }
}

function saveDiskCache() {
  if (noCache || !cacheDirty) return;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const serialized = {
      version: CACHE_VERSION,
      entries: Object.fromEntries(memoryCache)
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(serialized), 'utf-8');
    cacheDirty = false;
  } catch {
    // Falha silenciosa
  }
}

loadDiskCache();

// ============================================================================
// 3. Levenshtein Zero-Allocation + Token Overlap
// ============================================================================
let levBufferA = new Int32Array(256);
let levBufferB = new Int32Array(256);

function levenshtein(a, b) {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  if (len2 + 1 > levBufferA.length) {
    const newSize = Math.max(len2 + 1, levBufferA.length * 2);
    levBufferA = new Int32Array(newSize);
    levBufferB = new Int32Array(newSize);
  }

  for (let j = 0; j <= len2; j++) levBufferA[j] = j;

  for (let i = 1; i <= len1; i++) {
    levBufferB[0] = i;
    const c1 = s1.charCodeAt(i - 1);

    for (let j = 1; j <= len2; j++) {
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      const del = levBufferA[j] + 1;
      const ins = levBufferB[j - 1] + 1;
      const sub = levBufferA[j - 1] + cost;
      levBufferB[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }

    const tmp = levBufferA;
    levBufferA = levBufferB;
    levBufferB = tmp;
  }

  return levBufferA[len2];
}

const tokenCache = new Map();
function tokenizeIdentifier(str) {
  let cached = tokenCache.get(str);
  if (cached) return cached;

  cached = str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  tokenCache.set(str, cached);
  return cached;
}

function findBestMatches(query, candidates, limit = 3) {
  if (!query || candidates.length === 0) return [];

  const qLower = query.toLowerCase();
  const qLen = qLower.length;
  const qTokens = new Set(tokenizeIdentifier(query));
  const results = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const cLower = candidate.toLowerCase();
    const maxLen = Math.max(qLen, cLower.length);

    const hasSubstring = cLower.includes(qLower) || qLower.includes(cLower);
    if (!hasSubstring && Math.abs(qLen - cLower.length) / maxLen > 0.65) {
      continue;
    }

    const dist = levenshtein(qLower, cLower);
    let score = maxLen === 0 ? 1 : 1 - dist / maxLen;

    if (hasSubstring) {
      score = Math.min(1, score + 0.25);
    }

    const cTokens = tokenizeIdentifier(candidate);
    if (qTokens.size > 0 && cTokens.length > 0) {
      let matches = 0;
      for (let t = 0; t < cTokens.length; t++) {
        if (qTokens.has(cTokens[t])) matches++;
      }
      const tokenScore = matches / Math.max(qTokens.size, cTokens.length);
      score = Math.max(score, score * 0.6 + tokenScore * 0.4);
    }

    if (score >= 0.42) {
      results.push({ name: candidate, similarity: Math.round(score * 100), score, dist });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.dist - b.dist)
    .slice(0, limit)
    .map(({ name, similarity }) => ({ name, similarity }));
}

// ============================================================================
// 4. Varredura de Arquivos, Normalização de Corpo e Análise AST
// ============================================================================
function getFilesToScan(entryPath) {
  if (fs.statSync(entryPath).isFile()) {
    return EXTENSIONS.has(path.extname(entryPath)) ? [entryPath] : [];
  }

  const fileList = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (IGNORE_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (EXTENSIONS.has(path.extname(entry.name))) {
        fileList.push(fullPath);
      }
    }
  }
  walk(entryPath);
  return fileList;
}

function getScriptKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function extractSignature(node, sourceFile, fullText) {
  const start = node.getStart(sourceFile);
  const end = node.body ? node.body.getStart(sourceFile) : node.getEnd();

  let signature = fullText.slice(start, end).trim();
  if (signature.endsWith('=>')) {
    signature = signature.slice(0, -2).trim();
  }
  return signature.replace(/\s+/g, ' ');
}

function dedentCode(rawCode) {
  const lines = rawCode.split('\n');
  let minIndent = Infinity;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const leadingSpaces = line.match(/^[ \t]*/)[0].length;
    if (leadingSpaces < minIndent) {
      minIndent = leadingSpaces;
    }
  }

  if (minIndent === Infinity || minIndent === 0) {
    return rawCode;
  }

  return lines
    .map((line) => (line.trim().length === 0 ? '' : line.slice(minIndent)))
    .join('\n');
}

/**
 * Normaliza o corpo da função (remove comentários, espaços e colapsa literais)
 * para detectar funções copiadas/repetidas mesmo com nomes diferentes.
 */
function computeBodyFingerprint(bodyNode, fullText) {
  if (!bodyNode) return { hash: null, normalized: '' };

  const rawBody = fullText.slice(bodyNode.getStart(), bodyNode.getEnd());
  const normalized = rawBody
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') // remove comentários internos
    .replace(/\s+/g, '')                      // remove espaços e quebras de linha
    .trim();

  if (normalized.length < 15) {
    // Evita falsos positivos em funções triviais como "() => {}" ou "() => null"
    return { hash: null, normalized };
  }

  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12);
  return { hash, normalized };
}

const KEYWORD_REGEX = /\b(TODO|EXTRACT|REFACTOR|FIXME)\b/i;
const FIXME_EXTRACT_REGEX = /FIXME\s*\(\s*([a-zA-Z0-9_$]+)\s*\)\s*:\s*extract\s+to\s+([^\s*]+)/i;

function extractCommentsFast(sourceFile, fullText) {
  if (!KEYWORD_REGEX.test(fullText)) {
    return [];
  }

  const comments = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    fullText
  );

  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const rawText = scanner.getTokenText();
      if (KEYWORD_REGEX.test(rawText)) {
        const startPos = scanner.getTokenPos();
        const endPos = scanner.getTextPos();

        const startLine = sourceFile.getLineAndCharacterOfPosition(startPos).line + 1;
        const endLine = sourceFile.getLineAndCharacterOfPosition(endPos).line + 1;

        const cleanText = rawText
          .replace(/^\/\*+|\*+\/$/g, '')
          .split('\n')
          .map((line) => line.replace(/^\s*(\/\/|\*)\s?/, '').trim())
          .filter(Boolean)
          .join(' ');

        const fixmeMatch = cleanText.match(FIXME_EXTRACT_REGEX);
        const keywordMatch = cleanText.match(KEYWORD_REGEX);

        comments.push({
          type: fixmeMatch ? 'FIXME_EXTRACT' : keywordMatch[1].toUpperCase(),
          text: cleanText,
          startLine,
          endLine,
          fixmeTargetFn: fixmeMatch ? fixmeMatch[1] : null,
          fixmeTargetPath: fixmeMatch ? fixmeMatch[2].replace(/['"`]/g, '') : null
        });
      }
    }
    token = scanner.scan();
  }

  return comments;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function analyzeFileCached(filePath) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    memoryCache.delete(filePath);
    return { data: { functions: [], allSymbols: [], comments: [] }, fromCache: false };
  }

  const cached = memoryCache.get(filePath);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return { data: cached.data, fromCache: true };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { data: { functions: [], allSymbols: [], comments: [] }, fromCache: false };
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  const functions = [];
  const allSymbols = new Set();

  function visit(node, insideFunctionScope = false) {
    let fnName = null;
    let targetNode = node;
    let fnImplNode = node;
    let isClassMember = false;

    // Coleta símbolos apenas fora de closures/funções internas
    if (!insideFunctionScope) {
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node)) &&
        node.name
      ) {
        allSymbols.add(node.name.text);
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        allSymbols.add(node.name.text);
      }
    }

    // Extrai apenas funções top-level do módulo ou membros diretos de classe
    if (!insideFunctionScope) {
      if (ts.isFunctionDeclaration(node)) {
        fnName = node.name ? node.name.text : 'default';
      } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
        fnName = node.name.text;
        isClassMember = true;
        allSymbols.add(fnName);
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        fnName = node.name.text;
        fnImplNode = node.initializer;
        if (
          node.parent &&
          ts.isVariableDeclarationList(node.parent) &&
          ts.isVariableStatement(node.parent.parent)
        ) {
          targetNode = node.parent.parent;
        }
      } else if (
        ts.isPropertyDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        fnName = node.name.text;
        fnImplNode = node.initializer;
        isClassMember = true;
        allSymbols.add(fnName);
      }
    }

    if (fnName) {
      const nodeStart = targetNode.getStart(sourceFile);
      const nodeEnd = targetNode.getEnd();

      const startLine = sourceFile.getLineAndCharacterOfPosition(nodeStart).line + 1;
      const endLine = sourceFile.getLineAndCharacterOfPosition(nodeEnd).line + 1;

      const signature = extractSignature(fnImplNode, sourceFile, content);

      const prefix = ts.isVariableStatement(targetNode)
        ? content
            .slice(nodeStart, node.initializer.getStart(sourceFile))
            .replace(/\s+/g, ' ')
            .trim() + ' '
        : '';

      const rawCode = content.slice(nodeStart, nodeEnd);
      const cleanCode = dedentCode(rawCode);
      const { hash: bodyHash, normalized: normalizedBody } = computeBodyFingerprint(
        fnImplNode.body,
        content
      );

      functions.push({
        name: fnName,
        isClassMember,
        startLine,
        endLine,
        signature: `${prefix}${signature}`.trim(),
        code: cleanCode,
        bodyHash,
        normalizedBody
      });
    }

    const nextInsideScope = insideFunctionScope || isFunctionLike(node);
    ts.forEachChild(node, (child) => visit(child, nextInsideScope));
  }

  visit(sourceFile, false);
  const comments = extractCommentsFast(sourceFile, content);

  const parsedData = {
    functions,
    allSymbols: Array.from(allSymbols),
    comments
  };

  memoryCache.set(filePath, {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    data: parsedData
  });
  cacheDirty = true;

  return { data: parsedData, fromCache: false };
}

// ============================================================================
// 5. Auditoria Git (PR / Commit): Comentários Introduzidos & Funções Repetidas
// ============================================================================
function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Descobre o diff ativo (PR via GITHUB_BASE_REF, --base, staged, unstaged ou último commit)
 * e retorna um Map<absFilePath, Set<addedLineNumbers>>
 */
function getGitAddedLines() {
  if (noGit) return null;

  const isGitRepo = runGit(['rev-parse', '--is-inside-work-tree']);
  if (isGitRepo !== 'true') return null;

  let diffMode = '';
  let diffOutput = '';

  if (explicitGitBase) {
    diffMode = `base (${explicitGitBase}...HEAD)`;
    diffOutput = runGit(['diff', '-U0', `${explicitGitBase}...HEAD`]) ?? '';
  } else if (process.env.GITHUB_BASE_REF) {
    const baseRef = `origin/${process.env.GITHUB_BASE_REF}`;
    diffMode = `PR (${baseRef}...HEAD)`;
    diffOutput = runGit(['diff', '-U0', `${baseRef}...HEAD`]) ?? '';
  } else {
    // Tenta staged -> unstaged -> último commit (HEAD~1..HEAD)
    const staged = runGit(['diff', '-U0', '--cached']);
    const unstaged = runGit(['diff', '-U0']);

    if (staged) {
      diffMode = 'staged changes';
      diffOutput = staged;
    } else if (unstaged) {
      diffMode = 'working tree changes';
      diffOutput = unstaged;
    } else {
      const lastCommit = runGit(['diff', '-U0', 'HEAD~1..HEAD']);
      if (lastCommit) {
        diffMode = 'último commit (HEAD~1..HEAD)';
        diffOutput = lastCommit;
      }
    }
  }

  if (!diffOutput) return null;

  const addedLinesByFile = new Map();
  let currentAbsFile = null;

  const lines = diffOutput.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Cabeçalho de arquivo destino no unified diff: +++ b/src/arquivo.ts
    if (line.startsWith('+++ b/')) {
      const relPath = line.slice(6).trim();
      currentAbsFile = path.resolve(projectRoot, relPath);
      if (!addedLinesByFile.has(currentAbsFile)) {
        addedLinesByFile.set(currentAbsFile, new Set());
      }
    } else if (line.startsWith('@@ ') && currentAbsFile) {
      // Formato: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      if (match) {
        const startLine = Number(match[1]);
        const count = match[2] !== undefined ? Number(match[2]) : 1;
        const lineSet = addedLinesByFile.get(currentAbsFile);

        for (let offset = 0; offset < count; offset++) {
          lineSet.add(startLine + offset);
        }
      }
    }
  }

  return { diffMode, addedLinesByFile };
}

function auditGitChanges(repoFilesData, gitDiff) {
  if (!gitDiff || gitDiff.addedLinesByFile.size === 0) {
    return null;
  }

  const introducedComments = [];
  const duplicateFunctions = [];

  // Índice global de todas as funções existentes no repositório
  const allRepoFunctions = [];
  for (const fileData of repoFilesData) {
    for (const fn of fileData.functions) {
      allRepoFunctions.push({
        absFile: fileData.absFile,
        relFile: path.relative(process.cwd(), fileData.absFile) || path.basename(fileData.absFile),
        ...fn
      });
    }
  }

  for (const fileData of repoFilesData) {
    const addedLines = gitDiff.addedLinesByFile.get(fileData.absFile);
    if (!addedLines || addedLines.size === 0) continue;

    const currentRelFile =
      path.relative(process.cwd(), fileData.absFile) || path.basename(fileData.absFile);

    // 1. Verifica comentários introduzidos nas linhas adicionadas pelo PR/commit
    for (const task of fileData.tasks) {
      let wasIntroduced = false;
      for (let l = task.startLine; l <= task.endLine; l++) {
        if (addedLines.has(l)) {
          wasIntroduced = true;
          break;
        }
      }

      if (wasIntroduced) {
        task.introducedInDiff = true;
        introducedComments.push({
          file: currentRelFile,
          githubRange: `${currentRelFile.replace(/\\/g, '/')}#L${task.startLine}-L${task.endLine}`,
          type: task.type,
          text: task.text,
          startLine: task.startLine,
          endLine: task.endLine,
          nearbyFunction: task.nearbyFunction
            ? {
                name: task.nearbyFunction.name,
                startLine: task.nearbyFunction.startLine,
                endLine: task.nearbyFunction.endLine,
                signature: task.nearbyFunction.signature
              }
            : null,
          diagnostics: task.diagnostics
        });
      }
    }

    // 2. Verifica funções adicionadas ou modificadas no diff que repetem código ou nome já existente
    for (const fn of fileData.functions) {
      let touchedInDiff = false;
      for (let l = fn.startLine; l <= fn.endLine; l++) {
        if (addedLines.has(l)) {
          touchedInDiff = true;
          break;
        }
      }
      if (!touchedInDiff) continue;

      const matches = [];

      for (const existing of allRepoFunctions) {
        // Ignora a própria ocorrência exata
        if (existing.absFile === fileData.absFile && existing.startLine === fn.startLine) {
          continue;
        }

        // Critério A: Corpo exatamente igual (mesmo hash AST normalizado)
        if (fn.bodyHash && existing.bodyHash && fn.bodyHash === existing.bodyHash) {
          matches.push({
            reason: 'IDENTICAL_BODY',
            similarity: 100,
            file: existing.relFile,
            name: existing.name,
            startLine: existing.startLine,
            endLine: existing.endLine,
            signature: existing.signature,
            githubRange: `${existing.relFile.replace(/\\/g, '/')}#L${existing.startLine}-L${existing.endLine}`
          });
          continue;
        }

        // Critério B: Mesmo nome de função top-level já existente
        // Ignora métodos de classe e nomes genéricos de entrypoint/lifecycle (run, main, handler, etc.)
        if (
          !fn.isClassMember &&
          !existing.isClassMember &&
          fn.name === existing.name &&
          fn.name.length > 3 &&
          !GENERIC_FUNCTION_NAMES.has(fn.name.toLowerCase())
        ) {
          matches.push({
            reason: 'DUPLICATE_NAME',
            similarity: 100,
            file: existing.relFile,
            name: existing.name,
            startLine: existing.startLine,
            endLine: existing.endLine,
            signature: existing.signature,
            githubRange: `${existing.relFile.replace(/\\/g, '/')}#L${existing.startLine}-L${existing.endLine}`
          });
          continue;
        }

        // Critério C: Corpo muito semelhante (>85% de similaridade estrutural)
        if (
          fn.normalizedBody.length >= 40 &&
          existing.normalizedBody.length >= 40
        ) {
          const maxLen = Math.max(fn.normalizedBody.length, existing.normalizedBody.length);
          const minLen = Math.min(fn.normalizedBody.length, existing.normalizedBody.length);
          if (minLen / maxLen >= 0.85) {
            const dist = levenshtein(fn.normalizedBody, existing.normalizedBody);
            const sim = Math.round((1 - dist / maxLen) * 100);
            if (sim >= 85) {
              matches.push({
                reason: 'SIMILAR_BODY',
                similarity: sim,
                file: existing.relFile,
                name: existing.name,
                startLine: existing.startLine,
                endLine: existing.endLine,
                signature: existing.signature,
                githubRange: `${existing.relFile.replace(/\\/g, '/')}#L${existing.startLine}-L${existing.endLine}`
              });
            }
          }
        }
      }

      if (matches.length > 0) {
        duplicateFunctions.push({
          file: currentRelFile,
          name: fn.name,
          startLine: fn.startLine,
          endLine: fn.endLine,
          signature: fn.signature,
          githubRange: `${currentRelFile.replace(/\\/g, '/')}#L${fn.startLine}-L${fn.endLine}`,
          code: fn.code,
          existingMatches: matches
        });
      }
    }
  }

  return {
    diffMode: gitDiff.diffMode,
    introducedCommentsCount: introducedComments.length,
    duplicateFunctionsCount: duplicateFunctions.length,
    introducedComments,
    duplicateFunctions
  };
}

// ============================================================================
// 6. Auditoria de Comentários, Proximidade de Funções e FIXME Diagnostics
// ============================================================================
function resolveTasksAndDiagnostics(repoFilesData) {
  const repoIndex = new Map();
  const allGlobalFunctionNames = new Set();

  for (const data of repoFilesData) {
    repoIndex.set(data.relFile, {
      absFile: data.absFile,
      symbols: new Set(data.allSymbols),
      functions: data.functions
    });
    for (const fn of data.functions) {
      allGlobalFunctionNames.add(fn.name);
    }
  }

  const allRepoRelFiles = Array.from(repoIndex.keys());
  const allGlobalFnsArray = Array.from(allGlobalFunctionNames);

  for (const data of repoFilesData) {
    if (data.comments.length === 0) {
      data.tasks = [];
      continue;
    }

    data.tasks = data.comments.map((comment) => {
      const nearbyFn = data.functions.find(
        (fn) => fn.startLine >= comment.endLine && fn.startLine - comment.endLine <= 15
      );

      const task = {
        type: comment.type,
        text: comment.text,
        startLine: comment.startLine,
        endLine: comment.endLine,
        introducedInDiff: false,
        nearbyFunction: nearbyFn
          ? {
              name: nearbyFn.name,
              startLine: nearbyFn.startLine,
              endLine: nearbyFn.endLine,
              signature: nearbyFn.signature,
              code: nearbyFn.code
            }
          : null,
        diagnostics: null
      };

      if (comment.type === 'FIXME_EXTRACT') {
        const targetFn = comment.fixmeTargetFn;
        const rawTargetPath = comment.fixmeTargetPath;

        const candidateFromFile = path.resolve(path.dirname(data.absFile), rawTargetPath);
        const candidateFromRoot = path.resolve(projectRoot, rawTargetPath);

        const actualDestAbsPath = fs.existsSync(candidateFromFile)
          ? candidateFromFile
          : fs.existsSync(candidateFromRoot)
            ? candidateFromRoot
            : null;

        const destRelPath = actualDestAbsPath
          ? path.relative(projectRoot, actualDestAbsPath)
          : rawTargetPath;

        const fnExistsLocally = data.functions.some((f) => f.name === targetFn);
        const localSuggestions = fnExistsLocally
          ? []
          : findBestMatches(
              targetFn,
              data.functions.map((f) => f.name)
            );
        const globalSuggestions =
          fnExistsLocally || localSuggestions.length > 0
            ? []
            : findBestMatches(targetFn, allGlobalFnsArray);

        const destEntry = actualDestAbsPath ? repoIndex.get(destRelPath) : null;
        const symbolAlreadyInDest = destEntry ? destEntry.symbols.has(targetFn) : false;
        const similarSymbolsInDest =
          destEntry && !symbolAlreadyInDest
            ? findBestMatches(targetFn, Array.from(destEntry.symbols))
            : [];

        const similarFiles = actualDestAbsPath
          ? []
          : findBestMatches(rawTargetPath, allRepoRelFiles);

        task.diagnostics = {
          targetFunction: targetFn,
          functionExistsInCurrentFile: fnExistsLocally,
          similarLocalFunctions: localSuggestions,
          similarGlobalFunctions: globalSuggestions,
          targetPath: destRelPath,
          targetFileExists: Boolean(actualDestAbsPath),
          similarFiles,
          symbolConflictInTargetFile: symbolAlreadyInDest,
          similarSymbolsInTargetFile: similarSymbolsInDest
        };
      }

      return task;
    });
  }
}

// ============================================================================
// 7. Helpers de Renderização Visual
// ============================================================================
function renderPrettyCodeBlock(fn) {
  const codeLines = fn.code.split('\n');
  const maxLineNumWidth = String(fn.endLine).length;
  const borderWidth = 64;

  const topBorder = `   ${styleText('dim', '┌' + '─'.repeat(borderWidth))}`;
  const bottomBorder = `   ${styleText('dim', '└' + '─'.repeat(borderWidth))}`;

  console.log(topBorder);
  for (let i = 0; i < codeLines.length; i++) {
    const currentLineNum = String(fn.startLine + i).padStart(maxLineNumWidth, ' ');
    const gutter = styleText('dim', `   │ ${currentLineNum} │ `);
    console.log(`${gutter}${styleText('white', codeLines[i])}`);
  }
  console.log(bottomBorder);
}

// ============================================================================
// 8. Execução e Renderização
// ============================================================================
function runAnalysis() {
  const startTime = performance.now();
  const relTarget = path.relative(process.cwd(), targetPath) || '.';

  if (!isJson) {
    console.log('');
    if (targetFunctionName) {
      log.step(
        `Buscando ${styleText(['bold', 'cyan'], targetFunctionName)} e marcadores em ${styleText('dim', relTarget)}...`
      );
    } else {
      log.step(`Analisando funções e marcadores em ${styleText('dim', relTarget)}...`);
    }
  }

  const allProjectFiles = getFilesToScan(projectRoot);
  const scopeFilesSet = new Set(getFilesToScan(targetPath));

  const currentProjectSet = new Set(allProjectFiles);
  for (const cachedPath of memoryCache.keys()) {
    if (!currentProjectSet.has(cachedPath)) {
      memoryCache.delete(cachedPath);
      cacheDirty = true;
    }
  }

  let cacheHits = 0;
  let parsedCount = 0;

  const repoFilesData = allProjectFiles.map((absFile) => {
    const { data, fromCache } = analyzeFileCached(absFile);
    if (fromCache) cacheHits++;
    else parsedCount++;

    return {
      absFile,
      relFile: path.relative(projectRoot, absFile) || path.basename(absFile),
      ...data
    };
  });

  saveDiskCache();
  resolveTasksAndDiagnostics(repoFilesData);

  // Executa auditoria de Git Diff (PR ou Commit)
  const gitDiff = getGitAddedLines();
  const gitAudit = auditGitChanges(repoFilesData, gitDiff);

  const displayFiles = repoFilesData
    .filter((d) => scopeFilesSet.has(d.absFile))
    .map((d) => {
      const relFile = path.relative(process.cwd(), d.absFile) || path.basename(d.absFile);
      const filteredFns = targetFunctionName
        ? d.functions.filter((f) => f.name === targetFunctionName)
        : d.functions;

      return {
        file: relFile,
        functions: filteredFns.map((fn) => ({
          name: fn.name,
          startLine: fn.startLine,
          endLine: fn.endLine,
          signature: fn.signature,
          githubRange: `${relFile.replace(/\\/g, '/')}#L${fn.startLine}-L${fn.endLine}`,
          code: fn.code
        })),
        tasks: d.tasks
      };
    })
    .filter((d) => (onlyTasks ? d.tasks.length > 0 : d.functions.length > 0 || d.tasks.length > 0));

  const elapsed = (performance.now() - startTime).toFixed(1);

  // Saída JSON completa (incluindo arquivos e auditoria de PR/Commit)
  if (isJson) {
    console.log(
      JSON.stringify(
        {
          files: displayFiles,
          gitAudit
        },
        null,
        2
      )
    );
    return;
  }

  const totalFns = displayFiles.reduce((acc, item) => acc + item.functions.length, 0);
  const totalTasks = displayFiles.reduce((acc, item) => acc + item.tasks.length, 0);
  const cacheInfo = styleText('dim', `[AST: ${parsedCount} parsed, ${cacheHits} cached]`);

  if (displayFiles.length === 0 && (!gitAudit || (gitAudit.introducedCommentsCount === 0 && gitAudit.duplicateFunctionsCount === 0))) {
    log.warn(`Nenhum resultado encontrado ${styleText('dim', `(${elapsed}ms)`)} ${cacheInfo}\n`);
    return;
  }

  log.success(
    `Encontrada(s) ${styleText(['bold', 'green'], String(totalFns))} função(ões) e ${styleText(['bold', 'yellow'], String(totalTasks))} marcador(es) em ${styleText('dim', `${elapsed}ms`)} ${cacheInfo}\n`
  );

  for (const item of displayFiles) {
    console.log(`📄 ${styleText(['bold', 'yellow'], item.file)}`);

    if (!onlyTasks && item.functions.length > 0) {
      for (const fn of item.functions) {
        const lineBadge = styleText('cyan', `L${fn.startLine}-${fn.endLine}`);
        const ghLink = styleText('dim', `(${fn.githubRange})`);
        console.log(`\n   ${lineBadge} ${styleText(['bold', 'white'], fn.signature)} ${ghLink}`);

        if (!hideCode) {
          renderPrettyCodeBlock(fn);
        }
      }
    }

    if (item.tasks.length > 0) {
      console.log('');
      for (const task of item.tasks) {
        const badgeColor = task.type === 'FIXME_EXTRACT' ? 'red' : 'magenta';
        const lineTag = styleText('dim', `L${task.startLine}`);
        const newBadge = task.introducedInDiff
          ? ` ${styleText(['bold', 'bgYellow', 'black'], ' NOVO NO DIFF ')}`
          : '';

        console.log(
          `   ${styleText(['bold', badgeColor], `[${task.type}]`)}${newBadge} ${lineTag} ${styleText('white', task.text)}`
        );

        if (task.nearbyFunction) {
          console.log(
            `      ${styleText('dim', '↳ Função logo abaixo:')} ${styleText('cyan', task.nearbyFunction.name)} ${styleText('dim', `(L${task.nearbyFunction.startLine}-${task.nearbyFunction.endLine})`)}`
          );
        } else {
          console.log(`      ${styleText('dim', '↳ Nenhuma função declarada logo abaixo')}`);
        }

        if (task.diagnostics) {
          const d = task.diagnostics;

          if (d.functionExistsInCurrentFile) {
            console.log(
              `      ${styleText('green', '✔')} Função origem ${styleText('bold', d.targetFunction)} existe neste arquivo.`
            );
          } else {
            console.log(
              `      ${styleText('red', '✖')} Função origem ${styleText('bold', d.targetFunction)} NÃO existe neste arquivo.`
            );
            if (d.similarLocalFunctions.length > 0) {
              const formatted = d.similarLocalFunctions
                .map((s) => `${s.name} (${s.similarity}%)`)
                .join(', ');
              console.log(`        ${styleText('yellow', '💡 Sugestões no arquivo:')} ${formatted}`);
            } else if (d.similarGlobalFunctions.length > 0) {
              const formatted = d.similarGlobalFunctions
                .map((s) => `${s.name} (${s.similarity}%)`)
                .join(', ');
              console.log(`        ${styleText('yellow', '💡 Sugestões no repositório:')} ${formatted}`);
            }
          }

          if (d.targetFileExists) {
            console.log(
              `      ${styleText('green', '✔')} Arquivo destino existe: ${styleText('cyan', d.targetPath)}`
            );
            if (d.symbolConflictInTargetFile) {
              console.log(
                `      ${styleText('yellow', '⚠ Conflito:')} Símbolo ${styleText('bold', d.targetFunction)} JÁ está definido em ${d.targetPath}!`
              );
            } else {
              console.log(
                `      ${styleText('green', '✔')} Nome livre em ${d.targetPath} (sem conflito de símbolo).`
              );
              if (d.similarSymbolsInTargetFile.length > 0) {
                const formatted = d.similarSymbolsInTargetFile
                  .map((s) => `${s.name} (${s.similarity}%)`)
                  .join(', ');
                console.log(
                  `        ${styleText('dim', 'ℹ Símbolos parecidos no destino:')} ${formatted}`
                );
              }
            }
          } else {
            console.log(
              `      ${styleText('yellow', '⚠')} Arquivo destino não existe: ${styleText('dim', d.targetPath)}`
            );
            if (d.similarFiles.length > 0) {
              const formatted = d.similarFiles
                .map((s) => `${s.name} (${s.similarity}%)`)
                .join(', ');
              console.log(`        ${styleText('yellow', '💡 Arquivos semelhantes:')} ${formatted}`);
            }
          }
        }
      }
    }

    console.log('');
  }

  // ==========================================================================
  // Seção Dedicada de Auditoria de PR / Commit
  // ==========================================================================
  if (gitAudit && (gitAudit.introducedCommentsCount > 0 || gitAudit.duplicateFunctionsCount > 0)) {
    console.log(styleText('dim', '═'.repeat(72)));
    console.log(
      `🔍 ${styleText(['bold', 'cyan'], 'AUDITORIA DE PR / COMMIT')} ${styleText('dim', `(${gitAudit.diffMode})`)}`
    );
    console.log(styleText('dim', '═'.repeat(72)));

    if (gitAudit.introducedCommentsCount > 0) {
      console.log(
        `\n📝 ${styleText(['bold', 'yellow'], `${gitAudit.introducedCommentsCount} comentário(s) técnico(s) introduzido(s):`)}`
      );
      for (const c of gitAudit.introducedComments) {
        console.log(
          `   • ${styleText(['bold', 'magenta'], `[${c.type}]`)} ${styleText('yellow', c.githubRange)}`
        );
        console.log(`     ${styleText('white', c.text)}`);
        if (c.nearbyFunction) {
          console.log(
            `     ${styleText('dim', '↳ Associado à função:')} ${styleText('cyan', c.nearbyFunction.name)} (L${c.nearbyFunction.startLine}-${c.nearbyFunction.endLine})`
          );
        }
      }
    }

    if (gitAudit.duplicateFunctionsCount > 0) {
      console.log(
        `\n👯 ${styleText(['bold', 'red'], `${gitAudit.duplicateFunctionsCount} função(ões) repetida(s) ou semelhante(s) detectada(s) no diff:`)}`
      );
      for (const dup of gitAudit.duplicateFunctions) {
        console.log(
          `   • ${styleText(['bold', 'cyan'], dup.name)} em ${styleText('yellow', dup.githubRange)}`
        );
        for (const match of dup.existingMatches) {
          const reasonLabel =
            match.reason === 'IDENTICAL_BODY'
              ? styleText('red', 'Corpo 100% idêntico')
              : match.reason === 'DUPLICATE_NAME'
                ? styleText('yellow', 'Mesmo nome já existente')
                : styleText('yellow', `Corpo ${match.similarity}% semelhante`);

          console.log(
            `     ${styleText('dim', '↳ Já existe em:')} ${styleText('green', match.githubRange)} (${styleText('bold', match.name)}) — ${reasonLabel}`
          );
        }
      }
    }
    console.log('');
  }
}

// ============================================================================
// 9. Inicialização e Modo Watch
// ============================================================================
runAnalysis();

if (isWatch) {
  const relTarget = path.relative(process.cwd(), targetPath) || '.';
  log.watch(
    `Monitorando alterações em ${styleText('yellow', relTarget)}... ${styleText('dim', '(Ctrl+C para sair)')}`
  );

  let debounceTimer = null;

  const triggerUpdate = (changedFile) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!isJson) console.clear();
      log.watch(`Alteração detectada em ${styleText('yellow', changedFile)}`);
      runAnalysis();
      log.watch(`Aguardando novas alterações...`);
    }, 100);
  };

  if (isSingleFile) {
    const dir = path.dirname(targetPath);
    const targetBasename = path.basename(targetPath);

    fs.watch(dir, (_, filename) => {
      if (filename === targetBasename) {
        triggerUpdate(targetBasename);
      }
    });
  } else {
    fs.watch(targetPath, { recursive: true }, (_, filename) => {
      if (!filename) return;
      const parts = filename.split(path.sep);
      if (parts.some((part) => IGNORE_DIRS.has(part))) return;
      if (!EXTENSIONS.has(path.extname(filename))) return;
      triggerUpdate(filename);
    });
  }
}
