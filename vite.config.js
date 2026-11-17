import path from "node:path";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import definitions from "./userscripts.config.js";
import { runtimeHelpers } from "./build/runtime-helpers.mjs";
import { inlineCSSModules } from "./build/css-modules.mjs";
import { inlineSVG } from "./build/svg.mjs";
import { stylesPipeline } from "./build/styles.mjs";
import { solidDOMTemplates } from "./build/solid-dom.mjs";
import { reactJSX } from "./build/react-jsx.mjs";

const reactEntries = definitions.filter((item) => item.framework === "react")
  .map((item) => path.resolve(item.entry).replaceAll(path.sep, "/"));
const escapeRegex = (value) => value.replaceAll(".", "\\.").replaceAll("/", "\\/");
const reactPaths = ["\\.react\\.tsx", "\\/runtime-context-react\\.tsx", ...reactEntries.map(escapeRegex)];
const reactModules = new RegExp(`(?:${reactPaths.join("|")})(?:\\?.*)?$`);

export default defineConfig({
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [
    runtimeHelpers(),
    reactJSX(reactEntries),
    inlineCSSModules(),
    inlineSVG(),
    solid({ refresh: false, include: /\\.[jt]sx(?:\\?.*)?$/, exclude: reactModules }),
    solidDOMTemplates(),
  ],
  css: {
    transformer: "postcss",
    postcss: { plugins: stylesPipeline() },
    lightningcss: { targets: { safari: 15 << 16 } },
  },
  build: {
    target: "safari15",
    minify: false,
    cssMinify: "lightningcss",
    sourcemap: false,
    cssCodeSplit: false,
    lib: { name: "UserscriptsCF", formats: ["iife"], fileName: () => "runtime.js" },
  },
});
