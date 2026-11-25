import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { AgentReporter } from "./utils/ci-logger.mjs";
import {
  parseCliArgs,
  appendStepSummary,
  buildCliContext,
  createNativeGithubClient,
} from "./utils/ci-utils.mjs";
const args = parseCliArgs(process.argv.slice(2));
const dir = path.resolve(String(args.output || process.env.GRAPH_DIR || ".dependency-graph"));
process.env.SOURCE_DIR = String(args.source || process.env.SOURCE_DIR || "src");
const log = new AgentReporter("DEPENDENCY GRAPH", args._[0] || "analyze");
const kitPath = process.env.ROD_COMMENT_KIT;
async function commentKit() {
  if (!kitPath) throw new Error("Set ROD_COMMENT_KIT to the shared comment-kit index.mjs");
  return import(pathToFileURL(path.resolve(kitPath)).href);
}
const start = "<!-- rod-architecture-start -->";
const end = "<!-- rod-architecture-end -->";
async function generateGraphs() {
  const madge = createRequire(import.meta.url)(path.join(dir, "tools/node_modules/madge"));
  async function generate(root, label) {
    const source = path.resolve(root, process.env.SOURCE_DIR);
    const write = (suffix, value) =>
      fs.writeFileSync(path.join(dir, label + suffix), JSON.stringify(value, null, 2));
    if (!fs.existsSync(source)) {
      write(".json", {});
      for (const suffix of [".orphans.json", ".leaves.json", ".circular.json"]) write(suffix, []);
      return;
    }
    const config = {
      baseDir: source,
      fileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"],
      excludeRegExp: [/node_modules|dist|coverage/],
    };
    const tsconfig = path.join(root, "tsconfig.json");
    if (fs.existsSync(tsconfig)) config.tsConfig = tsconfig;
    console.log("Analyzing " + label + ": " + source);
    const result = await madge(source, config);
    write(".json", result.obj());
    write(".orphans.json", result.orphans());
    write(".leaves.json", result.leaves());
    write(".circular.json", result.circular());
    write(".warnings.json", result.warnings());
    fs.writeFileSync(path.join(dir, label + ".dot"), await result.dot());
    await result.image(path.join(dir, label + ".svg"));
    console.log(
      label + ": " + Object.keys(result.obj()).length + " modules, " + result.circular().length + " cycles",
    );
  }
  await generate(process.env.GITHUB_WORKSPACE || process.cwd(), "head");
  await generate(path.join(dir, "base"), "base");
}
async function analyze() {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));

  const base = read("base");
  const head = read("head");

  const difference = (a, b) => [...a].filter((x) => !b.has(x)).sort();

  const modules = (graph) => new Set([...Object.keys(graph), ...Object.values(graph).flat()]);

  const edges = (graph) =>
    new Set(
      Object.entries(graph).flatMap(([from, targets]) => targets.map((to) => JSON.stringify([from, to]))),
    );

  const baseModules = modules(base);
  const headModules = modules(head);

  const baseEdges = edges(base);
  const headEdges = edges(head);

  const addedModules = difference(headModules, baseModules);

  const removedModules = difference(baseModules, headModules);

  const addedEdges = difference(headEdges, baseEdges);

  const removedEdges = difference(baseEdges, headEdges);

  // Strongly connected components (Tarjan).
  function cycles(graph) {
    let index = 0;
    const indices = new Map();
    const low = new Map();
    const stack = [];
    const active = new Set();
    const result = [];

    function visit(node) {
      indices.set(node, index);
      low.set(node, index++);
      stack.push(node);
      active.add(node);

      for (const dep of graph[node] || []) {
        if (!indices.has(dep)) {
          visit(dep);
          low.set(node, Math.min(low.get(node), low.get(dep)));
        } else if (active.has(dep)) {
          low.set(node, Math.min(low.get(node), indices.get(dep)));
        }
      }

      if (low.get(node) !== indices.get(node)) return;

      const component = [];
      let item;

      do {
        item = stack.pop();
        active.delete(item);
        component.push(item);
      } while (item !== node);

      if (component.length > 1 || (graph[node] || []).includes(node)) {
        result.push(JSON.stringify(component.sort()));
      }
    }

    for (const node of modules(graph)) {
      if (!indices.has(node)) visit(node);
    }

    return new Set(result);
  }

  function orphans(graph) {
    const incoming = new Set(Object.values(graph).flat());

    return new Set(Object.keys(graph).filter((node) => !incoming.has(node) && !(graph[node] || []).length));
  }

  const baseCycles = cycles(base);
  const headCycles = cycles(head);

  const newCycles = difference(headCycles, baseCycles);

  const resolvedCycles = difference(baseCycles, headCycles);

  const baseOrphans = orphans(base);
  const headOrphans = orphans(head);

  const changed = new Map();

  for (const edge of [...addedEdges, ...removedEdges]) {
    const [from] = JSON.parse(edge);
    changed.set(from, (changed.get(from) || 0) + 1);
  }

  const affected = [...changed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  const delta = (a, b) => {
    const value = b - a;
    return value > 0 ? `+${value}` : `${value}`;
  };

  const safe = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\|/g, "&#124;")
      .replace(/`/g, "&#96;")
      .replace(/[\r\n]/g, " ");

  const lines = [
    "<!-- rod-dependency-graph -->",
    "## 🕸️ Architecture Intelligence",
    "",
    newCycles.length
      ? "⚠️ New circular dependency groups detected."
      : "🟢 No new circular dependency groups.",
    "",
    "| Metric | Base | HEAD | Δ |",
    "| :--- | ---: | ---: | ---: |",
    `| 📦 Modules | ${baseModules.size} | ${headModules.size} | ${delta(baseModules.size, headModules.size)} |`,
    `| 🔗 Dependencies | ${baseEdges.size} | ${headEdges.size} | ${delta(baseEdges.size, headEdges.size)} |`,
    `| 🔄 Circular groups | ${baseCycles.size} | ${headCycles.size} | ${delta(baseCycles.size, headCycles.size)} |`,
    `| 🏝️ Isolated modules | ${baseOrphans.size} | ${headOrphans.size} | ${delta(baseOrphans.size, headOrphans.size)} |`,
    "",
    "### 🧬 Dependency changes",
    "",
    `- 🟢 **${addedModules.length}** modules added`,
    `- 🔴 **${removedModules.length}** modules removed`,
    `- 🟢 **${addedEdges.length}** dependencies added`,
    `- 🔴 **${removedEdges.length}** dependencies removed`,
    `- 🔄 **${newCycles.length}** new circular groups`,
    `- ✨ **${resolvedCycles.length}** resolved circular groups`,
    "",
  ];

  // Mermaid: render only the changed subgraph.
  const graph = ["flowchart TD"];
  const ids = new Map();

  function node(name) {
    if (ids.has(name)) return ids.get(name);

    const id = `n${ids.size}`;
    ids.set(name, id);

    const label = name.replace(/[^a-zA-Z0-9_./@ -]/g, "_").slice(0, 100);

    graph.push(`  ${id}["${label}"]`);
    return id;
  }

  const visualEdges = [
    ...addedEdges.map((edge) => [edge, "added"]),
    ...removedEdges.map((edge) => [edge, "removed"]),
  ].slice(0, 50);

  for (const [edge, type] of visualEdges) {
    const [from, to] = JSON.parse(edge);
    const a = node(from);
    const b = node(to);

    graph.push(type === "added" ? `  ${a} --> ${b}` : `  ${a} -.-> ${b}`);
  }

  for (const name of addedModules.slice(0, 30)) {
    graph.push(`  class ${node(name)} added`);
  }

  for (const name of removedModules.slice(0, 30)) {
    graph.push(`  class ${node(name)} removed`);
  }

  graph.push(
    "  classDef added fill:#14532d,stroke:#22c55e,color:#fff",
    "  classDef removed fill:#7f1d1d,stroke:#ef4444,color:#fff",
  );

  visualEdges.forEach(([, type], i) => {
    graph.push(`  linkStyle ${i} stroke:${type === "added" ? "#22c55e" : "#ef4444"},stroke-width:2px`);
  });

  fs.writeFileSync(path.join(dir, "changes.mmd"), graph.join("\n"));

  if (ids.size) {
    lines.push(
      "```mermaid",
      ...graph,
      "```",
      "",
      "🟢 Added · 🔴 Removed",
      "",
      "Showing up to 50 changed edges.",
      "",
    );
  } else {
    lines.push("> No dependency graph changes.", "");
  }

  function section(title, items, format = safe) {
    if (!items.length) return;

    lines.push("<details>", `<summary>${title} (${items.length})</summary>`, "");

    for (const item of items.slice(0, 50)) {
      lines.push(`- ${format(item)}`);
    }

    if (items.length > 50) {
      lines.push(`- … ${items.length - 50} more`);
    }

    lines.push("", "</details>", "");
  }

  section("🟢 Added modules", addedModules);
  section("🔴 Removed modules", removedModules);

  const formatEdge = (edge) => JSON.parse(edge).map(safe).join(" → ");

  section("🟢 Added dependencies", addedEdges, formatEdge);

  section("🔴 Removed dependencies", removedEdges, formatEdge);

  section("⚠️ New circular dependency groups", newCycles, (cycle) => JSON.parse(cycle).map(safe).join(", "));

  section("✨ Resolved circular dependency groups", resolvedCycles, (cycle) =>
    JSON.parse(cycle).map(safe).join(", "),
  );

  if (affected.length) {
    lines.push("### 🎯 Most affected modules", "", "| Module | Changed imports |", "| :--- | ---: |");

    for (const [name, count] of affected) {
      lines.push(`| ${safe(name)} | ${count} |`);
    }

    lines.push("");
  }

  const runUrl =
    `${process.env.GITHUB_SERVER_URL}/` +
    `${process.env.GITHUB_REPOSITORY}/actions/runs/` +
    process.env.GITHUB_RUN_ID;

  lines.push(
    "### 📦 Full dependency graphs",
    "",
    `[Download SVG, JSON and Mermaid artifacts](${runUrl}#artifacts)`,
    "",
    `[🔍 View workflow logs](${runUrl})`,
    "",
    "---",
    "<sub>🦾 Rod Actions · Architecture Intelligence</sub>",
  );

  const report = {
    base: {
      modules: baseModules.size,
      dependencies: baseEdges.size,
      circularGroups: baseCycles.size,
      isolatedModules: baseOrphans.size,
    },
    head: {
      modules: headModules.size,
      dependencies: headEdges.size,
      circularGroups: headCycles.size,
      isolatedModules: headOrphans.size,
    },
    addedModules,
    removedModules,
    addedEdges: addedEdges.map((value) => JSON.parse(value)),
    removedEdges: removedEdges.map((value) => JSON.parse(value)),
    newCycles: newCycles.map((value) => JSON.parse(value)),
    resolvedCycles: resolvedCycles.map((value) => JSON.parse(value)),
    affected,
  };

  const { bannerMarkdown } = await commentKit();
  const markdown = bannerMarkdown("architecture") + "\n\n" + lines.join("\n");

  const reports = [{ key: "summary", body: markdown }];
  function publish(key, title, body) {
    reports.push({
      key,
      body: "## " + title + "\n\n" + body + "\n\n[Full artifacts](" + runUrl + "#artifacts)",
    });
  }

  function mermaid(entries) {
    const ids = new Map();
    const out = ["flowchart LR"];
    function id(name) {
      if (!ids.has(name)) {
        const key = "n" + ids.size;
        ids.set(name, key);
        out.push("  " + key + '["' + name.replace(/[^a-zA-Z0-9_./@ -]/g, "_").slice(0, 120) + '"]');
      }
      return ids.get(name);
    }
    for (const [from, targets] of entries) {
      const a = id(from);
      for (const to of targets) out.push("  " + a + " --> " + id(to));
    }
    return out.join("\n");
  }

  for (const [label, data] of [
    ["base", base],
    ["head", head],
  ]) {
    const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
    fs.writeFileSync(path.join(dir, label + ".mmd"), mermaid(entries));
    const chunks = [];
    let chunk = [],
      count = 0;
    for (const [from, targets] of entries) {
      const parts = targets.length
        ? Array.from({ length: Math.ceil(targets.length / 40) }, (_, i) => targets.slice(i * 40, i * 40 + 40))
        : [[]];
      for (const part of parts) {
        const cost = Math.max(1, part.length);
        if (count + cost > 60 && chunk.length) {
          chunks.push(chunk);
          chunk = [];
          count = 0;
        }
        chunk.push([from, part]);
        count += cost;
      }
    }
    if (chunk.length) chunks.push(chunk);
    // Full graphs remain in artifacts; cap inline pages to avoid API spam.
    for (const [i, page] of chunks.slice(0, 8).entries()) {
      publish(
        label + "-graph-" + i,
        "🕸️ " +
          (label === "base" ? "main baseline" : "PR HEAD") +
          " · graph " +
          (i + 1) +
          "/" +
          chunks.length,
        "\x60\x60\x60mermaid\n" + mermaid(page) + "\n\x60\x60\x60",
      );
    }
  }
  for (const [key, title, items] of [
    ["added", "🟢 Added imports", addedEdges.map(formatEdge)],
    ["removed", "🔴 Removed imports", removedEdges.map(formatEdge)],
    ["cycles", "🔄 Circular groups", [...headCycles].map((x) => JSON.parse(x).map(safe).join(" ↔ "))],
    ["isolated", "🏝️ Isolated modules", [...headOrphans].map(safe)],
  ]) {
    for (let i = 0; i < Math.max(1, Math.ceil(items.length / 100)); i++) {
      if (i >= 8) break;
      publish(
        key + "-" + i,
        title + " · " + (i + 1),
        items
          .slice(i * 100, i * 100 + 100)
          .map((x) => "- " + x.slice(0, 400))
          .join("\n") || "None",
      );
    }
  }
  fs.writeFileSync(path.join(dir, "comments.json"), JSON.stringify(reports));

  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2));

  fs.writeFileSync(path.join(dir, "report.md"), markdown);

  appendStepSummary(markdown);

  console.log("Architecture analysis completed");
  console.log(
    JSON.stringify(
      {
        modules: headModules.size,
        dependencies: headEdges.size,
        newCycles: newCycles.length,
      },
      null,
      2,
    ),
  );
}
async function publishReport() {
  const context = buildCliContext();
  const { owner, repo } = context.repo;
  const number = context.issue.number;
  const github = createNativeGithubClient(process.env.GITHUB_TOKEN);
  const params = { owner, repo, pull_number: number };
  const pr = (await github.rest.pulls.get(params)).data;
  if (pr.state !== "open" || pr.head.sha !== context.payload.pull_request.head.sha) {
    log.skip("Stale revision");
    return;
  }
  const reports = JSON.parse(fs.readFileSync(path.join(dir, "comments.json"), "utf8"));
  const { Comment } = await commentKit();
  const details = (title, body) =>
    new Comment()
      .details(title, body)
      .render()
      .replace(/^<!--[^\n]+-->\n\n/, "");
  const url = context.serverUrl + "/" + owner + "/" + repo + "/actions/runs/" + context.runId;
  const summary = reports[0].body
    .replace("<!-- rod-dependency-graph -->", "")
    .replace(/^\s*## .*\n/, "")
    .trim();
  let section = new Comment()
    .banner("architecture")
    .info(
      "Compare main with PR HEAD. Expand the sections to inspect dependency changes, cycles and isolated modules. Full graphs and raw reports are in the artifacts.",
    )
    .link("Workflow logs", url)
    .link("All artifacts", url + "#artifacts")
    .details("📊 Overview and changes", summary.replace(/^!\[[^\n]+\n\n/, ""))
    .render();
  for (const [prefix, title] of [
    ["base-graph-", "🕸️ Main baseline"],
    ["head-graph-", "🕸️ PR HEAD"],
    ["added-", "🟢 Added imports"],
    ["removed-", "🔴 Removed imports"],
    ["cycles-", "🔄 Circular groups"],
    ["isolated-", "🏝️ Isolated modules"],
  ]) {
    const pages = reports.filter((r) => r.key.startsWith(prefix));
    if (!pages.length) continue;
    const body = pages
      .map((r) =>
        details(r.body.split("\n")[0].replace(/^## /, ""), r.body.split("\n").slice(1).join("\n").trim()),
      )
      .join("\n\n");
    const block = details(title, body);
    if (section.length + block.length < 48000) section += "\n\n" + block;
  }
  const previous = pr.body || "";
  const a = previous.indexOf(start),
    b = previous.indexOf(end);
  if (a >= 0 !== b >= 0 || (a >= 0 && b < a)) throw new Error("Invalid managed section markers");
  const managed = start + "\n" + section + "\n" + end;
  const body =
    a < 0 ? previous + "\n\n" + managed : previous.slice(0, a) + managed + previous.slice(b + end.length);
  if (body.length > 65000) throw new Error("PR description exceeds safe size; artifacts preserved");
  const latest = (await github.rest.pulls.get(params)).data;
  if (latest.state !== "open" || latest.head.sha !== pr.head.sha || latest.body !== pr.body) {
    log.skip("PR changed during report generation");
    return;
  }
  await github.rest.pulls.update({ ...params, body });
  const bot = process.env.APP_SLUG + "[bot]";
  const comments = [];
  for (let page = 1; ; page++) {
    const { data } = await github.rest.issues.listComments({
      owner,
      repo,
      issue_number: number,
      page,
      per_page: 100,
    });
    comments.push(...data);
    if (data.length < 100) break;
  }
  for (const comment of comments)
    if (comment.user?.login === bot && /<!-- rod-dependency-graph(?::[^>]+)? -->/.test(comment.body || ""))
      await github.rest.issues.deleteComment({ owner, repo, comment_id: comment.id });
}
log.banner();
try {
  const command = args._[0];
  if (command === "generate") await log.step("Generate graphs", generateGraphs);
  else if (command === "analyze") await log.step("Analyze architecture", analyze);
  else if (command === "publish") await log.step("Publish PR description", publishReport);
  else
    throw new Error(
      "Usage: dependency-graph.mjs <generate|analyze|publish> [--source src] [--output directory]",
    );
  log.summary("success");
} catch (error) {
  log.fail("Dependency graph", error.message);
  process.exitCode = 1;
}
