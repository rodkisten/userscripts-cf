// @TODO: extract unicode
// @TODO: implement package.json parsing

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { defaultLogger } from './ci-logger.mjs';

// ============================================================================
// GitHub Actions Environment, Inputs, Outputs & CLI Parsing
// ============================================================================
export function resolveInputs(fallbackMap) {
  const resolved = {};
  for (const [key, candidates] of Object.entries(fallbackMap)) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    const found = list.find((val) => val !== undefined && val !== null && String(val).trim() !== '');
    resolved[key] = found !== undefined ? String(found).trim() : '';
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
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY (owner/repo) environment variable is not set.');
  }

  let payload = {};
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    try {
      payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    } catch {
      payload = {};
    }
  }

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
// Rich Step Summary Builder (compatible with core.summary and native CLI)
// ============================================================================
export function createSummaryWriter(core) {
  if (core?.summary) return core.summary;

  const chunks = [];
  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const api = {
    addHeading(text, level = 1) {
      chunks.push(`<h${level}>${text}</h${level}>\n`);
      return api;
    },
    addRaw(text, addEOL = false) {
      chunks.push(`${text}${addEOL ? '\n' : ''}`);
      return api;
    },
    addBreak() {
      chunks.push('<br>\n');
      return api;
    },
    addEOL() {
      chunks.push('\n');
      return api;
    },
    addQuote(text, cite) {
      const citeAttr = cite ? ` cite="${escapeHtml(cite)}"` : '';
      chunks.push(`<blockquote${citeAttr}>\n${text}\n</blockquote>\n`);
      return api;
    },
    addSeparator() {
      chunks.push('<hr>\n');
      return api;
    },
    addLink(text, href) {
      chunks.push(`<a href="${escapeHtml(href)}">${text}</a>\n`);
      return api;
    },
    addImage(src, alt, opts = {}) {
      const attrs = [
        `src="${escapeHtml(src)}"`,
        `alt="${escapeHtml(alt)}"`,
        opts.width ? `width="${opts.width}"` : '',
        opts.height ? `height="${opts.height}"` : '',
      ]
        .filter(Boolean)
        .join(' ');
      chunks.push(`<img ${attrs}>\n`);
      return api;
    },
    addList(items, ordered = false) {
      const tag = ordered ? 'ol' : 'ul';
      const li = items.map((item) => `<li>${item}</li>`).join('\n');
      chunks.push(`<${tag}>\n${li}\n</${tag}>\n`);
      return api;
    },
    addCodeBlock(code, lang = '') {
      const langAttr = lang ? ` lang="${escapeHtml(lang)}"` : '';
      chunks.push(`<pre${langAttr}><code>${escapeHtml(code)}</code></pre>\n`);
      return api;
    },
    addTable(rows) {
      const htmlRows = rows
        .map((row) => {
          const cells = row
            .map((cell) => {
              if (typeof cell === 'object' && cell !== null) {
                const tag = cell.header ? 'th' : 'td';
                const colspan = cell.colspan ? ` colspan="${cell.colspan}"` : '';
                const rowspan = cell.rowspan ? ` rowspan="${cell.rowspan}"` : '';
                return `<${tag}${colspan}${rowspan}>${cell.data}</${tag}>`;
              }
              return `<td>${cell}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('\n');
      chunks.push(`<table>\n${htmlRows}\n</table>\n`);
      return api;
    },
    addDetails(label, content) {
      chunks.push(`<details>\n<summary>${label}</summary>\n\n${content}\n</details>\n`);
      return api;
    },
    async write() {
      const output = chunks.join('\n');
      appendStepSummary(output);
      chunks.length = 0;
    },
  };

  return api;
}

// ============================================================================
// Command Execution & Git Helpers
// ============================================================================
export function runCmd(cmd, args = [], options = {}) {
  const { silent = false, logger = defaultLogger, ...execOptions } = options;

  if (!silent && logger) {
    logger.cmdBlock(cmd, args);
  }

  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...execOptions,
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
  const { silent = false, logger = defaultLogger, ...spawnOptions } = options;

  if (!silent && logger) {
    logger.cmdBlock(cmd, args);
  }

  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    ...spawnOptions,
  });
  return res.status ?? 1;
}

export function getChangedFiles(baseSha, headSha, diffFilter = 'ACMR') {
  if (!baseSha || !headSha) return [];
  const res = runCmd(
    'git',
    ['diff', '--name-only', `--diff-filter=${diffFilter}`, '-z', baseSha, headSha],
    { silent: true },
  );
  if (!res.ok || !res.stdout) return [];
  return [...new Set(res.stdout.split('\0').filter(Boolean))]
    .filter((f) => fs.existsSync(f))
    .sort();
}

export function hasPackageTool(rootDir, binName) {
  const resolvedBin = process.platform === 'win32' ? `${binName}.cmd` : binName;
  const localBin = path.join(rootDir, 'node_modules', '.bin', resolvedBin);
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
// Native GitHub API Client, Bot Identity & Idempotent Comments
// ============================================================================
export function createNativeGithubClient(token) {
  const baseUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

  const request = async (method, urlPath, body) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'rod-ci-utils',
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
        listComments: ({ owner, repo, issue_number, per_page = 100, page = 1 }) =>
          request(
            'GET',
            `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=${per_page}&page=${page}`,
          ),
        createComment: ({ owner, repo, issue_number, body }) =>
          request('POST', `/repos/${owner}/${repo}/issues/${issue_number}/comments`, { body }),
        updateComment: ({ owner, repo, comment_id, body }) =>
          request('PATCH', `/repos/${owner}/${repo}/issues/comments/${comment_id}`, { body }),
      },
    },
  };
}

/**
 * Returns { name, email, login } for the authenticated GitHub App (including its
 * numeric ID for the official GitHub noreply email) or falls back to github-actions[bot].
 */
export async function resolveBotIdentity(github) {
  if (github) {
    try {
      const { data: app } = await github.rest.apps.getAuthenticated();
      if (app?.slug) {
        const login = `${app.slug}[bot]`;
        const email = app.id
          ? `${app.id}+${login}@users.noreply.github.com`
          : `${login}@users.noreply.github.com`;
        return { name: login, email, login };
      }
    } catch {
      // Fallback when authenticated via default GITHUB_TOKEN or without App permissions
    }
  }

  return {
    name: 'github-actions[bot]',
    email: '41898282+github-actions[bot]@users.noreply.github.com',
    login: 'github-actions[bot]',
  };
}

export async function resolveBotLogin(github) {
  const { login } = await resolveBotIdentity(github);
  return login;
}

/**
 * Configures user.name and user.email in the local Git repository using the bot identity.
 */
export async function configureGitBotUser(github, { logger = defaultLogger, silent = true } = {}) {
  const identity = await resolveBotIdentity(github);
  runCmd('git', ['config', 'user.name', identity.name], { logger, silent });
  runCmd('git', ['config', 'user.email', identity.email], { logger, silent });
  return identity;
}

export async function upsertMarkedComment({
  github,
  owner,
  repo,
  issueNumber,
  marker,
  body,
  matchBotLogin = false,
}) {
  const botLogin = matchBotLogin ? await resolveBotLogin(github) : null;
  let existing = null;
  let page = 1;

  while (true) {
    const { data: comments } = await github.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
      page,
    });

    if (!Array.isArray(comments) || comments.length === 0) break;

    existing = comments.find((c) => {
      const hasMarker = c.body?.includes(marker);
      if (!hasMarker) return false;
      return botLogin ? c.user?.login === botLogin : true;
    });

    if (existing || comments.length < 100) break;
    page += 1;
  }

  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return { action: 'updated', commentId: existing.id, existingBody: existing.body, botLogin };
  }

  const { data: created } = await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return { action: 'created', commentId: created.id, existingBody: null, botLogin };
}
