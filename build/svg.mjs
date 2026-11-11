import fs from "node:fs/promises";
import { optimize } from "svgo";
export function inlineSVG() {
  return {
    name: "optimized-inline-svg",
    enforce: "pre",
    async load(id) {
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
