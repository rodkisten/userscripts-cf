import fs from "node:fs";
import postcss from "postcss";
import nesting from "postcss-nesting";

const directory = new URL("../src/styles/", import.meta.url);
export function stylesPipeline({ scope = "module", includeBase = true } = {}) {
  return [
    {
      postcssPlugin: "rodx-shared-design-system",
      Once(root) {
        const filename = root.source?.input.file || "";
        const tokens = fs.readFileSync(new URL("tokens.css", directory), "utf8");
        const core = fs.readFileSync(new URL("core.css", directory), "utf8");
        if (includeBase && !filename.endsWith("/tokens.css")) {
          root.prepend(
            postcss.parse(filename.endsWith("/core.css") ? tokens : tokens + "\n" + core, {
              from: new URL("core.css", directory).pathname,
            }).nodes,
          );
          // External font imports must remain before the injected design tokens.
          const imports = [];
          root.walkAtRules("import", (rule) => {
            imports.push(rule);
            rule.remove();
          });
          root.prepend(imports);
        }
      },
    },
    nesting(),
    {
      postcssPlugin: "rodx-priority",
      OnceExit(root) {
        if (scope === "shadow") return;
        root.walkDecls((declaration) => {
          let parent = declaration.parent;
          while (parent) {
            // Only style rules accept !important; at-rule descriptors (e.g. @property) do not.
            if (
              parent.type === "atrule" &&
              /^(?:property|font-face|counter-style|font-palette-values|page|position-try)$|keyframes$/i.test(
                parent.name,
              )
            )
              return;
            parent = parent.parent;
          }
          declaration.important = true;
        });
      },
    },
  ];
}
