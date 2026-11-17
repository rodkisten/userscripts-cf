import path from "node:path";
import { build } from "vite";
import { format } from "prettier";
import { readableStrings } from "./readable-strings.mjs";
import { instrumentErrorsPlugin } from "./instrument-errors.mjs";
import { reactJSX } from "./react-jsx.mjs";

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
  const frameworks = new Set(definitions.map((item) => item.framework || "solid"));
  for (const framework of frameworks) {
    if (!["react", "solid"].includes(framework)) throw new Error(`Unsupported framework: ${framework}`);
  }
  const runtimeImports = [...frameworks].map((framework) =>
    `import {createRuntime as create_${framework}} from ${JSON.stringify(path.join(root, "src/core", `runtime-${framework}.ts`))};`,
  );
  const groupedDefinitions = [...frameworks].map((framework) => {
    const indices = definitions.flatMap((item, index) =>
      (item.framework || "solid") === framework ? [index] : [],
    );
    return `create_${framework}([${indices.map((index) => entries[index]).join(",")}], scopedBridge, window, ${JSON.stringify(options.release || null)})`;
  });
  const entryCode = `${imports.join("\n")}
    ${dockImport}
    ${runtimeImports.join("\n")}
    export function boot(bridge) {
      const scopedBridge = {call: (method, payload) => bridge.call(method, payload)};
      const runtimes = [${groupedDefinitions.join(",")}];
      const api = {
        ready: Promise.all(runtimes.map((runtime) => runtime.ready)).then(() => undefined),
        navigate: async () => { await Promise.all(runtimes.map((runtime) => runtime.navigate())); },
        get active() { return runtimes.flatMap((runtime) => runtime.active); },
        dispose: async () => {
          try { const results = await Promise.allSettled([...runtimes].reverse().map((runtime) => runtime.dispose())); const failed = results.filter((result) => result.status === "rejected"); if (failed.length) throw new AggregateError(failed.map((result) => result.reason), "Runtime disposal failed"); }
          finally { bridge.dispose?.(); }
        },
      };
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
      reactJSX(definitions.filter((item) => item.framework === "react").map((item) => path.resolve(root, item.entry))),
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
