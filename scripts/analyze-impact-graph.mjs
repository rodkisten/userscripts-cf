import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { runAction } from "./utils/action.mjs";
import { AgentReporter, ansi } from "./utils/ci-logger.mjs";
import { appendStepSummary, runCmd, setActionOutput } from "./utils/ci-utils.mjs";

const toPosix = (p) => p.split("\\").join("/");
const escapeMermaidLabel = (text) => text.replaceAll('"', "&quot;");

function walkTests(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTests(full, acc);
    } else if (/\.(test|spec)\.(js|ts|mjs|mts|jsx|tsx)$/.test(entry)) {
      acc.push(toPosix(full));
    }
  }
  return acc;
}

function outputPathFromArgs(argv) {
  const inline = argv.find((arg) => arg.startsWith("--out="));
  if (inline) return inline.slice("--out=".length).trim();

  const index = argv.indexOf("--out");
  return index >= 0 ? String(argv[index + 1] || "").trim() : "";
}

function requireCommand(command, args, log) {
  const result = runCmd(command, args, { logger: log, silent: true });
  if (!result.ok) {
    const detail = result.stderr || result.stdout || `exit ${result.status}`;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

await runAction("Impact & Test Map", async ({ log }) => {
  const logger = log instanceof AgentReporter ? log : new AgentReporter("Impact & Test Map");
  const baseRef = (process.env.BASE_REF || "main").trim();
  const outFile = outputPathFromArgs(process.argv.slice(2));

  logger.subtitle = `Base: ${baseRef}`;
  logger.banner();

  const { diffTarget, rawChanged } = await logger.step("Resolve Git diff in src/", async () => {
    runCmd("git", ["fetch", "--no-tags", "origin", baseRef], { logger, silent: true });

    const originVerify = runCmd("git", ["rev-parse", "--verify", `origin/${baseRef}`], {
      logger,
      silent: true,
    });
    const localVerify = originVerify.ok
      ? originVerify
      : runCmd("git", ["rev-parse", "--verify", baseRef], { logger, silent: true });

    if (!localVerify.ok) {
      throw new Error(
        `Unable to resolve base ref ${baseRef}: ${localVerify.stderr || localVerify.stdout || "unknown Git error"}`,
      );
    }

    const target = localVerify.stdout.trim();
    const diffRes = requireCommand(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", `${target}...HEAD`, "--", "src"],
      logger,
    );

    const changed = diffRes.stdout
      .split(/\r?\n/)
      .map(toPosix)
      .filter((file) => file && /\.(js|ts|mjs|mts|jsx|tsx)$/.test(file));

    logger.kvTable({
      "Base SHA": `${target.slice(0, 7)} (${baseRef})`,
      "Changed files in src/": changed.length,
    });

    return { diffTarget: target, rawChanged: changed };
  });

  const { folders, matchedNodeTests } = await logger.step("Map affected scopes & tests", () => {
    const allTestFiles = [...new Set([...walkTests("src"), ...walkTests("tests")])];
    const grouped = new Map();
    const tests = new Set();

    for (const file of rawChanged) {
      const rel = toPosix(relative("src", file));
      const parts = rel.split("/");
      const folder = parts.length > 1 ? `src/${parts[0]}` : "src (raiz)";

      if (!grouped.has(folder)) {
        grouped.set(folder, { sourceFiles: [], testFiles: [] });
      }

      const bucket = grouped.get(folder);
      const isTest = /\.(test|spec)\./.test(file);

      if (isTest) {
        bucket.testFiles.push(file);
        tests.add(file);
      } else {
        bucket.sourceFiles.push(file);
        const stem = basename(file, extname(file));
        const fileDir = toPosix(dirname(file));
        const mirroredDir = fileDir.replace(/^src(?=\/|$)/, "tests");

        const related = allTestFiles.filter((testFile) => {
          const testDir = toPosix(dirname(testFile));
          return basename(testFile).startsWith(`${stem}.`) || testDir === fileDir || testDir === mirroredDir;
        });

        for (const testFile of related) {
          bucket.testFiles.push(testFile);
          tests.add(testFile);
        }
      }
    }

    logger.kvTable({
      "Affected scopes": grouped.size,
      "Related test files": tests.size,
    });

    return { folders: grouped, matchedNodeTests: tests };
  });

  const mermaid = [
    "flowchart LR",
    "  classDef folder fill:#1e293b,stroke:#38bdf8,color:#f8fafc,stroke-width:2px;",
    "  classDef src fill:#0f172a,stroke:#94a3b8,color:#e2e8f0;",
    "  classDef test fill:#064e3b,stroke:#34d399,color:#ecfdf5;",
  ];
  let nodeIdx = 0;

  if (folders.size === 0) {
    mermaid.push('  empty["✅ Nenhuma modificação encontrada em src/"]');
  } else {
    for (const [folder, { sourceFiles, testFiles }] of folders.entries()) {
      const folderId = `folder_${nodeIdx++}`;
      mermaid.push(`  subgraph ${folderId}["📁 ${escapeMermaidLabel(folder)}"]`);
      mermaid.push("    direction TB");

      const sourceIds = [...new Set(sourceFiles)].map((sourceFile) => {
        const id = `src_${nodeIdx++}`;
        mermaid.push(`    ${id}["📄 ${escapeMermaidLabel(basename(sourceFile))}"]:::src`);
        return id;
      });

      const testIds = [...new Set(testFiles)].map((testFile) => {
        const id = `tst_${nodeIdx++}`;
        mermaid.push(`    ${id}(["🧪 ${escapeMermaidLabel(basename(testFile))}"]):::test`);
        return id;
      });

      mermaid.push("  end");
      mermaid.push(`  class ${folderId} folder`);

      if (sourceIds.length > 0 && testIds.length > 0) {
        for (const sourceId of sourceIds) {
          for (const testId of testIds) {
            mermaid.push(`  ${sourceId} -.-> ${testId}`);
          }
        }
      }
    }
  }

  setActionOutput("has_files", rawChanged.length > 0);
  setActionOutput("changed_files", rawChanged.join(" "));
  setActionOutput("node_tests", [...matchedNodeTests].join(" "));

  const scopeData = [...folders.entries()].map(([folder, value]) => ({
    folder,
    sourceFiles: [...new Set(value.sourceFiles)],
    testFiles: [...new Set(value.testFiles)],
  }));

  if (outFile) {
    writeFileSync(
      outFile,
      `${JSON.stringify(
        {
          baseRef,
          baseSha: diffTarget,
          changedFiles: rawChanged,
          relatedTests: [...matchedNodeTests],
          scopes: scopeData,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    logger.info("Impact graph JSON", outFile);
  }

  appendStepSummary(
    [
      "## 📊 Mapa de Impacto & Testes Relacionados",
      "",
      `**Base comparada:** \`${baseRef}\` (\`${diffTarget.slice(0, 7)}\`) · **Arquivos modificados em \`src/\`:** \`${rawChanged.length}\``,
      "",
      "```mermaid",
      ...mermaid,
      "```",
    ].join("\n"),
  );

  logger.pass(
    "Impact map generated",
    `${ansi.bold(`${rawChanged.length} file(s)`)} across ${ansi.bold(`${folders.size} scope(s)`)}`,
  );
  logger.summary("success", {
    Files: rawChanged.length,
    Scopes: folders.size,
    "Related tests": matchedNodeTests.size,
  });
});
