import fs from 'node:fs';
import { AgentReporter } from './utils/ci-logger.mjs';
const logger = new AgentReporter('AST audit');
import { getGitHubClient, upsertStickyComment, writeJobSummary } from './utils/github.ts';

interface GitHubAnnotation {
  level: 'error' | 'warning' | 'notice';
  file: string;
  line: number;
  col: number;
  title: string;
  message: string;
  raw: string;
}

interface SimilaritySuggestion {
  name: string;
  similarity: number;
}

interface TaskDiagnostics {
  targetFunction: string | null;
  action: string;
  isExtractionAction: boolean;
  functionExistsInCurrentFile: boolean;
  similarLocalFunctions: SimilaritySuggestion[];
  similarGlobalFunctions: SimilaritySuggestion[];
  targetPath: string | null;
  targetFileExists: boolean;
  similarFiles: SimilaritySuggestion[];
  symbolConflictInTargetFile: boolean;
  similarSymbolsInTargetFile: SimilaritySuggestion[];
}

interface IntroducedComment {
  file: string;
  githubRange: string;
  type: string;
  tag: string;
  text: string;
  startLine: number;
  startCol: number;
  endLine: number;
  introducedInDiff?: boolean;
  nearbyFunction: {
    name: string;
    startLine: number;
    endLine: number;
    signature: string;
    code?: string;
  } | null;
  diagnostics: TaskDiagnostics | null;
  annotations: GitHubAnnotation[];
}

interface FunctionMatch {
  reason: 'IDENTICAL_BODY' | 'DUPLICATE_NAME' | 'SIMILAR_BODY';
  similarity: number;
  file: string;
  name: string;
  startLine: number;
  endLine: number;
  signature: string;
  githubRange: string;
}

interface DuplicateFunction {
  file: string;
  name: string;
  startLine: number;
  startCol: number;
  endLine: number;
  signature: string;
  githubRange: string;
  code: string;
  existingMatches: FunctionMatch[];
  annotation: GitHubAnnotation;
}

interface AuditReport {
  files: Array<{
    file: string;
    functions: Array<{
      name: string;
      startLine: number;
      startCol: number;
      endLine: number;
      signature: string;
      githubRange: string;
      code: string;
    }>;
    tasks: IntroducedComment[];
  }>;
  gitAudit: {
    diffMode: string;
    introducedCommentsCount: number;
    duplicateFunctionsCount: number;
    introducedComments: IntroducedComment[];
    duplicateFunctions: DuplicateFunction[];
  } | null;
  annotations: GitHubAnnotation[];
}

const COMMENT_MARKER = '<!-- ast-function-audit-comment -->';

function buildBlobUrl(githubRange: string): string {
  const serverUrl = process.env.SERVER_URL || 'https://github.com';
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const sha = process.env.HEAD_SHA;
  return `${serverUrl}/${owner}/${repo}/blob/${sha}/${githubRange}`;
}

function getLangFromRange(githubRange: string): string { const filePart = githubRange.split('#')[0] || ''; if (filePart.endsWith('.tsx')) return 'tsx'; if (filePart.endsWith('.ts')) return 'ts'; if (filePart.endsWith('.jsx')) return 'jsx'; return 'js';
}

function formatAuditMarkdown(report: AuditReport): { markdown: string; hasFindings: boolean } { const audit = report.gitAudit; const introduced = audit?.introducedComments ?? []; const duplicates = audit?.duplicateFunctions ?? []; const errorAnnotations = (report.annotations ?? []).filter((a) => a.level === 'error'); const hasFindings = introduced.length > 0 || duplicates.length > 0 || errorAnnotations.length > 0;  const lines: string[] = [ COMMENT_MARKER, '## 🔍 AST Function & Tech Debt Audit', '' ];  if (!hasFindings) { lines.push( '> ✅ **Tudo limpo!** Nenhuma função repetida, comentário técnico novo ou diretiva inválida detectada neste push.', '' ); return { markdown: lines.join('\n'), hasFindings: false }; }  lines.push( '| Métrica | Quantidade |', '| :--- | :---: |', `| ❌ Diretivas TODO/FIXME inválidas | **${errorAnnotations.length}** |`, `| 👯 Funções repetidas / semelhantes | **${duplicates.length}** |`, `| 📝 Comentários técnicos introduzidos | **${introduced.length}** |`, '' );  // 1. Diretivas inválidas (ex: função ou arquivo inexistente no TODO/FIXME)
  if (errorAnnotations.length > 0) { lines.push('### ❌ Diretivas de Refatoração Inválidas', ''); for (const err of errorAnnotations) { const range = `${err.file}#L${err.line}`; const url = buildBlobUrl(range); lines.push(`- **[${err.title}]** em [\`${err.file}:${err.line}:${err.col}\`](${url}): ${err.message}`); } lines.push(''); }

  // 2. Funções repetidas ou clones estruturais
  if (duplicates.length > 0) { lines.push('### 👯 Funções Repetidas ou Semelhantes Detectadas', '');  for (const dup of duplicates) { const url = buildBlobUrl(dup.githubRange); const lang = getLangFromRange(dup.githubRange);  lines.push( `#### [\`${dup.name}\`](${url}) em [\`${dup.githubRange}\`](${url})`,
        '',
        'Já existe implementação equivalente no repositório:',
        ''
      );

      for (const match of dup.existingMatches) {
        const matchUrl = buildBlobUrl(match.githubRange);
        const reasonText =
          match.reason === 'IDENTICAL_BODY'
            ? '🔴 **Corpo 100% idêntico**'
            : match.reason === 'DUPLICATE_NAME'
              ? '🟡 **Mesmo nome já existente**'
              : `🟠 **Corpo ${match.similarity}% semelhante**`;

        lines.push(`- ${reasonText} em [\`${match.githubRange}\`](${matchUrl}) (\`${match.signature}\`)`);
      }

      lines.push(
        '',
        '<details>',
        `<summary>Ver bloco de código introduzido (${dup.githubRange})</summary>`,
        '',
        `\`\`\`${lang}`,
        dup.code,
        '```',
        '',
        '</details>',
        ''
      );
    }
  }

  // 3. Comentários técnicos introduzidos no diff
  if (introduced.length > 0) {
    lines.push('### 📝 Comentários Técnicos Introduzidos', '');

    for (const item of introduced) {
      const url = buildBlobUrl(item.githubRange);
      lines.push(`- **[${item.type}]** em [\`${item.githubRange}\`](${url}): \`${item.text}\``);

      if (item.nearbyFunction) {
        lines.push(
          `  - ↳ Função associada logo abaixo: \`${item.nearbyFunction.signature}\` (\`L${item.nearbyFunction.startLine}-L${item.nearbyFunction.endLine}\`)`
        );
      }

      if (item.diagnostics) {
        const d = item.diagnostics;
        if (d.targetFunction && !d.functionExistsInCurrentFile) {
          const suggestions = [...d.similarLocalFunctions, ...d.similarGlobalFunctions]
            .map((s) => `\`${s.name}\` (${s.similarity}%)`)
            .join(', ');
          lines.push(
            `  - ❌ Função \`${d.targetFunction}\` **não encontrada** neste arquivo.${suggestions ? ` Sugestões: ${suggestions}` : ''}`
          );
        }

        if (d.targetPath) {
          if (d.targetFileExists && d.isExtractionAction && d.symbolConflictInTargetFile) {
            lines.push(
              `  - ❌ **Conflito de símbolo:** \`${d.targetFunction}\` já existe em \`${d.targetPath}\`.`
            );
          } else if (!d.targetFileExists) {
            const fileSuggs = d.similarFiles.map((s) => `\`${s.name}\` (${s.similarity}%)`).join(', ');
            lines.push(
              `  - ⚠️ Arquivo destino \`${d.targetPath}\` não existe.${fileSuggs ? ` Parecidos: ${fileSuggs}` : ''}`
            );
          }
        }
      }
    }
    lines.push('');
  }

  lines.push(
    '---',
    `<sub>Atualizado automaticamente no commit <code>${(process.env.HEAD_SHA || '').slice(0, 7)}</code>.</sub>`
  );

  return { markdown: lines.join('\n'), hasFindings: true };
}

async function main() {
  const reportPath = process.env.REPORT_PATH || 'ast-audit-report.json';
  const prNumber = Number(process.env.PR_NUMBER);
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;

  if (!fs.existsSync(reportPath)) {
    logger.fail(`Relatório AST não encontrado em: ${reportPath}`);
    process.exit(1);
  }

  logger.info('Lendo relatório de auditoria AST...');
  const report: AuditReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

  // 1. Emite todas as GitHub Annotations (::error e ::warning inline no diff do PR)
  if (Array.isArray(report.annotations) && report.annotations.length > 0) {
    logger.info(`Emitindo ${report.annotations.length} annotation(s) no GitHub Actions...`);
    for (const ann of report.annotations) {
      console.log(ann.raw);
    }
  }

  // 2. Publica o Job Summary na aba Actions
  const { markdown, hasFindings } = formatAuditMarkdown(report);
  await writeJobSummary(markdown);
  logger.pass('Job Summary publicado com sucesso.');

  // 3. Cria ou atualiza o comentário fixo no Pull Request
  if (!prNumber || !owner || !repo) {
    logger.warn('Contexto de Pull Request ausente; pulando criação/atualização de comentário.');
    return;
  }

  const github = getGitHubClient();
  const actionTaken = await upsertStickyComment({
    github,
    owner,
    repo,
    issueNumber: prNumber,
    marker: COMMENT_MARKER,
    body: markdown,
    skipCreateIfEmpty: !hasFindings
  });

  if (actionTaken === 'created') {
    logger.pass(`Comentário de auditoria criado no PR #${prNumber}.`);
  } else if (actionTaken === 'updated') {
    logger.pass(`Comentário existente atualizado no PR #${prNumber} após novo push.`);
  } else {
    logger.info(`Nenhuma pendência encontrada e nenhum comentário anterior no PR #${prNumber}.`);
  }
}

main().catch((err) => {
  logger.fail('Falha ao publicar sumário/comentário AST:', err);
  process.exit(1);
});
