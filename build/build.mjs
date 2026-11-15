import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { format } from "prettier";
import { build as viteBuild } from "vite";
import { execFileSync } from "node:child_process";
import { stripBuildComments } from "./strip-comments.mjs";
import definitions from "../userscripts.config.js";
import distribution from "../distribution.config.js";
import { matchURL } from "../src/core/match.js";
import { pageBridge, install } from "./bridge.js";
import { installSandbox } from "./contexts.js";
import { bundleRuntime } from "./bundle-runtime.mjs";
import { analyzeRuntimeGraph } from "./runtime-graph.mjs";
import { packageIcon } from "./package-icons.mjs";
import { analyzeClassReferences } from "./class-references.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
const iconSource = path.join(root, "assets", "icons");
const { version } = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Use a stable x.y.z release version");
const baseURL = distribution.baseURL.replace(/\/+$/, "");
const parsedURL = new URL(baseURL);
if (
  parsedURL.protocol !== "https:" ||
  parsedURL.username ||
  parsedURL.password ||
  parsedURL.search ||
  parsedURL.hash
) {
  throw Error("Distribution URL must use HTTPS without credentials, query or hash");
}
const ids = new Set();
for (const definition of definitions) {
  if (!/^[a-z][a-z0-9-]*$/.test(definition.id) || ids.has(definition.id))
    throw Error("Invalid or duplicate userscript id");
  ids.add(definition.id);
  if (!definition.matches?.length) throw Error(`Missing URL patterns: ${definition.id}`);
  for (const pattern of [...definition.matches, ...(definition.exclude || [])])
    matchURL(pattern, "https://example.com/");
  const entry = path.resolve(root, definition.entry);
  if (!entry.startsWith(root + path.sep)) throw Error("Entry outside project");
  await fs.access(entry);
}
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
const targets = [
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
const manifest = { schema: 1, version, baseURL, scripts: [] };
const classAudit = {};
const runtimeFeatureAudit = { scripts: {}, targets: {}, bundles: {} };
for (const definition of definitions) {
  runtimeFeatureAudit.scripts[definition.id] = await analyzeRuntimeGraph(definition.entry, { root });
}
// Shared source modules help identify repeated dependencies across independently
// installed scripts. These are source bytes, not attributable output bundle bytes.
const moduleConsumers = new Map();
for (const [scriptId, analysis] of Object.entries(runtimeFeatureAudit.scripts)) {
  for (const module of analysis.modules) {
    const item = moduleConsumers.get(module.file) || { file: module.file, sourceBytes: module.sourceBytes, scripts: [] };
    item.scripts.push(scriptId);
    moduleConsumers.set(module.file, item);
  }
}
runtimeFeatureAudit.sharedModules = [...moduleConsumers.values()]
  .filter((module) => module.scripts.length > 1)
  .map((module) => ({ ...module, scripts: module.scripts.sort(), aggregateSourceBytes: module.sourceBytes * module.scripts.length }))
  .sort((a, b) => b.aggregateSourceBytes - a.aggregateSourceBytes || a.file.localeCompare(b.file));
runtimeFeatureAudit.summary = {
  uniqueModules: moduleConsumers.size,
  sharedModules: runtimeFeatureAudit.sharedModules.length,
  sharedSourceBytesAcrossScripts: runtimeFeatureAudit.sharedModules.reduce((sum, module) => sum + module.aggregateSourceBytes, 0),
};
for (const target of targets) {
  const scripts = target.definitions.map(({ id }) => runtimeFeatureAudit.scripts[id]);
  const features = [...new Set(scripts.flatMap((script) => script.features))].sort();
  runtimeFeatureAudit.targets[target.id] = {
    scripts: target.definitions.map(({ id }) => id),
    features,
    dynamic: scripts.some((script) => script.dynamic),
    dynamicFiles: [...new Set(scripts.flatMap((script) => script.dynamicFiles))].sort(),
    // This is an audit, not a claim that the current legacy runtime is tree-shaken.
    treeShaken: !scripts.some((script) => script.dynamic) && target.id !== "standalone",
  };
}
for (const target of targets) {
  const installers = [];
  for (const world of ["sandbox", "page"]) {
    const selected = target.definitions.filter((item) => (item.world || "page") === world);
    if (!selected.length) continue;
    const runtime = await bundleRuntime(root, selected, { dock: target.id === "standalone" && world === "sandbox", catalog: definitions.map(({ id, name, matches, exclude, excludeMatches, excludes, includes }) => ({ id, name, matches, exclude, excludeMatches, excludes, includes })), features: [...new Set(selected.flatMap(({ id }) => runtimeFeatureAudit.scripts[id].features))], dynamic: selected.some(({ id }) => runtimeFeatureAudit.scripts[id].dynamic), onBundleStats: (stats) => { runtimeFeatureAudit.bundles[`${target.id}:${world}`] = stats; } });
    if (world === "sandbox") {
      installers.push(
        `(${installSandbox.toString()})(function sandboxRuntime() { ${runtime}; return UserscriptsCF; }, ${JSON.stringify(target.id)});`,
      );
    } else {
      installers.push(
        `(${install.toString()})(function pageRuntime() { ${runtime}; return UserscriptsCF; }, ${pageBridge.toString()}, ${JSON.stringify(selected.map((item) => item.id))}, ${JSON.stringify(target.id)});`,
      );
    }
  }
  const patterns = [...new Set(target.definitions.flatMap((item) => item.matches))];
  // Per-module excludes must remain in the runtime router: a global @exclude
  // would disable other modules on the same URL (e.g. REPL and example-site).
  const exclusions = target.definitions.length === 1 ? target.definitions[0].exclude || [] : [];
  const iconFile = path.join(iconSource, target.id + ".svg");
  const iconSpec = target.definitions.length === 1 ? target.definitions[0].icon : undefined;
  let icon;
  try {
    const svg = await fs.readFile(iconFile, "utf8");
    icon = { svg };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    icon = await packageIcon({ name: target.name, category: target.definitions[0]?.tags?.[0] || target.id, spec: iconSpec });
    await fs.mkdir(iconSource, { recursive: true });
    await fs.writeFile(iconFile, icon.svg);
    console.log("Created icon source: " + path.relative(root, iconFile));
  }
  const metadata = [
    "// ==UserScript==",
    `// @name         ${target.name}`,
    `// @namespace    ${target.namespace || "https://rod.migos.club/userscripts-cf"}`,
    `// @version      ${target.version}`,
    `// @icon         ${baseURL}/icons/${target.id}.svg`,
    `// @updateURL    ${baseURL}/${target.id}.meta.js`,
    `// @downloadURL  ${baseURL}/${target.id}.user.js`,
    `// @description  ${target.id === "standalone" ? "Instalador único: todos os módulos com roteamento e configuração por site." : "Vite IIFE; roteamento SPA e storage GM isolado por módulo."}`,
    ...patterns.map((pattern) => `// @match        ${pattern}`),
    ...exclusions.map((pattern) => `// @exclude      ${pattern}`),
    "// @run-at       document-start",
    "// @noframes",
    ...[
      ...new Set([
        "GM_getValue",
        "GM_setValue",
        "GM_deleteValue",
        ...target.definitions.flatMap((item) => item.grants || []),
      ]),
    ].map((grant) => `// @grant        ${grant}`),
    ...[...new Set(target.definitions.flatMap((item) => item.requires || []))].map(
      (url) => `// @require      ${url}`,
    ),
    ...[...new Set(target.definitions.flatMap((item) => item.connect || []))].map(
      (host) => `// @connect      ${host}`,
    ),
    "// ==/UserScript==",
  ].join("\n");
  const body = await format(stripBuildComments(installers.join("\n\n")), {
    parser: "babel",
    printWidth: 110,
  });
  const file = `${target.id}.user.js`;
  // Inspectable JavaScript without Tampermonkey metadata or minification.
  // Preserve the readable, formatted runtime before standalone Oxc minification.
  const debugFile = `${target.id}.js`;
  await fs.writeFile(path.join(out, debugFile), body.endsWith("\n") ? body : body + "\n");
  let source = `${metadata}\n\n${body}`;
  {
    // TODO(SOURCEMAP): REIMPLEMENT STANDALONE SOURCE MAPS.
    //
    // BLOCKED: Vite 8/Rolldown emitted JavaScript but no external sourcemap
    // with build.sourcemap=true, and no inline data URL with
    // build.sourcemap="inline". Do not restore either implementation without
    // an automated integration test that validates the emitted map, its
    // sourcesContent and its correspondence to the published userscript.
    //
    // REQUIREMENTS:
    // 1. Preserve the exact Tampermonkey metadata header.
    // 2. Minify the generated runtime with Oxc.
    // 3. Emit standalone.user.js.map with valid source mappings.
    // 4. Reference the map only when it actually exists.
    // 5. Cover the complete build with a regression test in CI.
    //
    // TEMPORARY: Ship minified standalone JavaScript without a sourcemap.
    const chunks = await viteBuild({
      configFile: false,
      logLevel: "error",
      plugins: [{
        name: "userscript-runtime-minify",
        resolveId(id) {
          if (id === "virtual:userscript-runtime") return "\0virtual:userscript-runtime";
        },
        load(id) {
          if (id === "\0virtual:userscript-runtime") return body;
        },
      }],
      build: {
        write: false,
        minify: "oxc",
        sourcemap: false,
        rolldownOptions: {
          input: "virtual:userscript-runtime",
          output: { format: "iife", name: "UserscriptsCFBundle" },
        },
      },
    });
    const output = (Array.isArray(chunks) ? chunks : [chunks]).flatMap((entry) => entry.output || []);
    const result = output.find((entry) => entry.type === "chunk");
    if (!result?.code) throw new Error(`Minification did not produce JavaScript for ${target.id}`);
    source = `${metadata}\n\n${result.code}\n`;
  }
  // Audit the emitted JS, including delegated event handlers, without changing
  // behavioral class identities. A dynamic selector blocks unsafe renaming.
  const references = analyzeClassReferences(source.slice(metadata.length));
  classAudit[target.id] = {
    debugBytes: Buffer.byteLength(body),
    debugGzipBytes: gzipSync(Buffer.from(body), { level: 9 }).byteLength,
    staticClasses: references.classes.length,
    dynamicReferences: references.dynamic.length,
    dynamicMethods: [...new Set(references.dynamic)].sort(),
    bytes: Buffer.byteLength(source),
    gzipBytes: gzipSync(Buffer.from(source), { level: 9 }).byteLength,
  };
  await fs.writeFile(path.join(out, file), source);
  await fs.mkdir(path.join(out, "icons"), { recursive: true });
  await fs.writeFile(path.join(out, "icons", `${target.id}.svg`), icon.svg);
  const metaFile = `${target.id}.meta.js`;
  const metaSource = metadata + "\n";
  await fs.writeFile(path.join(out, metaFile), metaSource);
  manifest.scripts.push({
    id: target.id,
    name: target.name,
    description: target.id === "standalone" ? "Todos os módulos em uma instalação" : "Userscript independente com atualizações automáticas",
    file,
    debugFile,
    metaFile,
    metaSha256: createHash("sha256").update(metaSource).digest("hex"),
    matches: patterns,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
  console.log(`Built ${file} (${source.length} bytes)`);
}
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
// Include emitted bytes, gzip and the largest retained modules in the audit.
for (const [target, measurements] of Object.entries(classAudit)) {
  const runtime = Object.entries(runtimeFeatureAudit.bundles)
    .filter(([key]) => key.startsWith(target + ":"))
    .map(([world, stats]) => ({ world: world.slice(target.length + 1), ...stats }));
  runtimeFeatureAudit.targets[target].output = {
    bytes: measurements.bytes,
    gzipBytes: measurements.gzipBytes,
    debugBytes: measurements.debugBytes,
    debugGzipBytes: measurements.debugGzipBytes,
    runtimes: runtime.map(({ world, bytes, includedModuleCount, topModules, featureDefines }) => ({ world, bytes, includedModuleCount, topModules, featureDefines })),
  };
}
const topRuntimeModules = Object.entries(runtimeFeatureAudit.bundles).flatMap(([target, stats]) =>
  (stats.topModules || []).slice(0, 5).map(({ id, renderedBytes }) => ({ target, module: id, renderedBytes }))
);
// Rank dependencies by their aggregate rendered contribution across targets.
// The aggregate is diagnostic: separately installed userscripts are not loaded
// simultaneously, and this number must never be presented as download savings.
const retainedConsumers = new Map();
for (const [bundle, stats] of Object.entries(runtimeFeatureAudit.bundles)) {
  for (const module of stats.modules) {
    if (module.renderedBytes <= 0) continue;
    const current = retainedConsumers.get(module.id) || { module: module.id, bundles: [], aggregateRenderedBytes: 0, maxRenderedBytes: 0 };
    current.bundles.push({ bundle, renderedBytes: module.renderedBytes });
    current.aggregateRenderedBytes += module.renderedBytes;
    current.maxRenderedBytes = Math.max(current.maxRenderedBytes, module.renderedBytes);
    retainedConsumers.set(module.id, current);
  }
}
runtimeFeatureAudit.repeatedRenderedModules = [...retainedConsumers.values()]
  .filter((entry) => entry.bundles.length > 1)
  .sort((a, b) => b.aggregateRenderedBytes - a.aggregateRenderedBytes || a.module.localeCompare(b.module));
runtimeFeatureAudit.summary.repeatedRenderedModules = runtimeFeatureAudit.repeatedRenderedModules.length;
console.log("\\nLargest repeated dependencies (unminified rendered bytes, NOT estimated savings):");
console.table(runtimeFeatureAudit.repeatedRenderedModules.slice(0, 20).map(({ module, bundles, aggregateRenderedBytes, maxRenderedBytes }) => ({
  module, consumers: bundles.length, aggregateRenderedBytes, maxRenderedBytes,
})));
console.log("\\nLargest retained runtime modules by target/world:");
console.table(topRuntimeModules);
// Editor dependency audit: attribute CodeMirror, Lezer and Acorn to the
// actual rendered module graph, not package.json declarations. A module may
// appear in multiple independently installable bundles, so keep worlds apart.
const editorFamilies = [
  ["codemirror", /(?:^|\\/)node_modules\\/@codemirror\\//],
  ["lezer", /(?:^|\\/)node_modules\\/@lezer\\//],
  ["acorn", /(?:^|\\/)node_modules\\/acorn\\//],
];
const editorAudit = {
  schema: 1,
  note: "renderedBytes are pre-minification Rolldown contributions, not gzip or estimated download savings",
  bundles: Object.fromEntries(Object.entries(runtimeFeatureAudit.bundles).map(([target, stats]) => {
    const families = Object.fromEntries(editorFamilies.map(([family, pattern]) => {
      const modules = stats.modules.filter((item) => item.renderedBytes > 0 && pattern.test(item.id));
      return [family, {
        renderedBytes: modules.reduce((total, item) => total + item.renderedBytes, 0),
        modules: modules.map(({ id, renderedBytes }) => ({ id, renderedBytes })),
      }];
    }));
    return [target, { families, totalEditorRenderedBytes: Object.values(families).reduce((total, item) => total + item.renderedBytes, 0) }];
  })),
};
await fs.writeFile(path.join(out, "editor-dependency-audit.json"), JSON.stringify(editorAudit, null, 2) + "\\n");
console.log("\\nEditor dependency footprint by target/world (pre-minification):");
console.table(Object.entries(editorAudit.bundles).map(([target, report]) => ({
  target, codemirror: report.families.codemirror.renderedBytes,
  lezer: report.families.lezer.renderedBytes,
  acorn: report.families.acorn.renderedBytes,
})));
await fs.writeFile(path.join(out, "runtime-feature-audit.json"), JSON.stringify(runtimeFeatureAudit, null, 2) + "\n");
await fs.writeFile(path.join(out, "css-class-audit.json"), JSON.stringify(classAudit, null, 2) + "\n");
console.table(Object.entries(classAudit).map(([target, audit]) => ({
  target,
  bytes: audit.bytes,
  gzip: audit.gzipBytes,
  debug: audit.debugBytes,
  debugGzip: audit.debugGzipBytes,
  staticClasses: audit.staticClasses,
  dynamicReferences: audit.dynamicReferences,
})));

execFileSync(process.execPath, [path.join(root, "build/audit-events.mjs")], { cwd: root, stdio: "inherit" });
const sums = [];
async function checksumFiles(directory, prefix = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await checksumFiles(absolute, relative);
    } else if (entry.isFile()) {
      const code = await fs.readFile(absolute);
      sums.push(`${createHash("sha256").update(code).digest("hex")}  ${relative}`);
    }
  }
}
await checksumFiles(out);
await fs.writeFile(path.join(out, "SHA256SUMS"), sums.join("\n") + "\n");
