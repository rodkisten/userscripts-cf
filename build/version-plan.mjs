import fs from "node:fs/promises";
import path from "node:path";
import definitions from "../userscripts.config.js";
import { analyzeRuntimeGraph } from "./runtime-graph.mjs";
import { loadVersionRegistry } from "./version-registry.mjs";

const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const normalizeFiles = (files = []) =>
  [...new Set(files.map((file) => String(file).replaceAll("\\", "/").replace(/^\.\//, "")))]
    .filter(Boolean)
    .sort();

export function bumpVersion(version, level = "patch") {
  const match = semverPattern.exec(version);
  if (!match) throw new Error(`Invalid stable version: ${version}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unsupported bump level: ${level}`);
}

export function createVersionPlan({
  definitions: defs = definitions,
  registry,
  graphs,
  changedFiles = [],
  bumps = {},
}) {
  const normalizedChanges = normalizeFiles(changedFiles);
  const sourceChanges = normalizedChanges.filter((file) => !/^(?:docs|dist|\.github)\//.test(file));
  const allForProjectChange = sourceChanges.some((file) =>
    /^(?:userscripts\.config\.js|distribution\.config\.js|package\.json|package-lock\.json)$/.test(file),
  );
  const scripts = {};
  for (const definition of defs) {
    const graph = graphs[definition.id];
    if (!graph) throw new Error(`Missing runtime graph for ${definition.id}`);
    const graphFiles = new Set(normalizeFiles(graph.files));
    const directChanges = allForProjectChange
      ? sourceChanges
      : sourceChanges.filter((file) => graphFiles.has(file));
    const current = registry.scripts[definition.id].version;
    const bump = directChanges.length ? bumps[definition.id] || bumps.all || "patch" : null;
    scripts[definition.id] = {
      id: definition.id,
      current,
      next: bump ? bumpVersion(current, bump) : current,
      bump,
      changedFiles: directChanges,
      modules: graphFiles.size,
    };
  }
  return {
    schemaVersion: 1,
    source: "ast-runtime-graph",
    changedFiles: normalizedChanges,
    scripts,
    affected: Object.values(scripts)
      .filter(({ bump }) => bump)
      .map(({ id }) => id),
  };
}

export async function analyzeVersionPlan({ root = process.cwd(), changedFiles, bumps = {} } = {}) {
  const rootPath = path.resolve(root);
  const registry = await loadVersionRegistry(rootPath, definitions);
  const graphs = Object.fromEntries(
    await Promise.all(
      definitions.map(async (definition) => [
        definition.id,
        await analyzeRuntimeGraph(definition.entry, { root: rootPath }),
      ]),
    ),
  );
  return createVersionPlan({ definitions, registry, graphs, changedFiles, bumps });
}

export async function readChangedFiles(root = process.cwd(), from = "") {
  if (!from) return [];
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", ["diff", "--name-only", `${from}...HEAD`], {
    cwd: root,
  });
  return normalizeFiles(stdout.split("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const from = process.argv.find((arg) => arg.startsWith("--from="))?.slice(7) || "";
  const files = process.argv.find((arg) => arg.startsWith("--files="))?.slice(8);
  const plan = await analyzeVersionPlan({
    root,
    changedFiles: files ? normalizeFiles(files.split(",")) : await readChangedFiles(root, from),
  });
  await fs.writeFile(path.join(root, "version-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify(plan, null, 2));
}
