import { defineConfig } from "vite";
import { runtimeHelpers } from "./build/runtime-helpers.mjs";
import { inlineCSSModules } from "./build/css-modules.mjs";
import { inlineSVG } from "./build/svg.mjs";
import { stylesPipeline } from "./build/styles.mjs";

// React-only: no Solid compiler, runtime detection, or compatibility layer.
export default defineConfig({
  publicDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [runtimeHelpers(), inlineCSSModules(), inlineSVG()],
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
