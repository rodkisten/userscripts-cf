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
// A matching workflow cache already contains the compiled Studio. Do not
// rebuild it for changes limited to the playground or hosting templates.
const cachedStudio = path.join(dist, "design-system.js");
const reuseStudio = process.env.USERSCRIPTS_REUSE_DESIGN_SYSTEM === "true";
if (reuseStudio) {
  const stats = await fs.stat(cachedStudio).catch(() => null);
  if (!stats?.isFile() || stats.size === 0) {
    throw new Error("Design-system cache reported a hit without a valid bundle");
  }
  console.log("⚡ Reusing cached design-system.js");
} else {
  execFileSync(process.execPath, [path.join(root, "build/design-system.mjs")], { cwd: root, stdio: "inherit" });
}
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
  assets["manifest.json"] = JSON.stringify(preview);
  assets["preview/manifest.json"] = JSON.stringify(preview);
  assets["preview-manifest.json"] = JSON.stringify(preview);
  // Version the module URL so Safari cannot reuse a stale ESM module after deploy.
  // GitHub Pages has no per-file Cache-Control configuration.
  const buildRevision = (
    process.env.GITHUB_SHA ||
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  ).slice(0, 12);
  assets["playground/form-controls.html"] = assets["playground/form-controls.html"]
    .replace(
      'const asset = "/playground/form-controls.js";',
      'const asset = "/playground/form-controls.js?v=' + buildRevision + '";',
    )
    .replace(
      "const status = { asset, userAgent:",
      'const status = { buildRevision: "' + buildRevision + '", asset, userAgent:',
    );
  assets["preview/index.html"] = assets["index.html"]
    .replaceAll("/manifest.json", "/preview/manifest.json")
    .replace("Userscripts CF · Instale seus scripts", "[PRE] Userscripts CF · Preview");
}
for (const file of await fs.readdir(dist)) {
  if (!/^(?:[a-z][a-z0-9-]*\.(?:(?:preview\.)?(?:user|meta))\.js|manifest\.json|SHA256SUMS)$/.test(file))
    continue;
  if (isPreview && file === "manifest.json") continue; // Keep the preview catalog, not the production manifest.
  if (isPreview && /\.(?:user|meta)\.js$/.test(file) && !file.includes(".preview.")) continue;
  assets[file] = await fs.readFile(path.join(dist, file), "utf8");
}
for (const file of await fs.readdir(path.join(dist, "icons"))) {
  if (!/^[a-z][a-z0-9-]*\.svg$/.test(file)) continue;
  assets["icons/" + file] = await fs.readFile(path.join(dist, "icons", file), "utf8");
}
if (isPreview) {
  // GitHub Pages serves files directly, without the Cloudflare Worker handler.
  const pages = path.join(dist, "pages");
  await fs.rm(pages, { recursive: true, force: true });
  await fs.mkdir(pages, { recursive: true });
  for (const [name, content] of Object.entries(assets)) {
    const destination = path.join(pages, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
  await fs.writeFile(path.join(pages, "CNAME"), "userscripts-playground.migos.club\n");
  await fs.writeFile(path.join(pages, ".nojekyll"), "");
  console.log("Prepared static GitHub Pages preview at dist/pages.");
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
