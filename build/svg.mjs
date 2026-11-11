import fs from "node:fs/promises";
import path from "node:path";
import { optimize } from "svgo";
export function inlineSVG() {
  return {
    name: "optimized-inline-svg",
    enforce: "pre",
    resolveId(source, importer) {
      if (source.endsWith(".svg?component"))
        return path.resolve(path.dirname(importer), source.replace("?component", ".tsx"));
    },
    async load(id) {
      if (id.endsWith(".svg.tsx")) {
        const { data } = optimize(await fs.readFile(id.slice(0, -4), "utf8"), {
          multipass: true,
          plugins: ["preset-default"],
        });
        return `export default function Icon() { return (${data}); }`;
      }
      if (!id.endsWith(".svg?inline")) return null;
      const filename = id.slice(0, -"?inline".length);
      const { data } = optimize(await fs.readFile(filename, "utf8"), {
        path: filename,
        multipass: true,
        plugins: ["preset-default"],
      });
      return { code: `export default ${JSON.stringify(data)};`, map: null };
    },
  };
}
