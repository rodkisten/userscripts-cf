import fs from 'node:fs';
import { AgentReporter } from './utils/ci-logger.mjs';
import {
  getGitHubClient,
  upsertStickyComment,
  writeJobSummary,
  type GitHubClient
} from './utils/github.ts';

interface ScriptSuggestion {
  path: string;
  similarity: number;
}

interface InvalidWorkflowReference {
  workflowFile: string;
  line: number;
  col: number;
  referencedPath: string;
  resolvedRelativePath: string;
  workingDirectory: string | null;
  lineContent: string;
  snippet: string;
  editUrl: string | null;
  suggestions: ScriptSuggestion[];
  annotationRaw: string;
}

interface WorkflowAuditReport {
  repository: string;
  branch: string;
  workflowsScanned: number;
  totalScriptsIndexed: number;
  invalidCount: number;
  existingScripts: string[];
  invalidReferences: InvalidWorkflowReference[];
}

const logger = new AgentReporter('Workflow audit');

const MARKER = '<!-- invalid-workflow-scripts-audit -->';
const LABEL_NAME = 'INVALID WORKFLOW';
const LABEL_COLOR = 'B60205';
const LABEL_DESCRIPTION = 'Workflow referencia scripts (.js/.mjs/.cjs/.ts/.tsx) inexistentes';

async function ensureLabelExists(
  github: GitHubClient,
  owner: string,
  repo: string
): Promise<void> {
  const encodedLabel = encodeURIComponent(LABEL_NAME);
  try {
    await github.request(`/repos/${owner}/${repo}/labels/${encodedLabel}`);
  } catch {
    logger.info(`Criando label "${LABEL_NAME}" no repositório...`);
    await github.request(`/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      body: JSON.stringify({
        name: LABEL_NAME,
        color: LABEL_COLOR,
        description: LABEL_DESCRIPTION
      })
    });
  }
}

async function addLabelToIssueOrPr(
  github: GitHubClient,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  await ensureLabelExists(github, owner, repo);
  await github.request(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: [LABEL_NAME] })
  });
}

async function removeLabelIfPresent(
  github: GitHubClient,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  const encodedLabel = encodeURIComponent(LABEL_NAME);
  try {
    await github.request(
      `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodedLabel}`,
      { method: 'DELETE' }
    );
    logger.pass(`Label "${LABEL_NAME}" removida do PR #${issueNumber} após correção.`);
  } catch {
    // Label não estava aplicada; ignora
  }
}

function buildReportMarkdown(report: WorkflowAuditReport): string {
  const lines: string[] = [
    MARKER,
    '## 🚨 Validação de Scripts nos Workflows',
    ''
  ];

  if (report.invalidCount === 0) {
    lines.push(
      `> ✅ **Todos os workflows estão válidos!** (${report.workflowsScanned} arquivo(s) verificados na branch \`${report.branch}\`).`,
      ''
    );
    return lines.join('\n');
  }

  lines.push(
    `Foram encontradas **${report.invalidCount}** referência(s) a scripts inexistentes na branch \`${report.branch}\`:`,
    ''
  );

  for (const item of report.invalidReferences) {
    lines.push(`### 📄 \`${item.workflowFile}\` (linha ${item.line})`);
    lines.push('');
    lines.push(`- ❌ **Arquivo não encontrado:** \`${item.referencedPath}\``);

    if (item.suggestions.length > 0) {
      const suggList = item.suggestions
        .map((s) => `\`${s.path}\` (**${s.similarity}%**)`)
        .join(', ');
      lines.push(`- 💡 **Você quis dizer:** ${suggList}`);
    }

    if (item.editUrl) {
      lines.push(
        `- ✏️ **[Editar \`${item.workflowFile}\` na linha ${item.line} (branch \`${report.branch}\`)](${item.editUrl})**`
      );
    }

    lines.push('', '```yaml', item.snippet, '```', '');
  }

  if (report.existingScripts.length > 0) {
    lines.push(
      '<details>',
      `<summary>📂 Ver todos os ${report.existingScripts.length} scripts existentes no repositório</summary>`,
      '',
      ...report.existingScripts.map((s) => `- \`${s}\``),
      '',
      '</details>',
      ''
    );
  }

  return lines.join('\n');
}

async function upsertWorkflowIssue(
  github: GitHubClient,
  owner: string,
  repo: string,
  report: WorkflowAuditReport,
  markdown: string
): Promise<void> {
  const openIssues = await github.request<
    Array<{ number: number; title: string; body?: string; pull_request?: unknown }>
  >(`/repos/${owner}/${repo}/issues?state=open&per_page=100`);

  const existingIssue = openIssues.find(
    (issue) => !issue.pull_request && issue.body?.includes(MARKER)
  );

  // Se tudo foi corrigido e havia uma issue aberta, fecha a issue automaticamente
  if (report.invalidCount === 0) {
    if (existingIssue) {
      await github.request(`/repos/${owner}/${repo}/issues/${existingIssue.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: `✅ Todos os caminhos de scripts nos workflows foram corrigidos na branch \`${report.branch}\`. Fechando issue automaticamente.`
        })
      });
      await github.request(`/repos/${owner}/${repo}/issues/${existingIssue.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' })
      });
      logger.pass(`Issue #${existingIssue.number} fechada automaticamente após correção.`);
    }
    return;
  }

  await ensureLabelExists(github, owner, repo);

  const title = `🚨 [${LABEL_NAME}] ${report.invalidCount} caminho(s) de script inválido(s) em .github/workflows`;

  if (existingIssue) {
    await github.request(`/repos/${owner}/${repo}/issues/${existingIssue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title,
        body: markdown,
        labels: [LABEL_NAME]
      })
    });
    logger.pass(`Issue existente #${existingIssue.number} atualizada.`);
  } else {
    const created = await github.request<{ number: number }>(
      `/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        body: JSON.stringify({
          title,
          body: markdown,
          labels: [LABEL_NAME]
        })
      }
    );
    logger.pass(`Nova Issue #${created.number} criada com a label "${LABEL_NAME}".`);
  }
}

async function main() {
  const reportPath = process.env.REPORT_PATH || 'workflow-audit-report.json';
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const prNumber = process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : null;

  if (!fs.existsSync(reportPath)) {
    logger.fail(`Relatório não encontrado em: ${reportPath}`);
    process.exit(1);
  }

  const report: WorkflowAuditReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

  // 1. Emite annotations inline no GitHub Actions
  for (const item of report.invalidReferences) {
    console.log(item.annotationRaw);
  }

  // 2. Escreve o Job Summary
  const markdown = buildReportMarkdown(report);
  await writeJobSummary(markdown);
  logger.pass('Job Summary de workflows publicado.');

  if (!owner || !repo) {
    logger.warn('REPO_OWNER ou REPO_NAME ausentes; pulando integração com Issue/PR.');
    return;
  }

  const github = getGitHubClient();

  // 3. Fluxo Pull Request vs Fluxo Fora de PR (Issue)
  if (prNumber) {
    if (report.invalidCount > 0) {
      await addLabelToIssueOrPr(github, owner, repo, prNumber);
      logger.warn(`Label "${LABEL_NAME}" aplicada ao PR #${prNumber}.`);
    } else {
      await removeLabelIfPresent(github, owner, repo, prNumber);
    }

    const status = await upsertStickyComment({
      github,
      owner,
      repo,
      issueNumber: prNumber,
      marker: MARKER,
      body: markdown,
      skipCreateIfEmpty: report.invalidCount === 0
    });

    if (status === 'created') {
      logger.pass(`Comentário de workflow inválido criado no PR #${prNumber}.`);
    } else if (status === 'updated') {
      logger.pass(`Comentário atualizado no PR #${prNumber}.`);
    }
  } else {
    logger.info('Execução fora de Pull Request; gerenciando Issue...');
    await upsertWorkflowIssue(github, owner, repo, report, markdown);
  }

  if (report.invalidCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.fail('Erro ao executar auditoria de workflows:', err);
  process.exit(1);
});
