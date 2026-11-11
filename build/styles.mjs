import fs from "node:fs";
import postcss from "postcss";
import nesting from "postcss-nesting";

const directory = new URL("../src/styles/", import.meta.url);
export function stylesPipeline() {
  return [
    {
      postcssPlugin: "rodx-shared-design-system",
      Once(root) {
        const filename = root.source?.input.file || "";
        const tokens = fs.readFileSync(new URL("tokens.css", directory), "utf8");
        const core = fs.readFileSync(new URL("core.css", directory), "utf8");
        if (!filename.endsWith("/tokens.css")) {
          root.prepend(
            postcss.parse(filename.endsWith("/core.css") ? tokens : tokens + "\n" + core, {
              from: new URL("core.css", directory).pathname,
            }).nodes,
          );
        }
      },
    },
    nesting(),
    {
      postcssPlugin: "rodx-priority",
      OnceExit(root) {
        root.walkDecls((declaration) => {
          let parent = declaration.parent;
          while (parent) {
            if (parent.type === "atrule" && /keyframes$/i.test(parent.name)) return;
            parent = parent.parent;
          }
          declaration.important = true;
        });
      },
    },
  ];
}
