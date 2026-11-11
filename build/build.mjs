import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "vite";
import { format } from "prettier";
import definitions from "../userscripts.config.js";
import distribution from "../distribution.config.js";
import { matchURL } from "../src/core/match.js";
import { pageBridge, install } from "./bridge.js";

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
  ...definitions.map((item) => ({
    id: item.id,
    definitions: [item],
    name: item.name,
    version,
  })),
  {
    id: "unified",
    definitions,
    name: "Userscripts CF · Unificado",
    version,
  },
];
const manifest = { schema: 1, version, baseURL, scripts: [] };
for (const target of targets) {
  const virtualID = "\0userscripts-cf-entry";
  const imports = target.definitions.map(
    (item, index) => `import module${index} from ${JSON.stringify(path.resolve(root, item.entry))};`,
  );
  const entries = target.definitions.map(
    (item, index) => `{...${JSON.stringify(item)}, module: module${index}}`,
  );
  const entryCode = `${imports.join("\n")}
    import {createRuntime} from ${JSON.stringify(path.join(root, "src/core/runtime.js"))};
    export function boot(bridge) { return createRuntime([${entries.join(",")}], bridge); }
  `;
  const result = await build({
    root,
    configFile: path.join(root, "vite.config.js"),
    logLevel: "warn",
    plugins: [
      {
        name: "userscripts-cf-entry",
        resolveId: (id) => (id.endsWith("userscripts-cf-entry") ? virtualID : null),
        load: (id) => (id === virtualID ? entryCode : null),
      },
    ],
    build: { write: false, lib: { entry: "userscripts-cf-entry" } },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  const chunks = output.filter((item) => item.type === "chunk");
  if (chunks.length !== 1 || output.some((item) => item.type === "asset"))
    throw Error("Use CSS ?inline and bundle all dependencies");
  const runtime = await format(chunks[0].code, {
    parser: "babel",
    printWidth: 110,
  });
  const patterns = [...new Set(target.definitions.flatMap((item) => item.matches))];
  const metadata = [
    "// ==UserScript==",
    `// @name         ${target.name}`,
    "// @namespace    https://rod.migos.club/userscripts-cf",
    `// @version      ${target.version}`,
    `// @updateURL    ${baseURL}/${target.id}.meta.js`,
    `// @downloadURL  ${baseURL}/${target.id}.user.js`,
    "// @description  Vite IIFE; roteamento SPA e storage GM isolado por módulo.",
    ...patterns.map((pattern) => `// @match        ${pattern}`),
    "// @run-at       document-start",
    "// @noframes",
    "// @grant        GM_getValue",
    "// @grant        GM_setValue",
    "// @grant        GM_deleteValue",
    "// ==/UserScript==",
  ].join("\n");
  const body = await format(
    `(${install.toString()})(function pageRuntime() { ${runtime}; return UserscriptsCF; }, ${pageBridge.toString()}, ${JSON.stringify(target.definitions.map((item) => item.id))}, ${JSON.stringify(target.id)});`,
    { parser: "babel", printWidth: 110 },
  );
  const file = `${target.id}.user.js`;
  const source = `${metadata}\n\n${body}`;
  await fs.writeFile(path.join(out, file), source);
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

const sums = [];
for (const file of (await fs.readdir(out)).sort()) {
  const code = await fs.readFile(path.join(out, file));
  sums.push(`${createHash("sha256").update(code).digest("hex")}  ${file}`);
}
await fs.writeFile(path.join(out, "SHA256SUMS"), sums.join("\n") + "\n");
