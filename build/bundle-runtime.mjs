import path from "node:path";
import { build } from "vite";
import { format } from "prettier";
import { readableStrings } from "./readable-strings.mjs";
import { instrumentErrorsPlugin } from "./instrument-errors.mjs";

export async function bundleRuntime(root, definitions, options = {}) {
  const virtualID = "\0userscripts-cf-entry";
  const imports = definitions.map(
    (item, index) => `import module${index} from ${JSON.stringify(path.resolve(root, item.entry))};`,
  );
  const entries = definitions.map((item, index) => `{...${JSON.stringify(item)}, module: module${index}}`);
  const dockImport = options.dock
    ? `import { installRodDock } from ${JSON.stringify(path.join(root, "src/runtime/solid-ui/rod-dock.tsx"))};`
    : "";
  const dockBoot = options.dock
    ? `const dock = installRodDock({ modules: [], scripts: ${JSON.stringify(options.catalog || definitions)} });
       const disposeRuntime = api.dispose.bind(api);
       api.dispose = async () => { dock.dispose(); await disposeRuntime(); };`
    : "";
  const entryCode = `${imports.join("\n")}
    ${dockImport}
    import {createRuntime} from ${JSON.stringify(path.join(root, "src/core/runtime-solid.js"))};
    export function boot(bridge) {
      const api = createRuntime([${entries.join(",")}], bridge, window, ${JSON.stringify(options.release || null)});
      ${dockBoot}
      return api;
    }
  `;
  // A dynamic ctx[key] lookup must preserve the complete runtime. The
  // standalone installer also preserves global Dock/clipboard functionality.
  const used = new Set(options.features || []);
  const fullRuntime = options.dynamic || options.dock || !Array.isArray(options.features);
  const enabled = (feature) => fullRuntime || used.has(feature);
  const clipboard = enabled("clipboard");
  const featureDefines = {
    __ROD_FEATURE_MENU__: JSON.stringify(enabled("menu") || clipboard),
    __ROD_FEATURE_TOASTER__: JSON.stringify(true),
    __ROD_FEATURE_CLIPBOARD__: JSON.stringify(clipboard),
    __ROD_FEATURE_GM__: JSON.stringify(enabled("gm")),
    __ROD_FEATURE_DOM__: JSON.stringify(enabled("dom")),
    __ROD_FEATURE_UI__: JSON.stringify(enabled("ui")),
    __ROD_FEATURE_HTTP__: JSON.stringify(
      enabled("http") || enabled("interceptRequest") || enabled("interceptResponse"),
    ),
  };
  const result = await build({
    root,
    configFile: path.join(root, "vite.config.js"),
    logLevel: "warn",
    define: featureDefines,
    plugins: [
      instrumentErrorsPlugin(root),
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
  const assets = output.filter((item) => item.type === "asset");
  const cssAssets = assets.filter((item) => item.fileName.endsWith(".css"));
  if (chunks.length !== 1 || assets.length !== cssAssets.length) {
    const unexpected = output.map((item) => ({
      type: item.type,
      fileName: item.fileName,
      bytes:
        item.type === "asset" ? Buffer.byteLength(item.source || "") : Buffer.byteLength(item.code || ""),
      imports: item.type === "chunk" ? item.imports : undefined,
      dynamicImports: item.type === "chunk" ? item.dynamicImports : undefined,
    }));
    throw Error(
      `Userscript must be one self-contained JS chunk without CSS/assets. Output: ${JSON.stringify(unexpected, null, 2)}`,
    );
  }
  // Rolldown reports rendered module lengths after tree-shaking. These are
  // uncompressed contributions, not independently gzipped module sizes.
  if (typeof options.onBundleStats === "function") {
    const modules = Object.entries(chunks[0].modules || {})
      .map(([id, info]) => ({
        id: path.isAbsolute(id) ? path.relative(root, id).split(path.sep).join("/") : id,
        renderedBytes: info.renderedLength ?? 0,
        originalBytes: info.originalLength ?? 0,
        removedExportsCount: info.removedExports?.length ?? 0,
      }))
      .sort((a, b) => b.renderedBytes - a.renderedBytes || a.id.localeCompare(b.id));
    options.onBundleStats({
      bytes: Buffer.byteLength(chunks[0].code),
      modules,
      totalRenderedModuleBytes: modules.reduce((sum, item) => sum + item.renderedBytes, 0),
      includedModuleCount: modules.filter((item) => item.renderedBytes > 0).length,
      topModules: modules.filter((item) => item.renderedBytes > 0).slice(0, 20),
      featureDefines: Object.fromEntries(
        Object.entries(featureDefines).map(([key, value]) => [key, value === "true"]),
      ),
    });
  }
  const cssText = cssAssets.map((item) => String(item.source || "")).join("\n");
  const cssPrelude = cssText
    ? '(()=>{const s=document.createElement("style");s.textContent=' +
      JSON.stringify(cssText) +
      ";(document.head||document.documentElement).append(s)})();\n"
    : "";
  return format(readableStrings(cssPrelude + chunks[0].code), { parser: "babel", printWidth: 110 });
}
