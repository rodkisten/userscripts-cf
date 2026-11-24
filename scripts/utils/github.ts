import fs from 'node:fs';

export interface GitHubClient {
  request<T>(endpoint: string, init?: RequestInit): Promise<T>;
}

export function getGitHubClient(): GitHubClient {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN não definido no ambiente.');
  }

  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

  return {
    async request<T>(endpoint: string, init?: RequestInit): Promise<T> {
      const res = await fetch(`${apiUrl}${endpoint}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...init?.headers
        }
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub API ${res.status} (${endpoint}): ${text}`);
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    }
  };
}

export async function writeJobSummary(markdown: string): Promise<void> {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;
  await fs.promises.appendFile(summaryFile, `${markdown}\n`, 'utf-8');
}

interface UpsertCommentOptions {
  github: GitHubClient;
  owner: string;
  repo: string;
  issueNumber: number;
  marker: string;
  body: string;
  skipCreateIfEmpty?: boolean;
}

/**
 * Busca um comentário existente contendo `marker`.
 * - Se existir: atualiza via PATCH (mesmo se agora estiver tudo limpo, para refletir que o dev corrigiu no push).
 * - Se não existir: cria via POST (exceto se `skipCreateIfEmpty` for true).
 */
export async function upsertStickyComment(
  opts: UpsertCommentOptions
): Promise<'created' | 'updated' | 'skipped'> {
  const { github, owner, repo, issueNumber, marker, body, skipCreateIfEmpty } = opts;
  const listEndpoint = `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;

  const comments = await github.request<Array<{ id: number; body?: string }>>(listEndpoint);
  const existing = comments.find((c) => c.body?.includes(marker));

  if (existing) {
    await github.request(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body })
    });
    return 'updated';
  }

  if (skipCreateIfEmpty) {
    return 'skipped';
  }

  await github.request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
  return 'created';
}
