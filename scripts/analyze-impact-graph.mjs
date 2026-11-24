import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { runAction } from "./utils/action.mjs";
import { runCmd, setActionOutput, appendStepSummary } from "./utils/ci-utils.mjs";
import { ansi as style } from "./utils/ci-logger.mjs";
import { writeFileSync } from "node:fs";
const cmd = (name, args) => {
  const execute = (allowFailure) => {
    const result = runCmd(name, args);
    if (!result.ok && !allowFailure) throw new Error(result.stderr);
    return { ...result, exitCode: result.status };
  };
  return {
    then: (resolve, reject) =>
      Promise.resolve()
        .then(() => execute(false))
        .then(resolve, reject),
    nothrow: () => execute(true),
  };
};

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

runAction("Impact & Test Map", async ({ log: logger }) => {
  const baseRef = (process.env.BASE_REF || "main").trim();
  logger.banner("Impact & Test Map", `Base: ${baseRef}`);

  const { diffTarget, rawChanged } = await logger.step("Resolve Git diff in src/", async () => {
    await cmd("git", ["fetch", "origin", baseRef, "--depth=1"]).nothrow();

    const originVerify = await cmd("git", ["rev-parse", "--verify", `origin/${baseRef}`]).nothrow();
    const target =
      originVerify.exitCode === 0
        ? originVerify.stdout.trim()
        : (await cmd("git", ["rev-parse", "--verify", baseRef])).stdout.trim();

    const diffRes = await cmd("git", [
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      `${target}...HEAD`,
      "--",
      "src",
    ]);

    const changed = diffRes.stdout
      .split(/\r?\n/)
      .map(toPosix)
      .filter((file) => file && /\.(js|ts|mjs|mts|jsx|tsx)$/.test(file));

    logger.info("Base SHA", `${target.slice(0, 7)} (${baseRef})`);
    logger.info("Changed files in src/", changed.length, true);
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

        const related = allTestFiles.filter((t) => {
          const testDir = toPosix(dirname(t));
          return basename(t).startsWith(`${stem}.`) || testDir === fileDir || testDir === mirroredDir;
        });

        for (const testFile of related) {
          bucket.testFiles.push(testFile);
          tests.add(testFile);
        }
      }
    }

    logger.info("Affected scopes", grouped.size);
    logger.info("Related test files", tests.size, true);
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
      const fId = `folder_${nodeIdx++}`;
      mermaid.push(`  subgraph ${fId}["📁 ${escapeMermaidLabel(folder)}"]`);
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
      mermaid.push(`  class ${fId} folder`);

      if (sourceIds.length > 0 && testIds.length > 0) {
        for (const sourceId of sourceIds) {
          for (const testId of testIds) {
            mermaid.push(`  ${sourceId} -.-> ${testId}`);
          }
        }
      }
    }
  }

  logger.info("Outputs & Job Summary");

  const outputs = {
    has_files: rawChanged.length > 0,
    changed_files: rawChanged.join(" "),
    node_tests: [...matchedNodeTests].join(" "),
  };
  for (const [key, value] of Object.entries(outputs)) setActionOutput(key, value);
  const outFile = process.argv.find((arg) => arg.startsWith("--out="))?.slice(6);

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
          ...outputs,
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
    `${style.bold(`${rawChanged.length} file(s)`)} across ${style.bold(`${folders.size} scope(s)`)}`,
  );
  logger.summary("success", {
    Files: rawChanged.length,
    Scopes: folders.size,
    "Related tests": matchedNodeTests.size,
  });
});
