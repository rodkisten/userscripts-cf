import fs from "node:fs/promises";
import path from "node:path";

export async function applyVersionPlan(root, planFile = "version-plan.json") {
  const plan = JSON.parse(await fs.readFile(path.resolve(root, planFile), "utf8"));
  const registryPath = path.join(root, "userscripts.versions.json");
  const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  let changed = false;
  for (const id of plan.affected || []) {
    const item = plan.scripts?.[id];
    if (!item || !registry.scripts?.[id]) throw new Error(`Version plan references unknown script: ${id}`);
    if (registry.scripts[id].version !== item.current)
      throw new Error(
        `Version conflict for ${id}: registry=${registry.scripts[id].version}, plan=${item.current}`,
      );
    registry.scripts[id].version = item.next;
    changed = true;
  }
  if (changed) await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return { changed, affected: plan.affected || [] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await applyVersionPlan(process.cwd(), process.argv[2] || "version-plan.json");
  console.log(
    `${result.changed ? "Updated" : "No changes"}: ${result.affected.join(", ") || "no affected userscripts"}`,
  );
}
