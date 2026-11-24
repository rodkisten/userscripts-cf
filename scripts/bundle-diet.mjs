import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const baselinePath = path.join(root, ".github", "bundle-baseline.json");
const marker = "<!-- userscripts-bundle-diet -->";
const previewOrigin = (
  process.env.USERSCRIPTS_PREVIEW_URL || "https://userscripts.preview.migos.club"
).replace(/\/$/, "");

const arg = (name, fallback) => {
  const prefix = "--" + name + "=";
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};
const command = process.argv[2] || "snapshot";
const readJSON = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sha = () => process.env.GITHUB_SHA || git("rev-parse", "HEAD");
const bytes = (value) => {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return value + " B";
  if (value < 1024 ** 2) return (value / 1024).toFixed(1) + " KB";
  return (value / 1024 ** 2).toFixed(2) + " MB";
};
const escapeCell = (value) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
const delta = (current, baseline) => {
  if (!Number.isFinite(baseline) || baseline === 0) return "new";
  const diff = current - baseline;
  const pct = (diff / baseline) * 100;
  const icon = diff < 0 ? "🟢" : diff > 0 ? "🔴" : "⚪";
  const sign = diff > 0 ? "+" : "";
  return `${icon} ${sign}${bytes(diff)} · ${sign}${pct.toFixed(1)}%`;
};
const sum = (items, key) => items.reduce((total, item) => total + (item[key] || 0), 0);

function aggregateModules(runtimeAudit, target) {
  const totals = new Map();
  for (const [bundle, stats] of Object.entries(runtimeAudit.bundles || {})) {
    if (!bundle.startsWith(target + ":")) continue;
    for (const item of stats.modules || []) {
      if (!item.renderedBytes) continue;
      totals.set(item.id, (totals.get(item.id) || 0) + item.renderedBytes);
    }
  }
  return [...totals.entries()]
    .map(([id, renderedBytes]) => ({ id, renderedBytes }))
    .sort((a, b) => b.renderedBytes - a.renderedBytes || a.id.localeCompare(b.id))
    .slice(0, 60);
}

export async function createSnapshot() {
  const classAudit = await readJSON(path.join(dist, "css-class-audit.json"));
  const runtimeAudit = await readJSON(path.join(dist, "runtime-feature-audit.json"));
  const bundles = {};
  for (const [id, audit] of Object.entries(classAudit)) {
    const file = path.join(dist, id + ".user.js");
    const source = await fs.readFile(file);
    const brotliBytes =
      audit.brotliBytes ??
      brotliCompressSync(source, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
      }).byteLength;
    bundles[id] = {
      rawBytes: audit.bytes ?? source.byteLength,
      gzipBytes: audit.gzipBytes,
      brotliBytes,
      debugBytes: audit.debugBytes,
      modules: aggregateModules(runtimeAudit, id),
    };
  }
  const values = Object.values(bundles);
  return {
    schema: 1,
    sha: sha(),
    generatedAt: new Date().toISOString(),
    bundles,
    totals: {
      rawBytes: sum(values, "rawBytes"),
      gzipBytes: sum(values, "gzipBytes"),
      brotliBytes: sum(values, "brotliBytes"),
    },
  };
}

async function writeSnapshot() {
  const output = path.resolve(root, arg("output", "dist/bundle-metrics.json"));
  const snapshot = await createSnapshot();
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(snapshot, null, 2) + "\n");
  console.log("[bundle-diet] snapshot", path.relative(root, output), snapshot.sha.slice(0, 8));
}

async function writeBaseline() {
  const metricsFile = path.resolve(root, arg("metrics", "dist/bundle-metrics.json"));
  const output = path.resolve(root, arg("output", ".github/bundle-baseline.json"));
  let snapshot;
  try {
    snapshot = await readJSON(metricsFile);
  } catch {
    snapshot = await createSnapshot();
  }
  snapshot.baseline = true;
  snapshot.baselineReason = process.env.BASELINE_REASON || "Explicit Bundle Diet baseline";
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(snapshot, null, 2) + "\n");
  console.log("[bundle-diet] baseline", snapshot.sha.slice(0, 8), bytes(snapshot.totals.rawBytes));
}

function commitsBetween(base, head) {
  if (!base) return [];
  const output = git("log", "--format=%H%x09%s", base + ".." + head);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [commit, ...message] = line.split("\t");
    return { sha: commit, message: message.join("\t") };
  });
}

function changedFiles(base, head) {
  if (!base) return [];
  const output = git("diff", "--numstat", base + "..." + head);
  if (!output) return [];
  return output.split("\n").map((line) => {
    const [added, deleted, ...name] = line.split("\t");
    return { path: name.join("\t"), added, deleted };
  });
}

function bundleForFile(file, bundleIds) {
  const match = /^src\/userscripts\/([^/]+)\//.exec(file);
  if (match && bundleIds.includes(match[1])) return match[1];
  return null;
}

function moduleChanges(current, baseline) {
  const currentMap = new Map();
  const baselineMap = new Map();
  for (const bundle of Object.values(current.bundles || {})) {
    for (const item of bundle.modules || [])
      currentMap.set(item.id, (currentMap.get(item.id) || 0) + item.renderedBytes);
  }
  for (const bundle of Object.values(baseline.bundles || {})) {
    for (const item of bundle.modules || [])
      baselineMap.set(item.id, (baselineMap.get(item.id) || 0) + item.renderedBytes);
  }
  return [...new Set([...currentMap.keys(), ...baselineMap.keys()])]
    .map((id) => ({ id, delta: (currentMap.get(id) || 0) - (baselineMap.get(id) || 0) }))
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

async function upsertComment(body) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const pr = Number(process.env.PR_NUMBER);
  if (!token || !repository || !Number.isSafeInteger(pr))
    throw new Error("GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required");
  const [owner, repo] = repository.split("/");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const list = await fetch(`${api}/repos/${owner}/${repo}/issues/${pr}/comments?per_page=100`, { headers });
  if (!list.ok) throw new Error("Unable to list PR comments: " + list.status + " " + (await list.text()));
  const comments = await list.json();
  const existing = comments.find((comment) => comment.body?.includes(marker));
  const endpoint = existing
    ? `${api}/repos/${owner}/${repo}/issues/comments/${existing.id}`
    : `${api}/repos/${owner}/${repo}/issues/${pr}/comments`;
  const response = await fetch(endpoint, {
    method: existing ? "PATCH" : "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  if (!response.ok)
    throw new Error(
      "Unable to upsert Bundle Diet comment: " + response.status + " " + (await response.text()),
    );
  return existing ? "updated" : "created";
}

function makeReport(current, baseline) {
  const repository = process.env.GITHUB_REPOSITORY;
  const pr = Number(process.env.PR_NUMBER);
  const baseSha = process.env.PR_BASE_SHA || process.env.BASE_SHA;
  const headSha = process.env.PR_HEAD_SHA || current.sha;
  const workflow = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const repoUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}`;
  const bundleIds = Object.keys(current.bundles).sort();
  const hasBaseline = Boolean(baseline?.sha && Object.keys(baseline.bundles || {}).length);
  const commits = commitsBetween(baseSha, headSha);
  const files = changedFiles(baseSha, headSha);
  const changes = hasBaseline ? moduleChanges(current, baseline) : [];
  const improvements = changes.filter((item) => item.delta < 0).slice(0, 8);
  const regressions = changes.filter((item) => item.delta > 0).slice(0, 8);
  const rows = bundleIds.map((id) => {
    const now = current.bundles[id];
    const before = baseline?.bundles?.[id];
    return `| \`${escapeCell(id)}\` | ${bytes(now.rawBytes)} | ${bytes(now.gzipBytes)} | ${bytes(now.brotliBytes)} | ${hasBaseline && before ? delta(now.brotliBytes, before.brotliBytes) : "baseline pending"} |`;
  });
  const totalDelta = hasBaseline
    ? delta(current.totals.brotliBytes, baseline.totals.brotliBytes)
    : "baseline pending";
  const commitLines = commits.length
    ? commits
        .map(
          (item) =>
            `- [\`${item.sha.slice(0, 8)}\`](${repoUrl}/commit/${item.sha}) ${escapeCell(item.message)}`,
        )
        .join("\n")
    : "- No commits detected between base and HEAD.";
  const fileRows = files.slice(0, 40).map((file) => {
    const bundle = bundleForFile(file.path, bundleIds);
    const preview = bundle
      ? `[install](${previewOrigin}/${pr}/${bundle}.user.js)`
      : `[playground](${previewOrigin}/${pr}/)`;
    const diffUrl = `${repoUrl}/blob/${headSha}/${file.path}`;
    return `| [\`${escapeCell(file.path)}\`](${diffUrl}) | +${file.added} / -${file.deleted} | ${bundle ? "\`" + bundle + "\`" : "shared"} | ${preview} |`;
  });
  const moduleSection = (title, list, icon) =>
    `### ${icon} ${title}\n` +
    (list.length
      ? list
          .map(
            (item) =>
              `- \`${escapeCell(item.id)}\` ${item.delta > 0 ? "+" : ""}${bytes(item.delta)} rendered`,
          )
          .join("\n")
      : "- None.");
  const baselineLabel = hasBaseline
    ? `[\`${baseline.sha.slice(0, 8)}\`](${repoUrl}/commit/${baseline.sha})`
    : "not captured yet";
  const previewLines = bundleIds
    .map((id) => `- [${id}.user.js](${previewOrigin}/${pr}/${id}.user.js)`)
    .join("\n");
  return `${marker}
## 📦 Bundle Diet · PR #${pr}

**HEAD** [\`${headSha.slice(0, 8)}\`](${repoUrl}/commit/${headSha}) · **Baseline** ${baselineLabel} · [workflow](${workflow})

| Bundle | Raw | gzip | Brotli | Δ baseline |
|---|---:|---:|---:|---:|
${rows.join("\n")}
| **Total** | **${bytes(current.totals.rawBytes)}** | **${bytes(current.totals.gzipBytes)}** | **${bytes(current.totals.brotliBytes)}** | **${totalDelta}** |

### 🧾 Commits
${commitLines}

### 🗂️ Files modified
| File | Diff | Bundle | Preview |
|---|---:|---|---|
${fileRows.join("\n") || "| _none_ | — | — | — |"}

${moduleSection("Largest improvements", improvements, "🏆")}

${moduleSection("Largest regressions", regressions, "⚠️")}

### 🔭 Previews
- [Visual playground](${previewOrigin}/${pr}/)
${previewLines}

> Baseline comparison uses the versioned .github/bundle-baseline.json. Raw, gzip and Brotli are measured from the actual generated .user.js files. Module deltas are pre-minification rendered contributions and are diagnostic, not estimated download savings.
`;
}

async function report() {
  const metricsFile = path.resolve(root, arg("metrics", "dist/bundle-metrics.json"));
  const current = await readJSON(metricsFile);
  let baseline = { bundles: {} };
  try {
    baseline = await readJSON(path.resolve(root, arg("baseline", ".github/bundle-baseline.json")));
  } catch {}
  const body = makeReport(current, baseline);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) await fs.appendFile(summary, body.replace(marker, "") + "\n");
  const result = await upsertComment(body);
  console.log("[bundle-diet] PR comment", result);
}

if (command === "snapshot") await writeSnapshot();
else if (command === "baseline") await writeBaseline();
else if (command === "report") await report();
else throw new Error("Unknown bundle-diet command: " + command);
