import path from "node:path";
import { build } from "vite";
import { format } from "prettier";
import { readableStrings } from "./readable-strings.mjs";

export async function bundleRuntime(root, definitions, options = {}) {
  const virtualID = "\0userscripts-cf-entry";
  const imports = definitions.map(
    (item, index) => `import module${index} from ${JSON.stringify(path.resolve(root, item.entry))};`,
  );
  const entries = definitions.map((item, index) => `{...${JSON.stringify(item)}, module: module${index}}`);
  const dockImport = options.dock ? `import { installRodDock } from ${JSON.stringify(path.join(root, "src/runtime/solid-ui/rod-dock.tsx"))};` : "";
  const entryCode = `${imports.join("\n")}\n${dockImport}
    import {createRuntime} from ${JSON.stringify(path.join(root, "src/core/runtime.js"))};
    export function boot(bridge) { const api = createRuntime([${entries.join(",")}], bridge); ${options.dock ? `const dock = installRodDock({ modules: ${JSON.stringify(definitions.map(d=>({id:d.id,name:d.name})))}, registerMenu: typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : undefined }); api.ready.then(() => { dock.setModules(${JSON.stringify(definitions.map(d=>({id:d.id,name:d.name})))}.filter(m => api.active.includes(m.id)).map(m => ({...m, actions: []}))); }); const oldDispose = api.dispose.bind(api); api.dispose = async () => { dock.dispose(); await oldDispose(); };` : ""} return api; }
  `;
  const result = await build({
    root,
    configFile: path.join(root, "vite.config.js"),
    logLevel: "warn",
    plugins: [
      {
        name: "userscripts-cf-entry",
        resolveId: (id) => (id.endsWith("userscripts-cf-entry") ? virtualID : null),
        load: (id) => (id === virtualID ? entryCode : null),
      },
    ],
    build: { write: false, lib: { entry: "userscripts-cf-entry" } },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
  const chunks = output.filter((item) => item.type === "chunk");
  if (chunks.length !== 1 || output.some((item) => item.type === "asset"))
    throw Error("Use inline/raw CSS and bundle all dependencies");
  return format(readableStrings(chunks[0].code), { parser: "babel", printWidth: 110 });
}
