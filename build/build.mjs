import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "vite";
import { format } from "prettier";
import definitions from "../userscripts.config.js";
import { matchURL } from "../src/core/match.js";
import { pageBridge, install } from "./bridge.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");
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
    version: item.version,
  })),
  {
    id: "unified",
    definitions,
    name: "Userscripts CF · Unificado",
    version: "0.1.0",
  },
];
const manifest = { schema: 1, scripts: [] };
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
  manifest.scripts.push({
    id: target.id,
    file,
    matches: patterns,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
  console.log(`Built ${file} (${source.length} bytes)`);
}
await fs.writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
