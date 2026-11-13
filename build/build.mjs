import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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
import { packageIcon } from "./package-icons.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
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
for (const target of targets) {
  const installers = [];
  for (const world of ["sandbox", "page"]) {
    const selected = target.definitions.filter((item) => (item.world || "page") === world);
    if (!selected.length) continue;
    const runtime = await bundleRuntime(root, selected, { dock: target.id === "standalone" && world === "sandbox" });
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
  const icon = await packageIcon({ name: target.name, category: target.tags?.[0] || target.id });
  const metadata = [
    "// ==UserScript==",
    `// @name         ${target.name}`,
    `// @namespace    ${target.namespace || "https://rod.migos.club/userscripts-cf"}`,
    `// @version      ${target.version}`,
    `// @icon         ${icon.dataURL}`,
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
  let source = `${metadata}\n\n${body}`;
  if (target.id === "standalone") {
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
        name: "standalone-runtime-entry",
        resolveId(id) {
          if (id === "virtual:standalone-runtime") return "\0virtual:standalone-runtime";
        },
        load(id) {
          if (id === "\0virtual:standalone-runtime") return body;
        },
      }],
      build: {
        write: false,
        minify: "oxc",
        sourcemap: false,
        rolldownOptions: {
          input: "virtual:standalone-runtime",
          output: { format: "iife", name: "UserscriptsCFStandalone" },
        },
      },
    });
    const output = (Array.isArray(chunks) ? chunks : [chunks]).flatMap((entry) => entry.output || []);
    const result = output.find((entry) => entry.type === "chunk");
    if (!result?.code) throw new Error("Standalone minification did not produce JavaScript");
    source = `${metadata}\n\n${result.code}\n`;
  }
  await fs.writeFile(path.join(out, file), source);
  await fs.mkdir(path.join(out, "icons"), { recursive: true });
  await fs.writeFile(path.join(out, "icons", `${target.id}.svg`), icon.svg);
  const metaFile = `${target.id}.meta.js`;
  const metaSource = metadata + "\n";
  await fs.writeFile(path.join(out, metaFile), metaSource);
  manifest.scripts.push({
    id: target.id,
    file,
    metaFile,
    metaSha256: createHash("sha256").update(metaSource).digest("hex"),
    matches: patterns,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
  console.log(`Built ${file} (${source.length} bytes)`);
}
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

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
