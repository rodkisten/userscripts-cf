import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import { transform } from "lightningcss";
import { stylesPipeline } from "./styles.mjs";
import { deduplicateCSS } from "./css-deduplicate.mjs";

/** Inline CSS Modules: userscripts cannot load a sidecar stylesheet. */
export function inlineCSSModules() {
  return {
    name: "userscripts-inline-css-modules",
    enforce: "pre",
    resolveId(source, importer) {
      if (source.endsWith(".module.css")) return path.resolve(path.dirname(importer), source) + ".js";
    },
    async load(id) {
      if (!id.endsWith(".module.css.js")) return;
      id = id.slice(0, -3);
      const processed = await postcss(stylesPipeline()).process(await fs.readFile(id, "utf8"), { from: id });
      // State flags are toggled by X integration handlers and keep public aliases.
      const stateClasses = new Set([
        "open",
        "active",
        "invalid",
        "bad",
        "block-node-bad",
        "dragging",
        "drag-over",
        "on",
        "selected",
        "sent",
        "busy",
        "error",
        "warning",
      ]);
      const parsed = postcss.parse(processed.css);
      parsed.walkRules((rule) => {
        rule.selector = rule.selector.replace(/\.([a-zA-Z_][\w-]*)/g, (match, name) =>
          stateClasses.has(name) ? `:global(${match})` : match,
        );
      });
      const result = transform({
        filename: id,
        code: Buffer.from(parsed.toString()),
        targets: { safari: 15 << 16 },
        minify: true,
        cssModules: { pattern: "rodx_[local]_[hash]" },
      });
      const classes = Object.fromEntries(
        Object.entries(result.exports || {}).map(([key, value]) => [key, value.name]),
      );
      const optimized = deduplicateCSS(result.code.toString());
      return `export const css = ${JSON.stringify(optimized.css)}; export default ${JSON.stringify(classes)};`;
    },
  };
}
