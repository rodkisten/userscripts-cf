import { build, mergeConfig } from "vite";
import baseConfig from "../vite.config.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build(
  mergeConfig(baseConfig, {
    configFile: false,
    build: {
      emptyOutDir: false,
      outDir: path.join(root, "dist"),
      rollupOptions: { input: path.join(root, "studio/entry.tsx") },
      lib: {
        entry: path.join(root, "studio/entry.tsx"),
        name: "RodUIDesignStudio",
        formats: ["iife"],
        fileName: () => "design-system.js",
      },
    },
  }),
);
console.log("Built live Rod UI Design Studio");
