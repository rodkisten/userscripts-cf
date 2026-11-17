import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { execFileSync } from "node:child_process";
import { build as viteBuild, mergeConfig } from "vite";
import baseViteConfig from "../vite.config.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(await fs.readFile(path.join(dist, "manifest.json"), "utf8"));
const isPreview = process.env.USERSCRIPTS_PREVIEW === "1";
execFileSync(process.execPath, [path.join(root, "build/design-system.mjs")], { cwd: root, stdio: "inherit" });
const assets = { "index.html": await fs.readFile(path.join(root, "hosting/index.html"), "utf8") };
assets["design-system.html"] = await fs.readFile(path.join(root, "hosting/design-system.html"), "utf8");
assets["design-system.js"] = await fs.readFile(path.join(dist, "design-system.js"), "utf8");
assets["playground/ast-errors.html"] = await fs.readFile(
  path.join(root, "playground/ast-errors.html"),
  "utf8",
);
assets["playground/diagnostics.html"] = await fs.readFile(
  path.join(root, "playground/diagnostics.html"),
  "utf8",
);
assets["playground/inspector.html"] = await fs.readFile(path.join(root, "playground/inspector.html"), "utf8");
assets["playground/form-controls.html"] = await fs.readFile(
  path.join(root, "playground/form-controls.html"),
  "utf8",
);
// Compile the actual SolidJS components instead of shipping a separate HTML mock.
const playgroundDir = path.join(dist, "form-controls-playground");
await viteBuild(
  mergeConfig(baseViteConfig, {
    configFile: false,
    root,
    build: {
      outDir: playgroundDir,
      emptyOutDir: true,
      cssCodeSplit: false,
      lib: {
        entry: path.join(root, "playground/form-controls-app.tsx"),
        formats: ["es"],
        fileName: () => "form-controls.js",
        cssFileName: "form-controls",
      },
      minify: false,
      sourcemap: true,
    },
  }),
);
await viteBuild({
  configFile: false,
  root,
  build: {
    outDir: path.join(dist, "ast-errors-playground"),
    emptyOutDir: true,
    lib: {
      entry: path.join(root, "playground/ast-errors-app.js"),
      formats: ["es"],
      fileName: () => "ast-errors.js",
    },
    minify: true,
  },
});
assets["playground/ast-errors.js"] = await fs.readFile(
  path.join(dist, "ast-errors-playground/ast-errors.js"),
  "utf8",
);
assets["playground/form-controls.js"] = await fs.readFile(
  path.join(playgroundDir, "form-controls.js"),
  "utf8",
);
assets["playground/form-controls.js.map"] = await fs.readFile(
  path.join(playgroundDir, "form-controls.js.map"),
  "utf8",
);
// CSS may be inlined by the shared Vite CSS Modules pipeline. Do not fail the release
// when no standalone stylesheet is emitted. Keep the URL valid for the playground.
assets["playground/form-controls.css"] = await fs
  .readFile(path.join(playgroundDir, "form-controls.css"), "utf8")
  .catch((error) => {
    if (error?.code !== "ENOENT") throw error;
    console.log("Form controls CSS is inlined; no standalone stylesheet emitted.");
    return "";
  });
if (isPreview) {
  const preview = JSON.parse(await fs.readFile(path.join(dist, "preview-manifest.json"), "utf8"));
  assets["preview/manifest.json"] = JSON.stringify(preview);
  assets["preview/index.html"] = assets["index.html"]
    .replaceAll("/manifest.json", "/preview/manifest.json")
    .replace("Userscripts CF · Instale seus scripts", "[PRE] Userscripts CF · Preview");
}
for (const file of await fs.readdir(dist)) {
  if (!/^(?:[a-z][a-z0-9-]*\.(?:user|meta)\.js|manifest\.json|SHA256SUMS)$/.test(file)) continue;
  assets[file] = await fs.readFile(path.join(dist, file), "utf8");
}
for (const file of await fs.readdir(path.join(dist, "icons"))) {
  if (!/^[a-z][a-z0-9-]*\.svg$/.test(file)) continue;
  assets["icons/" + file] = await fs.readFile(path.join(dist, "icons", file), "utf8");
}
const code = `import {createHandler} from './handler.js';
const assets=${JSON.stringify(assets)};
const info=${JSON.stringify({ name: "Userscripts CF", version: manifest.version, baseURL: manifest.baseURL, downloads: manifest.scripts.map((s) => ({ id: s.id, install: manifest.baseURL + "/" + s.file, update: manifest.baseURL + "/" + s.metaFile })) })};
export default createHandler(assets,info);`;
await fs.writeFile(
  path.join(root, "hosting/worker.mjs"),
  await format(code, { parser: "babel", printWidth: 110 }),
);
console.log("Prepared Cloudflare Worker with installable bundles.");
