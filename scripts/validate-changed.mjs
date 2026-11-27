import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import definitions from "../userscripts.config.js";
import { analyzeRuntimeGraph } from "../build/runtime-graph.mjs";
import { AgentReporter, ansi } from "./utils/ci-logger.mjs";
import {
  appendStepSummary,
  parseCliArgs,
  resolveInputs,
  runCmd,
  setActionOutput,
} from "./utils/ci-utils.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT_DIR);

const CHANGED_FILES_PATH = "changed-files.txt";
const AFFECTED_REPORT_PATH = "affected-userscripts.json";
const ALL_BUILD_TARGETS = [...definitions.map((definition) => definition.id), "standalone", "unified"];

const BIN_DIR = path.join(ROOT_DIR, "node_modules", ".bin");
const VITEST_BIN = path.join(BIN_DIR, process.platform === "win32" ? "vitest.cmd" : "vitest");
const TSC_BIN = path.join(BIN_DIR, process.platform === "win32" ? "tsc.cmd" : "tsc");

// Regexes de classificação de arquivos
const RELEVANT_CHANGE_RE =
  /^(src\/|tests\/|build\/|labs\/|playground\/|public\/|migration\/|package(-lock)?\.json$|tsconfig|vite\.config\.|\.github\/workflows\/)/;

const SHARED_INFRA_RE =
  /^(build\/|src\/(runtime\/|core\/|config\/|styles\/|selectors\.|assets\/)|package(-lock)?\.json$|vite\.config\.|tsconfig|migration\/)/;

const BUNDLER_OR_CONFIG_RE =
  /^(build\/(build\.mjs|runtime-graph\.mjs|run-runtime-utility-tests\.mjs)|package(-lock)?\.json$|userscripts\.config\.js$|vite\.config\.)/;

const TEST_FILE_RE = /^tests\/.*\.test\.[cm]?[jt]sx?$/;
const INTEGRATION_TEST_RE = /(integration|integrated|boot|standalone|page-repl).*\.test\./;

// ============================================================================
// Helpers Internos & Execução Instrumentada
// ============================================================================
function formatDuration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function readChangedFilesList() {
  if (!fs.existsSync(CHANGED_FILES_PATH)) {
    return [];
  }
  return fs
    .readFileSync(CHANGED_FILES_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Executa um comando de forma assíncrona com logs de início, duração e erro detalhado.
 */
function execAsync(cmd, args, { step, label, env = process.env, silent = false } = {}) {
  const start = performance.now();
  const displayCmd = `${path.basename(cmd)} ${args.join(" ")}`;
  const tag = label || displayCmd;

  if (step) {
    step.status(`[Iniciando] ${tag}`);
  } else {
    process.stdout.write(`  ${ansi.dim("→")} [Iniciando] ${tag}\n`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: silent ? "pipe" : "inherit",
      env,
      shell: process.platform === "win32" && cmd.endsWith(".cmd"),
    });

    let stderr = "";
    if (silent && child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", (err) => {
      reject(new Error(`Erro ao iniciar "${displayCmd}": ${err.message}`));
    });

    child.on("close", (code) => {
      const elapsed = formatDuration(performance.now() - start);
      if (code === 0) {
        if (step) {
          step.info(`[Concluído · ${elapsed}]`, tag);
        } else {
          process.stdout.write(`  ${ansi.dim("✓")} [Concluído · ${elapsed}] ${tag}\n`);
        }
        resolve();
      } else {
        const extra = stderr ? `\n${stderr.trim()}` : "";
        reject(new Error(`Comando falhou (código ${code} após ${elapsed}): ${displayCmd}${extra}`));
      }
    });
  });
}

function readPrCiScope(logger, step) {
  const start = performance.now();
  step?.status("Lendo diretivas de escopo do PR (build/pr-ci-scope.mjs)...");
  const res = runCmd(process.execPath, ["build/pr-ci-scope.mjs"], { logger });
  if (!res.ok || !res.stdout) {
    throw new Error(`Falha ao executar build/pr-ci-scope.mjs: ${res.stderr}`);
  }
  const elapsed = formatDuration(performance.now() - start);
  step?.info("Escopo do PR resolvido", elapsed);
  return JSON.parse(res.stdout);
}

function collectTestFilesRecursively(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTestFilesRecursively(fullPath));
    } else if (entry.isFile() && /\.test\./.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function resolveAffectedTargets(changedFiles, step) {
  const start = performance.now();
  const changedSrc = changedFiles.filter((f) => f.startsWith("src/"));

  step?.status(`Analisando grafo de runtime em paralelo (${definitions.length} entrypoints)...`);

  const graphs = await Promise.all(
    definitions.map(async (definition) => {
      const graph = await analyzeRuntimeGraph(definition.entry);
      return { definition, graph };
    }),
  );

  const affected = [];
  const reasons = {};

  for (const { definition, graph } of graphs) {
    const matches = changedSrc.filter((file) => graph.files.includes(file));
    if (matches.length > 0) {
      affected.push(definition.id);
      reasons[definition.id] = matches;
    }
  }

  const targets = [
    ...new Set(
      affected.flatMap((id) => {
        const def = definitions.find((d) => d.id === id);
        return def?.unified === false ? [id] : [id, "unified"];
      }),
    ),
  ];

  const elapsed = formatDuration(performance.now() - start);
  step?.info(
    `Grafo resolvido (${elapsed})`,
    affected.length > 0 ? `${affected.length} userscript(s) afetado(s)` : "nenhum userscript afetado",
  );

  return { changed: changedSrc, affected, reasons, targets };
}

// ============================================================================
// MODO 1: PLAN (Detecção de mudanças e escopo)
// ============================================================================
export async function planValidation() {
  const log = new AgentReporter("VALIDATE PLAN", process.env.EVENT_NAME || "push");
  log.banner();

  return log.step("Detectar alterações e planejar escopo de validação", async (step) => {
    const { eventName, beforeSha, prBaseSha, prHeadSha, scope, prTitle } = resolveInputs({
      eventName: [process.env.EVENT_NAME, "push"],
      beforeSha: [process.env.BEFORE_SHA],
      prBaseSha: [process.env.PR_BASE_SHA],
      prHeadSha: [process.env.PR_HEAD_SHA],
      scope: [process.env.SCOPE, "changed"],
      prTitle: [process.env.PR_TITLE],
    });

    step.info("Contexto recebido", `event=${eventName} · scope=${scope}`);

    // 1. Escopo explícito via título do PR
    if (eventName === "pull_request" && prTitle) {
      const scopeData = readPrCiScope(log, step);
      setActionOutput("matrix", JSON.stringify(scopeData.matrix ?? []));

      if (scopeData.explicit === true) {
        setActionOutput("full", "false");
        setActionOutput("run", "true");
        step.pass("Escopo explícito detectado no título do PR", JSON.stringify(scopeData.matrix ?? []));
        log.summary({ Run: "true", Full: "false", Mode: "explicit-pr-title" });
        return;
      }
    }

    // 2. Workflow dispatch com scope=all
    if (scope === "all") {
      setActionOutput("full", "true");
      setActionOutput("run", "true");
      setActionOutput("matrix", "[]");
      step.pass("Validação completa solicitada", "scope=all");
      log.summary({ Run: "true", Full: "true", Mode: eventName });
      return;
    }

    // 3. Determinar commit base para comparação
    step.status("Resolvendo commit base no Git...");
    let base = "";
    if (eventName === "workflow_dispatch" && scope === "changed") {
      const rev = runCmd("git", ["rev-parse", "HEAD^"], { silent: true });
      base = rev.ok ? rev.stdout : "";
    } else if (eventName === "pull_request") {
      const mb = runCmd("git", ["merge-base", prBaseSha, prHeadSha], { silent: true });
      base = mb.ok ? mb.stdout : "";
    } else {
      base = beforeSha;
    }

    const commitExists =
      base &&
      !/^0+$/.test(base) &&
      runCmd("git", ["cat-file", "-e", `${base}^{commit}`], { silent: true }).ok;

    if (!commitExists) {
      setActionOutput("full", "true");
      setActionOutput("run", "true");
      step.warn("Commit base ausente ou histórico reescrito", "Fallback para validação completa");
      log.summary({ Run: "true", Full: "true", Base: "(fallback)" });
      return;
    }

    // 4. Listar arquivos alterados
    const headRef = prHeadSha || "HEAD";
    step.status(`Executando git diff (${base.slice(0, 7)}..${headRef.slice(0, 7)})...`);
    const diffRes = runCmd("git", ["diff", "--name-only", "--diff-filter=ACMRT", base, headRef], {
      logger: log,
    });

    const changedFiles =
      diffRes.ok && diffRes.stdout
        ? diffRes.stdout
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean)
        : [];

    fs.writeFileSync(CHANGED_FILES_PATH, changedFiles.length ? `${changedFiles.join("\n")}\n` : "", "utf8");

    if (changedFiles.length === 0) {
      setActionOutput("run", "false");
      step.info("Nenhum arquivo alterado detectado", "Validação ignorada");
      log.summary({ Run: "false", Changed: "0" });
      return;
    }

    step.info(`${changedFiles.length} arquivo(s) alterado(s) detectado(s)`);
    for (const file of changedFiles.slice(0, 15)) {
      process.stdout.write(`    ${ansi.dim("•")} ${file}\n`);
    }
    if (changedFiles.length > 15) {
      process.stdout.write(`    ${ansi.dim(`... e mais ${changedFiles.length - 15} arquivo(s)`)}\n`);
    }

    if (!changedFiles.some((f) => RELEVANT_CHANGE_RE.test(f))) {
      setActionOutput("run", "false");
      step.info("Apenas arquivos não-executáveis/docs alterados", "Validação ignorada");
      log.summary({ Run: "false", Changed: String(changedFiles.length) });
      return;
    }

    const isFull = changedFiles.some((f) => SHARED_INFRA_RE.test(f));
    setActionOutput("run", "true");
    setActionOutput("full", String(isFull));
    setActionOutput("matrix", JSON.stringify(isFull ? ALL_BUILD_TARGETS : []));

    step.pass("Plano gerado", `run=true · full=${isFull} · builds=${isFull ? ALL_BUILD_TARGETS.length : 0}`);
    log.summary({
      Run: "true",
      Full: String(isFull),
      "Base SHA": base.slice(0, 7),
      Arquivos: String(changedFiles.length),
    });
  });
}

// ============================================================================
// MODO 2: RUN (Execução da validação seletiva ou completa)
// ============================================================================
export async function runValidation() {
  const totalStart = performance.now();
  const isFull = process.env.FULL === "true";
  const prTitle = process.env.PR_TITLE || "";
  const scopedBuildsMatrix =
    process.env.SCOPED_BUILDS_MATRIX === "true" && process.env.EVENT_NAME === "pull_request";
  const scriptTestsSeparate = process.env.SCRIPT_TESTS_SEPARATE === "true";

  const log = new AgentReporter("VALIDATE RUN", isFull ? "Full Suite" : "Selective");
  log.banner();

  const childEnv = { ...process.env };

  // --------------------------------------------------------------------------
  // Ramo A: Escopo explícito definido no título do PR
  // --------------------------------------------------------------------------
  if (prTitle) {
    let handledExplicit = false;
    await log.step("Verificar diretivas explícitas no título do PR", async (step) => {
      const scopeData = readPrCiScope(log, step);
      if (scopeData.explicit !== true) {
        step.pass("Nenhuma diretiva explícita ativa", "Prosseguindo com fluxo padrão");
        return;
      }

      handledExplicit = true;
      step.info("Escopo explícito", JSON.stringify(scopeData));

      const scopedTests = Array.isArray(scopeData.tests) ? scopeData.tests : [];
      const scopedBuilds = Array.isArray(scopeData.builds) ? scopeData.builds : [];

      if (scopedBuilds.length > 0 && scopedBuilds[0] !== "none") {
        childEnv.BUILD_REASON = "Explicit PR-title build directive";
        if (scopedBuilds[0] === "all") {
          await execAsync("npm", ["run", "build"], {
            step,
            label: "Build completo (npm run build)",
            env: childEnv,
          });
          delete childEnv.RUNTIME_TEST_SKIP_DIST;
        } else if (!scopedBuildsMatrix) {
          await execAsync(process.execPath, ["build/build.mjs", `--targets=${scopedBuilds.join(",")}`], {
            step,
            label: `Build targets (${scopedBuilds.join(",")})`,
            env: childEnv,
          });
        } else {
          step.info("Builds", "Delegados para matriz paralela");
        }
      } else {
        step.info("Builds", "Ignorados pela diretiva explícita");
      }

      if (scopedTests.length > 0 && scopedTests[0] !== "none") {
        await execAsync("npm", ["run", "test:unit"], {
          step,
          label: "Testes unitários (npm run test:unit)",
          env: childEnv,
        });
      } else {
        step.info("Testes", "Ignorados pela diretiva explícita");
      }

      appendStepSummary(
        [
          "### Explicit PR-title validation",
          "```json",
          JSON.stringify(scopeData, null, 2),
          "```",
          "Other required checks remain independently enforced.",
        ].join("\n"),
      );

      step.pass("Validação explícita concluída", formatDuration(performance.now() - totalStart));
    });

    if (handledExplicit) {
      log.summary({ Mode: "explicit-pr-title", Duração: formatDuration(performance.now() - totalStart) });
      return;
    }
  }

  const changedFiles = readChangedFilesList();
  const hasChangedManifest = fs.existsSync(CHANGED_FILES_PATH);

  // --------------------------------------------------------------------------
  // Ramo B: Infraestrutura compartilhada alterada (FULL=true)
  // --------------------------------------------------------------------------
  if (isFull) {
    const bundlerChanged = !hasChangedManifest || changedFiles.some((f) => BUNDLER_OR_CONFIG_RE.test(f));
    const labChanged = changedFiles.some((file) => file.startsWith("labs/"));
    const hostingChanged =
      !hasChangedManifest ||
      changedFiles.some(
        (file) =>
          file.startsWith("playground/") || file.startsWith("public/") || file === "build/hosting.mjs",
      );

    let report = null;

    // B.1 Análise estática e resolução de grafo em paralelo
    await log.step("Análise estática (Typecheck + Style) e grafo em paralelo", async (step) => {
      const tasks = [
        execAsync(TSC_BIN, ["--noEmit"], {
          step,
          label: "Typecheck (tsc --noEmit)",
          env: childEnv,
        }),
        hasChangedManifest
          ? execAsync(
              process.execPath,
              ["build/check-style.mjs", "--changed", `--files-from=${CHANGED_FILES_PATH}`],
              { step, label: "Check style (arquivos alterados)", env: childEnv },
            )
          : execAsync("npm", ["run", "lint"], {
              step,
              label: "Lint completo (npm run lint)",
              env: childEnv,
            }),
      ];

      if (!scopedBuildsMatrix && !hostingChanged && !bundlerChanged) {
        tasks.push(resolveAffectedTargets(changedFiles, step));
      }

      const results = await Promise.all(tasks);
      if (results[2]) {
        report = results[2];
      }

      step.pass("Análise estática concluída");
    });

    // B.2 Build
    await log.step("Compilação e empacotamento (Build)", async (step) => {
      childEnv.RUNTIME_TEST_SKIP_DIST = "true";

      if (scopedBuildsMatrix && !hostingChanged) {
        step.pass(
          "Builds delegados para matrix",
          `${ALL_BUILD_TARGETS.length} targets serão compilados em jobs paralelos`,
        );
      } else if (!bundlerChanged && report) {
        step.info("Targets afetados no grafo", report.targets.join(", ") || "(nenhum)");

        if (report.targets.length > 0) {
          childEnv.BUILD_REASON = "Changed files matched the runtime dependency graph";
          childEnv.BUILD_TARGET_REASONS = JSON.stringify(
            Object.fromEntries(
              report.targets.map((id) => [
                id,
                id === "unified"
                  ? "Aggregate of affected unified modules"
                  : (report.reasons[id] || []).join(", "),
              ]),
            ),
          );
          await execAsync(process.execPath, ["build/build.mjs", `--targets=${report.targets.join(",")}`], {
            step,
            label: `Build seletivo (${report.targets.join(",")})`,
            env: childEnv,
          });
        }
        step.pass("Build seletivo concluído");
      } else {
        step.info(
          "Build completo necessário no job principal",
          hostingChanged ? "Hosting depende da distribuição completa" : "Bundler/Config alterado ou matrix indisponível",
        );
        childEnv.BUILD_REASON = hostingChanged
          ? "Hosting requires the complete distribution"
          : "Full build required by validation plan";
        await execAsync("npm", ["run", "build"], {
          step,
          label: "Build completo (npm run build)",
          env: childEnv,
        });
        delete childEnv.RUNTIME_TEST_SKIP_DIST;
        step.pass("Build completo concluído");
      }
    });

    // B.3 Suíte de testes e hosting
    await log.step("Executar suíte completa de testes e hosting", async (step) => {
      await execAsync("npm", ["run", "test:unit"], {
        step,
        label: "Testes unitários completos (npm run test:unit)",
        env: childEnv,
      });

      if (labChanged) {
        await execAsync("npm", ["run", "test:lab"], {
          step,
          label: "Testes de laboratório (npm run test:lab)",
          env: childEnv,
        });
      } else {
        step.info("Lab", "Sem alterações em labs/; testes de laboratório ignorados");
      }

      if (hostingChanged) {
        await execAsync(process.execPath, ["build/hosting.mjs"], {
          step,
          label: "Gerar artefatos de hosting (build/hosting.mjs)",
          env: childEnv,
        });
      } else {
        step.info("Hosting", "Sem alterações em playground/public/hosting; geração ignorada");
      }

      step.pass("Validação completa finalizada");
    });

    log.summary({
      Mode: "full",
      Arquivos: String(changedFiles.length),
      Duração: formatDuration(performance.now() - totalStart),
    });
    return;
  }

  // --------------------------------------------------------------------------
  // Ramo C: Validação seletiva por arquivo/grafo (FULL=false)
  // --------------------------------------------------------------------------
  let sourceChanged = false;
  let buildNeeded = false;
  let labChanged = false;
  let hostingChanged = false;

  for (const file of changedFiles) {
    if (file.startsWith("src/")) {
      sourceChanged = true;
      buildNeeded = true;
    } else if (file.startsWith("labs/")) {
      labChanged = true;
    } else if (file.startsWith("playground/") || file.startsWith("public/")) {
      hostingChanged = true;
      buildNeeded = true;
    }
  }

  const changedTests = changedFiles.filter((f) => TEST_FILE_RE.test(f));
  const hasIntegrationTest = changedTests.some((f) => INTEGRATION_TEST_RE.test(f));
  if (hasIntegrationTest) {
    buildNeeded = true;
  }

  let affectedReport = null;

  // C.1 + C.2: Typecheck, Style e Grafo Transitivo em PARALELO
  if (sourceChanged) {
    await log.step("Typecheck, análise de estilo e grafo de runtime (paralelo)", async (step) => {
      const lintTask = hasChangedManifest
        ? execAsync(
            process.execPath,
            ["build/check-style.mjs", "--changed", `--files-from=${CHANGED_FILES_PATH}`],
            { step, label: "Check style (arquivos alterados)", env: childEnv },
          )
        : execAsync("npm", ["run", "lint"], {
            step,
            label: "Lint (npm run lint)",
            env: childEnv,
          });

      const [, , report] = await Promise.all([
        execAsync(TSC_BIN, ["--noEmit"], {
          step,
          label: "Typecheck (tsc --noEmit)",
          env: childEnv,
        }),
        lintTask,
        resolveAffectedTargets(changedFiles, step),
      ]);

      affectedReport = report;
      fs.writeFileSync(AFFECTED_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

      const summaryLines = [
        "#### Dependency graph",
        ...report.affected.map(
          (id) => `- \`${id}\` ← ${report.reasons[id].map((f) => `\`${f}\``).join(", ")}`,
        ),
      ];
      appendStepSummary(summaryLines.join("\n"));

      step.pass(
        "Análise estática e grafo concluídos",
        report.affected.join(", ") || "(nenhum match no grafo)",
      );
    });
  }

  // C.3 Build seletivo ou completo
  childEnv.RUNTIME_TEST_SKIP_DIST = "true";

  if (buildNeeded) {
    await log.step("Compilar bundles afetados", async (step) => {
      if (sourceChanged && affectedReport && !hasIntegrationTest) {
        if (affectedReport.targets.length > 0) {
          childEnv.BUILD_REASON = "Changed files matched the runtime dependency graph";
          childEnv.BUILD_TARGET_REASONS = JSON.stringify(
            Object.fromEntries(
              affectedReport.targets.map((id) => [
                id,
                id === "unified"
                  ? "Aggregate of affected unified modules"
                  : (affectedReport.reasons[id] || []).join(", "),
              ]),
            ),
          );
          step.info("Targets selecionados", affectedReport.targets.join(", "));
          await execAsync(
            process.execPath,
            ["build/build.mjs", `--targets=${affectedReport.targets.join(",")}`],
            {
              step,
              label: `Build seletivo (${affectedReport.targets.join(",")})`,
              env: childEnv,
            },
          );
        } else {
          step.info("Nenhum entrypoint afetado", "Build de bundles ignorado");
        }
      } else {
        step.info(
          "Build completo necessário",
          hasIntegrationTest ? "Testes de integração detectados" : "Hosting/Assets alterados",
        );
        await execAsync("npm", ["run", "build"], {
          step,
          label: "Build completo (npm run build)",
          env: childEnv,
        });
        delete childEnv.RUNTIME_TEST_SKIP_DIST;
      }
      step.pass("Etapa de build concluída");
    });
  }

  // C.4 Execução direta dos testes relacionados (sem boot duplo do Vitest!)
  await log.step("Selecionar e executar testes relacionados", async (step) => {
    const selectedTestsSet = new Set(changedTests);
    const changedSources = changedFiles.filter((f) => f.startsWith("src/"));

    if (sourceChanged && affectedReport) {
      for (const id of affectedReport.affected || []) {
        const userTestDir = path.posix.join("tests/userscripts", id);
        for (const testFile of collectTestFilesRecursively(userTestDir)) {
          selectedTestsSet.add(testFile);
        }
      }
    }

    let explicitTests = [...selectedTestsSet]
      .map((t) => t.replace(/^.*(\/tests\/)/, "tests/"))
      .sort();

    if (scriptTestsSeparate) {
      explicitTests = explicitTests.filter((t) => !/^tests\/userscripts\/[^/]+\//.test(t));
    }

    if (changedSources.length === 0 && explicitTests.length === 0) {
      step.pass("Nenhum teste relacionado encontrado", "Etapa ignorada");
      return;
    }

    step.info(
      "Alvos de teste",
      `${changedSources.length} arquivo(s) src/ · ${explicitTests.length} teste(s) explícito(s)`,
    );
    if (explicitTests.length > 0) {
      for (const t of explicitTests.slice(0, 15)) {
        process.stdout.write(`    ${ansi.dim("•")} ${t}\n`);
      }
      if (explicitTests.length > 15) {
        process.stdout.write(`    ${ansi.dim(`... e mais ${explicitTests.length - 15} arquivo(s)`)}\n`);
      }
    }

    // Um único processo Vitest executando apenas os testes relacionados aos arquivos src/ + testes explícitos
    const vitestArgs = [
      "run",
      "--passWithNoTests",
      "--exclude",
      "**/runtime-startup-benchmark.test.js",
      ...(changedSources.length > 0 ? ["--related", ...changedSources] : []),
      ...explicitTests,
    ];

    await execAsync(VITEST_BIN, vitestArgs, {
      step,
      label: "Vitest (apenas testes relacionados)",
      env: childEnv,
    });

    step.pass("Testes relacionados aprovados");
  });

  if (labChanged) {
    await log.step("Executar testes de laboratório (test:lab)", async (step) => {
      await execAsync("npm", ["run", "test:lab"], {
        step,
        label: "Testes de lab (npm run test:lab)",
        env: childEnv,
      });
      step.pass("Testes de lab aprovados");
    });
  }

  if (hostingChanged) {
    await log.step("Atualizar artefatos de hosting", async (step) => {
      await execAsync(process.execPath, ["build/hosting.mjs"], {
        step,
        label: "Hosting (build/hosting.mjs)",
        env: childEnv,
      });
      step.pass("Hosting atualizado");
    });
  }

  // Step Summary final
  appendStepSummary(
    [
      "### Selective validation",
      "| Check | Enabled |",
      "|---|---|",
      `| Typecheck and lint | ${sourceChanged} |`,
      `| Build | ${buildNeeded} |`,
      `| Selective Vitest | ${sourceChanged || changedTests.length > 0} |`,
      `| Lab | ${labChanged} |`,
      `| Hosting | ${hostingChanged} |`,
      "",
      "Changed files:",
      ...changedFiles.map((f) => `- \`${f}\``),
    ].join("\n"),
  );

  log.summary({
    "Typecheck/Lint": String(sourceChanged),
    Build: String(buildNeeded),
    Lab: String(labChanged),
    Hosting: String(hostingChanged),
    Duração: formatDuration(performance.now() - totalStart),
  });
}

// ============================================================================
// CLI Entrypoint
// ============================================================================
const COMMANDS = {
  plan: planValidation,
  run: runValidation,
};

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const mode = args._[0] || "run";
  const handler = COMMANDS[mode];

  if (!handler) {
    console.error("Usage: node build/validate-changed.mjs <plan|run>");
    process.exit(2);
  }

  await handler();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
