import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import { solidDOMTemplates } from "./build/solid-dom.mjs";

// Build orchestrator calls this once per standalone and once for the unified script.
export default defineConfig({
  publicDir: false,
  plugins: [solid({ refresh: false }), solidDOMTemplates()],
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
