import fs from "node:fs/promises";
import path from "node:path";

export async function materializeVersionedArtifacts(dist, manifest) {
  const created = [];
  for (const script of manifest.scripts || []) {
    if (["standalone", "unified"].includes(script.id)) continue;
    const version = script.version;
    if (!/^\d+\.\d+\.\d+$/.test(version || ""))
      throw new Error(`Invalid manifest version for ${script.id}: ${version}`);
    const directory = path.join(dist, "releases", script.id, version);
    await fs.mkdir(directory, { recursive: true });
    for (const file of [script.file, script.metaFile]) {
      const source = await fs.readFile(path.join(dist, file));
      const destination = path.join(directory, path.basename(file));
      await fs.writeFile(destination, source);
      created.push(path.relative(dist, destination).split(path.sep).join("/"));
    }
  }
  return created.sort();
}
