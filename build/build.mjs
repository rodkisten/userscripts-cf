// build/index.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { format } from "prettier";

import { stripBuildComments } from "./strip-comments.mjs";
import definitions from "../userscripts.config.js";
import distribution from "../distribution.config.js";
import { matchURL } from "../src/core/match.ts";
import { pageBridge, install } from "./bridge.js";
import { installSandbox } from "./contexts.js";
import { bundleRuntime } from "./bundle-runtime.mjs";
import { C, fmt } from "./format.mjs";
import { BuildReporter } from "./reporter.mjs";
import { diagnosticPrelude } from "./diagnostics.mjs";
import { analyzeRuntimeGraph } from "./runtime-graph.mjs";
import { packageIcon } from "./package-icons.mjs";
import { analyzeClassReferences } from "./class-references.mjs";
import { auditReactRootOwnership } from "./react-root-audit.mjs";

const execFileAsync = promisify(execFile);

// ============================================================================
// // @TODO: Mover para build/vitest-reporter.mjs
// ============================================================================
export const isCI = Boolean(process.env.GITHUB_ACTIONS);

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgGreen: "\x1b[42m\x1b[30m",
  bgYellow: "\x1b[43m\x1b[30m",
  bgRed: "\x1b[41m\x1b[37m",
  bgMagenta: "\x1b[45m\x1b[37m",
};

export const fmt = {
  duration: (ms) => (ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`),
  bytes: (b) => (b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} kB`),
  badge: (label, bg = C.bgCyan) => `${bg}${C.bold} ${label} ${C.reset}`,
  dim: (str) => `${C.dim}${str}${C.reset}`,
  bold: (str) => `${C.bold}${str}${C.reset}`,
  cyan: (str) => `${C.cyan}${str}${C.reset}`,
  green: (str) => `${C.green}${str}${C.reset}`,
  yellow: (str) => `${C.yellow}${str}${C.reset}`,
  red: (str) => `${C.red}${str}${C.reset}`,
};

export class BuildReporter {
  constructor(title, version) {
    this.title = title;
    this.version = version;
    this.startTime = performance.now();
    this.steps = [];
  }

  banner() {
    console.log(
      `\n ${fmt.badge("BUILD", C.bgCyan)} ${fmt.bold(this.title)} ${fmt.dim(`v${this.version}`)} ${isCI ? fmt.badge("CI", C.bgMagenta) : ""}\n`,
    );
  }

  /**
   * Executa um step isolado no estilo suite do Vitest com medição automática,
   * tratamento de erro e ::group:: no GitHub Actions.
   */
  async step(name, fn) {
    const stepIndex = this.steps.length + 1;
    const stepStart = performance.now();
    const header = `${fmt.cyan("❯")} ${fmt.bold(name)}`;

    if (isCI) {
      console.log(`::group::${header}`);
    } else {
      console.log(` ${header}`);
    }

    const ctx = {
      pass: (label, meta = "") => {
        const suffix = meta ? ` ${fmt.dim(meta)}` : "";
        console.log(`   ${fmt.green("✓")} ${label}${suffix}`);
      },
      skip: (label, reason = "") => {
        const suffix = reason ? ` ${fmt.dim(`(${reason})`)}` : "";
        console.log(`   ${fmt.yellow("↓")} ${fmt.dim(label)}${suffix}`);
      },
      info: (label, value = "") => {
        const val = value !== "" ? ` ${fmt.cyan(String(value))}` : "";
        console.log(`   ${fmt.dim("·")} ${fmt.dim(label)}${val}`);
      },
      warn: (msg) => {
        if (isCI) console.log(`::warning::${msg}`);
        else console.log(`   ${fmt.yellow("⚠")} ${fmt.yellow(msg)}`);
      },
      table: (title, rows) => {
        if (!rows.length) return;
        console.log(`\n   ${fmt.dim("┌─")} ${fmt.bold(title)}`);
        console.table(rows);
      },
    };

    try {
      const result = await fn(ctx);
      const elapsed = performance.now() - stepStart;
      this.steps.push({ index: stepIndex, name, status: "passed", elapsed });

      console.log(` ${fmt.green("✓")} ${fmt.dim(name)} ${fmt.dim(`(${fmt.duration(elapsed)})`)}\n`);
      if (isCI) console.log("::endgroup::");
      return result;
    } catch (err) {
      const elapsed = performance.now() - stepStart;
      this.steps.push({ index: stepIndex, name, status: "failed", elapsed });

      if (isCI) {
        console.error(`::error title=${name}::${err.message}`);
        console.log("::endgroup::");
      }
      console.error(
        `\n ${fmt.badge("FAIL", C.bgRed)} ${fmt.bold(name)} ${fmt.dim(`(${fmt.duration(elapsed)})`)}`,
      );
      console.error(`   ${fmt.red("×")} ${fmt.red(err.stack || err.message)}\n`);
      throw err;
    }
  }

  summary(metrics = {}) {
    const totalMs = performance.now() - this.startTime;
    const passed = this.steps.filter((s) => s.status === "passed").length;

    console.log(fmt.dim(" ─────────────────────────────────────────────────────────────"));
    console.log(
      ` ${fmt.bold("Steps")}      ${fmt.green(`${passed} passed`)} ${fmt.dim(`(${this.steps.length})`)}`,
    );
    for (const [key, val] of Object.entries(metrics)) {
      console.log(` ${fmt.bold(key.padEnd(10))} ${fmt.cyan(String(val))}`);
    }
    console.log(
      ` ${fmt.bold("Duration")}   ${fmt.bold(fmt.duration(totalMs))} ${fmt.dim(`(at ${new Date().toTimeString().slice(0, 8)})`)}\n`,
    );
  }
}

// ============================================================================
// // @TODO: Mover para build/validate-config.mjs
// ============================================================================
export async function validateConfiguration(root, defs, dist, pkgVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(pkgVersion)) {
    throw new Error("Use a stable x.y.z release version");
  }

  const cleanBaseURL = dist.baseURL.replace(/\/+$/, "");
  const parsedURL = new URL(cleanBaseURL);
  if (
    parsedURL.protocol !== "https:" ||
    parsedURL.username ||
    parsedURL.password ||
    parsedURL.search ||
    parsedURL.hash
  ) {
    throw new Error("Distribution URL must use HTTPS without credentials, query or hash");
  }

  const ids = new Set();
  const rootPrefix = root + path.sep;

  await Promise.all(
    defs.map(async (definition) => {
      if (!/^[a-z][a-z0-9-]*$/.test(definition.id) || ids.has(definition.id)) {
        throw new Error(`Invalid or duplicate userscript id: ${definition.id}`);
      }
      ids.add(definition.id);

      if (!definition.matches?.length) {
        throw new Error(`Missing URL patterns: ${definition.id}`);
      }

      const patterns = [...definition.matches, ...(definition.exclude || [])];
      for (let i = 0; i < patterns.length; i++) {
        matchURL(patterns[i], "https://example.com/");
      }

      const entry = path.resolve(root, definition.entry);
      if (!entry.startsWith(rootPrefix)) {
        throw new Error(`Entry outside project: ${definition.entry}`);
      }

      const candidates = [entry];
      if (/\.jsx?$/.test(entry)) {
        const stem = entry.replace(/\.jsx?$/, "");
        candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.jsx`);
      }

      const checks = await Promise.all(
        candidates.map(async (candidate) => {
          try {
            return (await fs.stat(candidate)).isFile();
          } catch (error) {
            if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
            throw error;
          }
        }),
      );

      if (!checks.some(Boolean)) {
        throw new Error(`Userscript entry not found: ${definition.entry}`);
      }
    }),
  );

  return cleanBaseURL;
}

// ============================================================================
// // @TODO: Mover para build/metadata-generator.mjs
// ============================================================================
export function buildUserscriptMetadata(target, baseURL, patterns, exclusions) {
  const grants = new Set(["GM_getValue", "GM_setValue", "GM_deleteValue"]);
  const requires = new Set();
  const connects = new Set();

  for (const item of target.definitions) {
    if (item.grants) for (const g of item.grants) grants.add(g);
    if (item.requires) for (const r of item.requires) requires.add(r);
    if (item.connect) for (const c of item.connect) connects.add(c);
  }

  const description =
    target.id === "standalone"
      ? "Instalador único: todos os módulos com roteamento e configuração por site."
      : "Vite IIFE; roteamento SPA e storage GM isolado por módulo.";

  const lines = [
    "// ==UserScript==",
    `// @name         ${target.name}`,
    `// @namespace    ${target.namespace || "https://rod.migos.club/userscripts-cf"}`,
    `// @version      ${target.version}`,
    `// @icon         ${baseURL}/icons/${target.id}.svg`,
    `// @updateURL    ${baseURL}/${target.id}.meta.js`,
    `// @downloadURL  ${baseURL}/${target.id}.user.js`,
    `// @description  ${description}`,
  ];

  for (const p of patterns) lines.push(`// @match        ${p}`);
  for (const e of exclusions) lines.push(`// @exclude      ${e}`);

  lines.push("// @run-at       document-start", "// @noframes");

  for (const g of grants) lines.push(`// @grant        ${g}`);
  for (const r of requires) lines.push(`// @require      ${r}`);
  for (const c of connects) lines.push(`// @connect      ${c}`);

  lines.push("// ==/UserScript==");
  return lines.join("\n");
}

// ============================================================================
// // @TODO: Mover para build/icon-resolver.mjs
// ============================================================================
export async function resolveTargetIcon(root, iconSourceDir, target, log) {
  const iconFile = path.join(iconSourceDir, `${target.id}.svg`);
  try {
    const svg = await fs.readFile(iconFile, "utf8");
    return { svg };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const iconSpec = target.definitions.length === 1 ? target.definitions[0].icon : undefined;
    const icon = await packageIcon({
      name: target.name,
      category: target.definitions[0]?.tags?.[0] || target.id,
      spec: iconSpec,
    });
    await fs.mkdir(iconSourceDir, { recursive: true });
    await fs.writeFile(iconFile, icon.svg);
    log.info("Created icon source", path.relative(root, iconFile));
    return icon;
  }
}

// ============================================================================
// // @TODO: Mover para build/target-bundler.mjs
// ============================================================================
export async function compileTarget(target, context) {
  const { root, out, iconSource, baseURL, version, catalog, runtimeFeatureAudit, log } = context;
  const targetStart = performance.now();

  const worldInstallers = await Promise.all(
    ["sandbox", "page"].map(async (world) => {
      const selected = target.definitions.filter((item) => (item.world || "page") === world);
      if (!selected.length) return null;

      const features = [...new Set(selected.flatMap(({ id }) => runtimeFeatureAudit.scripts[id].features))];
      const dynamic = selected.some(({ id }) => runtimeFeatureAudit.scripts[id].dynamic);

      const runtime = await bundleRuntime(root, selected, {
        dock: (target.id === "standalone" || target.id === "rod-dock") && world === "sandbox",
        release: { id: target.id, version: target.version, manifestURL: `${baseURL}/manifest.json` },
        catalog,
        features,
        dynamic,
        onBundleStats: (stats) => {
          runtimeFeatureAudit.bundles[`${target.id}:${world}`] = stats;
        },
      });

      if (world === "sandbox") {
        return `(${installSandbox.toString()})(function sandboxRuntime() { ${runtime}; return UserscriptsCF; }, ${JSON.stringify(target.id)});`;
      }
      return `(${install.toString()})(function pageRuntime() { ${runtime}; return UserscriptsCF; }, ${pageBridge.toString()}, ${JSON.stringify(selected.map((item) => item.id))}, ${JSON.stringify(target.id)});`;
    }),
  );

  const installers = worldInstallers.filter(Boolean);
  const patterns = [...new Set(target.definitions.flatMap((item) => item.matches))];
  const exclusions = target.definitions.length === 1 ? target.definitions[0].exclude || [] : [];

  const [icon, formattedBody] = await Promise.all([
    resolveTargetIcon(root, iconSource, target, log),
    (async () => {
      const diagnosticSource = `(${diagnosticPrelude.toString()})(${JSON.stringify(target.id)}, ${JSON.stringify(version)}, ${JSON.stringify(target.definitions.map(({ id }) => id))});`;
      const rawCode = stripBuildComments([diagnosticSource, ...installers].join("\n\n"));
      return format(rawCode, { parser: "babel", printWidth: 110 });
    })(),
  ]);

  const metadata = buildUserscriptMetadata(target, baseURL, patterns, exclusions);
  const debugFile = `${target.id}.js`;
  const normalizedBody = formattedBody.endsWith("\n") ? formattedBody : `${formattedBody}\n`;

  // TODO(SOURCEMAP): REIMPLEMENT STANDALONE SOURCE MAPS.
  const chunks = await viteBuild({
    configFile: false,
    logLevel: "error",
    plugins: [
      {
        name: "userscript-runtime-minify",
        resolveId(id) {
          if (id === "virtual:userscript-runtime") return "\0virtual:userscript-runtime";
        },
        load(id) {
          if (id === "\0virtual:userscript-runtime") return formattedBody;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      rolldownOptions: {
        input: "virtual:userscript-runtime",
        output: { format: "iife", name: "UserscriptsCFBundle" },
      },
    },
  });

  const output = (Array.isArray(chunks) ? chunks : [chunks]).flatMap((entry) => entry.output || []);
  const result = output.find((entry) => entry.type === "chunk");
  if (!result?.code) {
    throw new Error(`Minification did not produce JavaScript for ${target.id}`);
  }

  const finalSource = `${metadata}\n\n${result.code}\n`;
  const metaSource = `${metadata}\n`;

  const bodyBuffer = Buffer.from(formattedBody, "utf8");
  const sourceBuffer = Buffer.from(finalSource, "utf8");
  const metaBuffer = Buffer.from(metaSource, "utf8");

  const references = analyzeClassReferences(finalSource.slice(metadata.length));
  const auditEntry = {
    debugBytes: bodyBuffer.byteLength,
    debugGzipBytes: gzipSync(bodyBuffer, { level: 9 }).byteLength,
    staticClasses: references.classes.length,
    dynamicReferences: references.dynamic.length,
    dynamicMethods: [...new Set(references.dynamic)].sort(),
    bytes: sourceBuffer.byteLength,
    gzipBytes: gzipSync(sourceBuffer, { level: 9 }).byteLength,
  };

  const file = `${target.id}.user.js`;
  const metaFile = `${target.id}.meta.js`;

  await Promise.all([
    fs.writeFile(path.join(out, debugFile), normalizedBody),
    fs.writeFile(path.join(out, file), sourceBuffer),
    fs.writeFile(path.join(out, "icons", `${target.id}.svg`), icon.svg),
    fs.writeFile(path.join(out, metaFile), metaBuffer),
  ]);

  const sha256 = createHash("sha256").update(sourceBuffer).digest("hex");
  const metaSha256 = createHash("sha256").update(metaBuffer).digest("hex");
  const elapsed = performance.now() - targetStart;

  log.pass(
    file,
    `${fmt.bytes(sourceBuffer.byteLength)} · gzip ${fmt.bytes(auditEntry.gzipBytes)} · ${fmt.duration(elapsed)}`,
  );

  return {
    targetId: target.id,
    auditEntry,
    manifestEntry: {
      id: target.id,
      name: target.name,
      description:
        target.id === "standalone"
          ? "Todos os módulos em uma instalação"
          : "Userscript independente com atualizações automáticas",
      file,
      debugFile,
      metaFile,
      metaSha256,
      matches: patterns,
      sha256,
    },
  };
}

// ============================================================================
// // @TODO: Mover para build/audit-reporters.mjs
// ============================================================================
export function buildRuntimeAndEditorAudits(targets, runtimeFeatureAudit) {
  const moduleConsumers = new Map();

  for (const [scriptId, analysis] of Object.entries(runtimeFeatureAudit.scripts)) {
    for (const module of analysis.modules) {
      let item = moduleConsumers.get(module.file);
      if (!item) {
        item = { file: module.file, sourceBytes: module.sourceBytes, scripts: [] };
        moduleConsumers.set(module.file, item);
      }
      item.scripts.push(scriptId);
    }
  }

  runtimeFeatureAudit.sharedModules = [...moduleConsumers.values()]
    .filter((m) => m.scripts.length > 1)
    .map((m) => ({
      ...m,
      scripts: m.scripts.sort(),
      aggregateSourceBytes: m.sourceBytes * m.scripts.length,
    }))
    .sort((a, b) => b.aggregateSourceBytes - a.aggregateSourceBytes || a.file.localeCompare(b.file));

  runtimeFeatureAudit.summary = {
    uniqueModules: moduleConsumers.size,
    sharedModules: runtimeFeatureAudit.sharedModules.length,
    sharedSourceBytesAcrossScripts: runtimeFeatureAudit.sharedModules.reduce(
      (sum, m) => sum + m.aggregateSourceBytes,
      0,
    ),
  };

  for (const target of targets) {
    const scripts = target.definitions.map(({ id }) => runtimeFeatureAudit.scripts[id]);
    const features = [...new Set(scripts.flatMap((s) => s.features))].sort();
    runtimeFeatureAudit.targets[target.id] = {
      scripts: target.definitions.map(({ id }) => id),
      features,
      dynamic: scripts.some((s) => s.dynamic),
      dynamicFiles: [...new Set(scripts.flatMap((s) => s.dynamicFiles))].sort(),
      treeShaken: !scripts.some((s) => s.dynamic) && target.id !== "standalone",
    };
  }
}

export function finalizePostBuildAudits(runtimeFeatureAudit, classAudit) {
  for (const [target, measurements] of Object.entries(classAudit)) {
    const prefix = `${target}:`;
    const runtime = Object.entries(runtimeFeatureAudit.bundles)
      .filter(([key]) => key.startsWith(prefix))
      .map(([world, stats]) => ({ world: world.slice(prefix.length), ...stats }));

    runtimeFeatureAudit.targets[target].output = {
      bytes: measurements.bytes,
      gzipBytes: measurements.gzipBytes,
      debugBytes: measurements.debugBytes,
      debugGzipBytes: measurements.debugGzipBytes,
      runtimes: runtime.map(
        ({ world, bytes, includedModuleCount, topModules, featureDefines, reactRootAudit }) => ({
          world,
          bytes,
          includedModuleCount,
          reactRootAudit,
          topModules,
          featureDefines,
        }),
      ),
    };
  }

  const bundleEntries = Object.entries(runtimeFeatureAudit.bundles);
  const invalidRoot = bundleEntries.some(
    ([, stats]) =>
      stats.reactRootAudit?.roots !== 1 || stats.reactRootAudit?.owner !== "src/core/runtime-react.tsx",
  );
  if (invalidRoot) {
    throw new Error("[React root ownership] Missing or invalid per-world root audit report");
  }

  const retainedConsumers = new Map();
  for (const [bundle, stats] of bundleEntries) {
    for (const module of stats.modules) {
      if (module.renderedBytes <= 0) continue;
      let current = retainedConsumers.get(module.id);
      if (!current) {
        current = {
          module: module.id,
          bundles: [],
          aggregateRenderedBytes: 0,
          maxRenderedBytes: 0,
        };
        retainedConsumers.set(module.id, current);
      }
      current.bundles.push({ bundle, renderedBytes: module.renderedBytes });
      current.aggregateRenderedBytes += module.renderedBytes;
      if (module.renderedBytes > current.maxRenderedBytes) {
        current.maxRenderedBytes = module.renderedBytes;
      }
    }
  }

  runtimeFeatureAudit.repeatedRenderedModules = [...retainedConsumers.values()]
    .filter((entry) => entry.bundles.length > 1)
    .sort((a, b) => b.aggregateRenderedBytes - a.aggregateRenderedBytes || a.module.localeCompare(b.module));

  runtimeFeatureAudit.summary.repeatedRenderedModules = runtimeFeatureAudit.repeatedRenderedModules.length;

  const editorFamilies = [
    ["codemirror", (id) => id.includes("/node_modules/@codemirror/")],
    ["lezer", (id) => id.includes("/node_modules/@lezer/")],
    ["acorn", (id) => id.includes("/node_modules/acorn/")],
  ];

  return {
    schema: 1,
    note: "renderedBytes are pre-minification Rolldown contributions, not gzip or estimated download savings",
    bundles: Object.fromEntries(
      bundleEntries.map(([target, stats]) => {
        const families = Object.fromEntries(
          editorFamilies.map(([family, pattern]) => {
            const modules = stats.modules.filter((item) => item.renderedBytes > 0 && pattern(item.id));
            return [
              family,
              {
                renderedBytes: modules.reduce((total, item) => total + item.renderedBytes, 0),
                modules: modules.map(({ id, renderedBytes }) => ({ id, renderedBytes })),
              },
            ];
          }),
        );
        return [
          target,
          {
            families,
            totalEditorRenderedBytes: Object.values(families).reduce(
              (total, item) => total + item.renderedBytes,
              0,
            ),
          },
        ];
      }),
    ),
  };
}

// ============================================================================
// // @TODO: Mover para build/checksums.mjs
// ============================================================================
export async function generateDirectoryChecksums(directory) {
  async function collectFiles(dir, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const tasks = entries.map(async (entry) => {
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(absolute, relative);
      if (entry.isFile()) {
        const content = await fs.readFile(absolute);
        const hash = createHash("sha256").update(content).digest("hex");
        return [{ relative, line: `${hash}  ${relative}` }];
      }
      return [];
    });
    return (await Promise.all(tasks)).flat();
  }

  const results = await collectFiles(directory);
  results.sort((a, b) => a.relative.localeCompare(b.relative));
  return results.map((r) => r.line).join("\n") + "\n";
}

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
