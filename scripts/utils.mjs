import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

// ============================================================================
// GitHub Actions Environment, Outputs & Step Summary
// ============================================================================
export function resolveInputs(fallbackMap) {
  const resolved = {};
  for (const [key, candidates] of Object.entries(fallbackMap)) {
    const found = candidates.find((val) => val !== undefined && val !== null && val !== '');
    resolved[key] = found ?? '';
  }
  return resolved;
}

export function setActionOutput(name, value, core) {
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
    console.log(`[output] ${name}=${strValue}`);
  }
}

export function appendStepSummary(markdown) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    fs.appendFileSync(summaryFile, `${markdown}\n`, 'utf8');
  } else {
    process.stdout.write(`\n--- STEP SUMMARY ---\n${markdown}\n`);
  }
}

export function buildCliContext() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const payload =
    eventPath && fs.existsSync(eventPath) ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};

  return {
    repo: { owner, repo },
    issue: { number: payload.pull_request?.number || payload.issue?.number },
    payload,
    serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
    runId: process.env.GITHUB_RUN_ID || '0',
    runNumber: process.env.GITHUB_RUN_NUMBER || '0',
    actor: process.env.GITHUB_ACTOR || 'unknown',
    eventName: process.env.GITHUB_EVENT_NAME || 'workflow_dispatch',
    sha: process.env.GITHUB_SHA || payload.pull_request?.head?.sha || '',
    refName: process.env.GITHUB_REF_NAME || '',
  };
}

export function parseCliArgs(argv) {
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

// ============================================================================
// Execução de Comandos & Git Helpers
// ============================================================================
export function runCmd(cmd, args = [], options = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    return { ok: true, status: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      ok: false,
      status: err.status ?? 1,
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || err.message || '').toString().trim(),
    };
  }
}

export function runInteractive(cmd, args = [], options = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    ...options,
  });
  return res.status ?? 1;
}

export function getChangedFiles(baseSha, headSha, diffFilter = 'ACMR') {
  if (!baseSha || !headSha) return [];
  const res = runCmd('git', ['diff', '--name-only', `--diff-filter=${diffFilter}`, baseSha, headSha]);
  if (!res.ok || !res.stdout) return [];
  return res.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f && fs.existsSync(f));
}

export function hasPackageTool(rootDir, binName) {
  const localBin = path.join(rootDir, 'node_modules', '.bin', binName);
  if (fs.existsSync(localBin)) return true;

  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return Boolean(pkg.devDependencies?.[binName] || pkg.dependencies?.[binName]);
  } catch {
    return false;
  }
}

// ============================================================================
// Cliente GitHub API Nativo & Comentários Idempotentes
// ============================================================================
export function createNativeGithubClient(token) {
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

export async function resolveBotLogin(github) {
  try {
    const { data: app } = await github.rest.apps.getAuthenticated();
    if (app?.slug) return `${app.slug}[bot]`;
  } catch {
    // Fallback quando autenticado via GITHUB_TOKEN padrão
  }
  return 'github-actions[bot]';
}

export async function upsertMarkedComment({ github, owner, repo, issueNumber, marker, body, matchBotLogin = false }) {
  const botLogin = matchBotLogin ? await resolveBotLogin(github) : null;
  const { data: comments } = await github.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => {
    const hasMarker = c.body?.includes(marker);
    if (!hasMarker) return false;
    return botLogin ? c.user?.login === botLogin : true;
  });

  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return { action: 'updated', commentId: existing.id, botLogin };
  }

  const { data: created } = await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return { action: 'created', commentId: created.id, botLogin };
}
