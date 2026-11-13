import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { build as viteBuild } from "vite";
import { matchURL } from "../src/core/match.js";

const HEADER = /^\/\/\s*==UserScript==\s*\r?\n([\s\S]*?)^\/\/\s*==\/UserScript==\s*$/m;
const FIELDS = new Set(["name", "namespace", "version", "description", "match", "include", "exclude", "grant", "require", "connect", "run-at", "noframes", "updateURL", "downloadURL"]);
const unique = (items) => [...new Set(items)];
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function parseManualMetadata(source, filename) {
  const found = HEADER.exec(source);
  if (!found) throw Error(`Missing userscript metadata block: ${filename}`);
  const data = {};
  for (const line of found[1].split(/\r?\n/)) {
    const entry = /^\/\/\s*@([\w-]+)(?:\s+(.*))?$/.exec(line.trim());
    if (!entry) continue;
    const key = entry[1];
    if (!FIELDS.has(key)) continue;
    (data[key] ||= []).push((entry[2] || "").trim());
  }
  for (const required of ["name", "version"]) {
    if (!data[required]?.[0]) throw Error(`Missing @${required}: ${filename}`);
  }
  if (!data.match?.length && !data.include?.length)
    throw Error(`Missing @match or @include: ${filename}`);
  for (const pattern of [...(data.match || []), ...(data.exclude || [])])
    matchURL(pattern, "https://example.com/");
  for (const key of ["require", "updateURL", "downloadURL"]) {
    for (const value of data[key] || []) {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) throw Error(`Unsafe @${key}: ${filename}`);
    }
  }
  return data;
}

export async function discoverManual(root) {
  const base = path.join(root, "userscripts", "manual");
  const items = [];
  async function visit(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT" && directory === base) return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Symlinks not allowed in manual scripts: ${filename}`);
      if (entry.isDirectory()) { await visit(filename); continue; }
      if (!entry.isFile() || !/\.(user\.js|tsx?|jsx?)$/i.test(entry.name)) continue;
      const relative = path.relative(base, filename).split(path.sep).join("/");
      const source = await fs.readFile(filename, "utf8");
      const metadata = parseManualMetadata(source, relative);
      const id = "manual-" + slug(relative.replace(/\.(user\.js|tsx?|jsx?)$/i, ""));
      items.push({ id, filename, relative, source, metadata, raw: entry.name.endsWith(".user.js") });
    }
  }
  await visit(base);
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) throw Error(`Duplicate manual script id: ${item.id}`);
    ids.add(item.id);
  }
  return items;
}

export async function compileManual(root, item) {
  if (item.raw) return item.source;
  const result = await viteBuild({
    root, configFile: false, logLevel: "error",
    build: {
      write: false, minify: false, target: "es2022",
      lib: { entry: item.filename, name: "ManualUserscript", formats: ["iife"], fileName: "manual" },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
  if (output.length !== 1 || output[0].type !== "chunk")
    throw Error(`Manual script must bundle into one JS file: ${item.relative}`);
  return item.source.match(HEADER)[0] + "\n\n" + output[0].code;
}

export function manualStandaloneMetadata(items) {
  const get = (key) => unique(items.flatMap((item) => item.metadata[key] || []));
  return {
    matches: get("match"),
    includes: get("include"),
    grants: get("grant"),
    requires: get("require"),
    connect: get("connect"),
  };
}

export function wrapManualForStandalone(item, compiled, matchFunction) {
  const body = compiled.replace(HEADER, "");
  const metadata = item.metadata;
  const rules = JSON.stringify({ matches: metadata.match || [], includes: metadata.include || [], exclude: metadata.exclude || [] });
  return `;(function(){const rules=${rules};const url=location.href;const match=${matchFunction};const included=rules.matches.some(p=>match(p,url))||rules.includes.some(p=>{const re=new RegExp("^"+p.split("*").map(s=>s.replace(/[.*+?^\${}()|[\\]\\]/g,"\\$&")).join(".*")+"$");return re.test(url)});if(!included||rules.exclude.some(p=>match(p,url)))return;\n${body}\n})();`;
}

export function checksum(value) { return createHash("sha256").update(value).digest("hex"); }
