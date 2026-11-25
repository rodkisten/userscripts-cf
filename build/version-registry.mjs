import fs from "node:fs/promises";
import path from "node:path";

const versionPattern = /^\d+\.\d+\.\d+$/;

export async function loadVersionRegistry(root, definitions) {
  const filename = path.join(root, "userscripts.versions.json");
  const registry = JSON.parse(await fs.readFile(filename, "utf8"));
  if (registry.schemaVersion !== 1 || !registry.scripts || typeof registry.scripts !== "object") {
    throw new Error("Invalid userscripts.versions.json: expected schemaVersion 1 and scripts");
  }

  const expectedIds = new Set(definitions.map(({ id }) => id));
  const actualIds = Object.keys(registry.scripts);
  const missing = [...expectedIds].filter((id) => !actualIds.includes(id));
  const unknown = actualIds.filter((id) => !expectedIds.has(id));
  if (missing.length || unknown.length) {
    throw new Error(
      `Version registry IDs do not match userscripts.config.js (missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"})`,
    );
  }

  for (const id of expectedIds) {
    const version = registry.scripts[id]?.version;
    if (!versionPattern.test(version || "")) {
      throw new Error(`Invalid version for ${id}: expected stable x.y.z`);
    }
  }
  return registry;
}

export function versionForTarget(targetId, packageVersion, registry) {
  if (targetId === "standalone" || targetId === "unified") return packageVersion;
  return registry.scripts[targetId].version;
}

export function bundleInventory(target, registry, commit) {
  if (target.id !== "standalone") return "";
  const lines = ["// ==RodBundle==", `// @rod-commit   ${commit || "local"}`];
  for (const definition of target.definitions) {
    lines.push(`// @rod-includes ${definition.id}@${registry.scripts[definition.id].version}`);
  }
  lines.push("// ==/RodBundle==");
  return lines.join("\n");
}
