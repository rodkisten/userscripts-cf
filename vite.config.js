import { defineConfig } from "vite";

// Build orchestrator calls this once per standalone and once for the unified script.
export default defineConfig({
  publicDir: false,
  build: {
    target: "safari15",
    minify: false,
    cssMinify: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      name: "UserscriptsCF",
      formats: ["iife"],
      fileName: () => "runtime.js",
    },
  },
});
