import { runtimeHelpers } from "./build/runtime-helpers.mjs";
import { inlineCSSModules } from "./build/css-modules.mjs";
import { inlineSVG } from "./build/svg.mjs";
import { stylesPipeline } from "./build/styles.mjs";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import { solidDOMTemplates } from "./build/solid-dom.mjs";
import { reactJSX } from "./build/react-jsx.mjs";
import path from "node:path";
import definitions from "./userscripts.config.js";

const reactEntries = definitions.filter((item) => item.framework === "react")
  .map((item) => path.resolve(item.entry).replaceAll(path.sep, "/"));
const reactModules = /(?:\.react\.tsx|\/runtime-context-react\.tsx)(?:\?.*)?$/;


// Build orchestrator calls this once per standalone and once for the unified script.
export default defineConfig({
  publicDir: false,
  // TanStack Virtual checks process.env.NODE_ENV at runtime. Browser bundles
  // must not depend on Node's global process object.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [
    runtimeHelpers(),
    reactJSX(reactEntries),
    inlineCSSModules(),
    inlineSVG(),
    solid({ refresh: false, include: /\.[jt]sx(?:\?.*)?$/, exclude: reactModules }),")).join("|") : ""})(?:\\?.*)?import { runtimeHelpers } from "./build/runtime-helpers.mjs";
import { inlineCSSModules } from "./build/css-modules.mjs";
import { inlineSVG } from "./build/svg.mjs";
import { stylesPipeline } from "./build/styles.mjs";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import { solidDOMTemplates } from "./build/solid-dom.mjs";
import { reactJSX } from "./build/react-jsx.mjs";
import path from "node:path";
import definitions from "./userscripts.config.js";

const reactEntries = definitions.filter((item) => item.framework === "react")
  .map((item) => path.resolve(item.entry).replaceAll(path.sep, "/"));
const reactModules = /(?:\.react\.tsx|\/runtime-context-react\.tsx)(?:\?.*)?$/;
const solidOnly = (id) => !reactModules.test(id) && !reactEntries.includes(id.split("?", 1)[0].replaceAll(path.sep, "/"));

// Build orchestrator calls this once per standalone and once for the unified script.
export default defineConfig({
  publicDir: false,
  // TanStack Virtual checks process.env.NODE_ENV at runtime. Browser bundles
  // must not depend on Node's global process object.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [
    runtimeHelpers(),
    reactJSX(reactEntries),
    inlineCSSModules(),
    inlineSVG(),
    ) }),
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
    lib: {
      name: "UserscriptsCF",
      formats: ["iife"],
      fileName: () => "runtime.js",
    },
  },
});
