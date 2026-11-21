// ============================================================================
// ORQUESTRADOR PRINCIPAL (build/index.mjs)
// ============================================================================
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const fragmentsDir = path.join(out, ".fragments");
const iconSource = path.join(root, "assets", "icons");

const requestedArg = process.argv.find((arg) => arg.startsWith("--targets="));
const requestedTargets = requestedArg ? new Set(requestedArg.slice(10).split(",").filter(Boolean)) : null;

const isListTargets = process.argv.includes("--list-targets");
const isFragment = process.argv.includes("--fragment");
const isMerge = process.argv.includes("--merge");

const pkgRaw = await fs.readFile(path.join(root, "package.json"), "utf8");
const { version } = JSON.parse(pkgRaw);

const allTargets = [
  {
    id: "standalone",
    definitions,
    name: "🌻 Userscripts CF · Standalone (todos os módulos)",
    namespace: "https://rod.migos.club/userscripts-cf/standalone",
    version,
  },
  ...definitions.map((item) => ({
    id: item.id,
    definitions: [item],
    name: item.name,
    namespace: item.namespace,
    version,
  })),
  {
    id: "unified",
    definitions: definitions.filter((item) => item.unified !== false),
    name: distribution.unified?.name || "Userscripts CF · Unificado",
    namespace: distribution.unified?.namespace,
    version,
  },
];

// Modo --list-targets: saída limpa para dynamic matrix no GitHub Actions
if (isListTargets) {
  process.stdout.write(JSON.stringify(allTargets.map((t) => t.id)) + "\n");
  process.exit(0);
}

const reporter = new BuildReporter("userscripts-cf", version);
reporter.banner();

// STEP 1: Validação & Ownership
const { baseURL, targets } = await reporter.step(
  "validate configuration & react root ownership",
  async (log) => {
    const [reactRootOwnership, cleanBaseURL] = await Promise.all([
      auditReactRootOwnership(root),
      validateConfiguration(root, definitions, distribution, version),
    ]);

    log.pass("package.json & distribution URL", cleanBaseURL);
    log.pass("userscript entries validated", `${definitions.length} definitions`);
    log.pass("react root ownership", JSON.stringify(reactRootOwnership));

    if (
      requestedTargets &&
      (!requestedTargets.size || [...requestedTargets].some((id) => !allTargets.some((t) => t.id === id)))
    ) {
      throw new Error(`Invalid --targets: ${[...requestedTargets].join(",")}`);
    }

    return { baseURL: cleanBaseURL, targets: allTargets };
  },
);

// STEP 2: Análise de Grafo & Output Clean
const runtimeFeatureAudit = await reporter.step(
  "analyze runtime dependency graphs & prepare dist",
  async (log) => {
    const audit = { scripts: {}, targets: {}, bundles: {} };

    const [, analyzedScripts] = await Promise.all([
      (async () => {
        // No modo --merge, dist/ já contém os artefatos baixados da matriz
        if (!isMerge) {
          await fs.rm(out, { recursive: true, force: true });
          await fs.mkdir(path.join(out, "icons"), { recursive: true });
        }
        if (isFragment) {
          await fs.mkdir(fragmentsDir, { recursive: true });
        }
      })(),
      Promise.all(
        definitions.map(async (definition) => ({
          id: definition.id,
          graph: await analyzeRuntimeGraph(definition.entry, { root }),
        })),
      ),
    ]);

    for (const { id, graph } of analyzedScripts) {
      audit.scripts[id] = graph;
    }
    buildRuntimeAndEditorAudits(targets, audit);

    log.pass(isMerge ? "preserved merged directory" : "cleaned output directory", path.relative(root, out));
    log.pass(
      "dependency graph resolved",
      `${audit.summary.uniqueModules} unique · ${audit.summary.sharedModules} shared`,
    );

    return audit;
  },
);

// STEP 3: Compilação Paralela dos Targets (ou leitura dos fragmentos no --merge)
let manifest;
let classAudit;

if (!isMerge) {
  const stepResult = await reporter.step("compile & minify userscript targets", async (log) => {
    const activeTargets = [];
    for (const t of targets) {
      if (!requestedTargets || requestedTargets.has(t.id)) {
        activeTargets.push(t);
      } else {
        log.skip(t.id, "filtered by --targets");
      }
    }

    const catalog = definitions.map(({ id, name, matches, exclude, excludeMatches, excludes, includes }) => ({
      id,
      name,
      matches,
      exclude,
      excludeMatches,
      excludes,
      includes,
    }));

    const buildResults = await Promise.all(
      activeTargets.map((target) =>
        compileTarget(target, {
          root,
          out,
          iconSource,
          baseURL,
          version,
          catalog,
          runtimeFeatureAudit,
          log,
        }),
      ),
    );

    // Salva fragmentos individuais para serem unificados no job de merge
    if (isFragment) {
      await Promise.all(
        buildResults.map((res) => {
          const targetBundles = Object.fromEntries(
            Object.entries(runtimeFeatureAudit.bundles).filter(([key]) => key.startsWith(`${res.targetId}:`)),
          );
          return fs.writeFile(
            path.join(fragmentsDir, `${res.targetId}.json`),
            JSON.stringify({ ...res, bundles: targetBundles }, null, 2) + "\n",
          );
        }),
      );
      log.pass("fragment metadata saved", `${buildResults.length} fragment(s)`);
    }

    return {
      manifest: {
        schema: 1,
        version,
        baseURL,
        scripts: buildResults.map((r) => r.manifestEntry),
      },
      classAudit: Object.fromEntries(buildResults.map((r) => [r.targetId, r.auditEntry])),
    };
  });

  manifest = stepResult.manifest;
  classAudit = stepResult.classAudit;
} else {
  const mergedResult = await reporter.step("merge matrix build fragments", async (log) => {
    const fragmentFiles = (await fs.readdir(fragmentsDir)).filter((f) => f.endsWith(".json"));
    const fragmentsById = new Map();

    for (const file of fragmentFiles) {
      const data = JSON.parse(await fs.readFile(path.join(fragmentsDir, file), "utf8"));
      fragmentsById.set(data.targetId, data);
      Object.assign(runtimeFeatureAudit.bundles, data.bundles);
    }

    // Garante que todos os targets esperados estão presentes e preserva a ordem original
    const orderedResults = targets.map((t) => {
      const frag = fragmentsById.get(t.id);
      if (!frag) throw new Error(`Missing build fragment for target: ${t.id}`);
      return frag;
    });

    await fs.rm(fragmentsDir, { recursive: true, force: true });
    log.pass("merged fragments into unified state", `${orderedResults.length} targets`);

    return {
      manifest: {
        schema: 1,
        version,
        baseURL,
        scripts: orderedResults.map((r) => r.manifestEntry),
      },
      classAudit: Object.fromEntries(orderedResults.map((r) => [r.targetId, r.auditEntry])),
    };
  });

  manifest = mergedResult.manifest;
  classAudit = mergedResult.classAudit;
}

// No modo --fragment, para por aqui: os artefatos parciais serão reunidos no job final
if (isFragment) {
  reporter.summary({
    Mode: "fragment",
    Targets: `${manifest.scripts.length} built`,
  });
  process.exit(0);
}

// STEP 4: Auditorias Pós-Build & Relatórios JSON
await reporter.step("audit bundles, react roots & editor footprint", async (log) => {
  const editorAudit = finalizePostBuildAudits(runtimeFeatureAudit, classAudit);

  log.table(
    "React root ownership by target/world",
    Object.entries(runtimeFeatureAudit.bundles).map(([target, stats]) => ({
      target,
      roots: stats.reactRootAudit?.roots ?? "missing",
      owner: stats.reactRootAudit?.owner ?? "missing",
    })),
  );

  log.table(
    "Largest repeated dependencies (unminified rendered bytes)",
    runtimeFeatureAudit.repeatedRenderedModules
      .slice(0, 20)
      .map(({ module, bundles, aggregateRenderedBytes, maxRenderedBytes }) => ({
        module,
        consumers: bundles.length,
        aggregateRenderedBytes,
        maxRenderedBytes,
      })),
  );

  log.table(
    "Largest retained runtime modules by target/world",
    Object.entries(runtimeFeatureAudit.bundles).flatMap(([target, stats]) =>
      (stats.topModules || [])
        .slice(0, 5)
        .map(({ id, renderedBytes }) => ({ target, module: id, renderedBytes })),
    ),
  );

  log.table(
    "Editor dependency footprint (pre-minification)",
    Object.entries(editorAudit.bundles).map(([target, report]) => ({
      target,
      codemirror: report.families.codemirror.renderedBytes,
      lezer: report.families.lezer.renderedBytes,
      acorn: report.families.acorn.renderedBytes,
    })),
  );

  log.table(
    "Bundle sizes & CSS class audit",
    Object.entries(classAudit).map(([target, audit]) => ({
      target,
      bytes: audit.bytes,
      gzip: audit.gzipBytes,
      debug: audit.debugBytes,
      debugGzip: audit.debugGzipBytes,
      staticClasses: audit.staticClasses,
      dynamicReferences: audit.dynamicReferences,
    })),
  );

  await Promise.all([
    fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
    fs.writeFile(path.join(out, "editor-dependency-audit.json"), JSON.stringify(editorAudit, null, 2) + "\n"),
    fs.writeFile(
      path.join(out, "runtime-feature-audit.json"),
      JSON.stringify(runtimeFeatureAudit, null, 2) + "\n",
    ),
    fs.writeFile(path.join(out, "css-class-audit.json"), JSON.stringify(classAudit, null, 2) + "\n"),
  ]);

  log.pass("manifest.json & audit reports written", "4 JSON files");
});

// STEP 5: Auditoria de Eventos & Checksums
const checksumCount = await reporter.step("run event audit & generate SHA256SUMS", async (log) => {
  const [, checksumsContent] = await Promise.all([
    execFileAsync(process.execPath, [path.join(root, "build/audit-events.mjs")], { cwd: root }).then(
      ({ stdout, stderr }) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
      },
    ),
    generateDirectoryChecksums(out),
  ]);

  await fs.writeFile(path.join(out, "SHA256SUMS"), checksumsContent);
  const count = checksumsContent.trim().split("\n").length;
  log.pass("event audit script completed");
  log.pass("SHA256SUMS generated", `${count} files hashed`);
  return count;
});

reporter.summary({
  Targets: `${manifest.scripts.length} built`,
  Artifacts: `${checksumCount} files`,
});
