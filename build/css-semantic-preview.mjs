import fs from "node:fs";
import path from "node:path";
import { analyzeImportGraph } from "./css-import-graph.mjs";
import { analyzeStyleOwnership } from "./css-style-ownership.mjs";
import { rewriteShadowGroup } from "./css-semantic-group.mjs";
import { validateTokenReachability } from "./css-token-reachability.mjs";
import { verifyStyleRegistration } from "./css-style-registration.mjs";

const normalize = file => file.replaceAll("\\", "/");
const isSource = name => /\.(?:css|[jt]sx?)$/.test(name);
function readSources(directory, root) {
  const sources = {};
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (isSource(entry.name)) sources[normalize(path.relative(root, absolute))] = fs.readFileSync(absolute, "utf8");
    }
  };
  walk(path.join(root, directory));
  return sources;
}
export function previewSemanticMigration(sources, groups) {
  const ast = analyzeImportGraph(sources);
  const ownership = analyzeStyleOwnership(sources);
  const diagnostics = [...ast.diagnostics, ...ownership.diagnostics];
  const previews = [];
  const visited = new Set();
  for (const group of groups) {
    const names = [...new Set(group)].sort();
    if (!names.length) continue;
    const rejected = [];
    for (const name of names) {
      if (visited.has(name)) rejected.push({ file: name, code: "overlapping-group" });
      if (!name.endsWith(".css") || !(name in sources)) rejected.push({ file: name, code: "missing-css" });
      const info = ownership.classifications[name];
      if (!info || info.status !== "shadow-candidate") rejected.push({ file: name, code: "ownership-unverified" });
    }
    if (rejected.length) {
      diagnostics.push(...rejected);
      previews.push({ files: names, status: "blocked", reasons: rejected });
      continue;
    }
    const reachability = validateTokenReachability(sources, names, ownership.classifications);
    if (!reachability.safe) {
      diagnostics.push(...reachability.diagnostics);
      previews.push({ files: names, status: "blocked", reasons: reachability.diagnostics });
      continue;
    }
    const registration = verifyStyleRegistration(sources, names, ownership.classifications);
    if (!registration.safe) {
      diagnostics.push(...registration.failures);
      previews.push({ files: names, status: "blocked", reasons: registration.failures });
      continue;
    }
    const input = Object.fromEntries(names.map(name => [name, sources[name]]));
    const result = rewriteShadowGroup(input);
    const second = rewriteShadowGroup(result.files);
    if (second.changed.length || result.diagnostics.length) {
      const reasons = [...result.diagnostics, ...(second.changed.length ? [{ code: "not-idempotent", files: second.changed }] : [])];
      diagnostics.push(...reasons);
      previews.push({ files: names, status: "blocked", reasons });
      continue;
    }
    names.forEach(name => visited.add(name));
    previews.push({ files: names, status: "preview", changed: result.changed, output: result.files });
  }
  return { previews, diagnostics, importGraph: ast.edges, ownership: ownership.classifications };
}
export function runPreview({ root = process.cwd(), directory = "src", config = "migration/css-semantic-groups.json", output = "artifacts/css-semantic-preview.json" } = {}) {
  const sources = readSources(directory, root);
  const configuration = JSON.parse(fs.readFileSync(path.join(root, config), "utf8"));
  if (!Array.isArray(configuration.groups)) throw new Error("Expected groups array");
  const report = previewSemanticMigration(sources, configuration.groups);
  const target = path.join(root, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ groups: report.previews.length, approved: report.previews.filter(x => x.status === "preview").length, blocked: report.previews.filter(x => x.status === "blocked").length }));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) runPreview();
