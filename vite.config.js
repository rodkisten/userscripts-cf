import { runtimeHelpers } from "./build/runtime-helpers.mjs";
import { inlineCSSModules } from "./build/css-modules.mjs";
import { inlineSVG } from "./build/svg.mjs";
import { stylesPipeline } from "./build/styles.mjs";
import { defineConfig } from "vite";

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
    inlineCSSModules(),
    inlineSVG(),
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
