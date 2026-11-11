import { stylesPipeline } from "./build/styles.mjs";
import { defineConfig } from "vite";

// Build orchestrator calls this once per standalone and once for the unified script.
export default defineConfig({
  publicDir: false,
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
