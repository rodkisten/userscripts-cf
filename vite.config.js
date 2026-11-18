import { runtimeHelpers } from "./build/runtime-helpers.mjs";
import { inlineCSSModules } from "./build/css-modules.mjs";
import { inlineSVG } from "./build/svg.mjs";
import { stylesPipeline } from "./build/styles.mjs";
import { defineConfig, transformWithOxc } from "vite";

// Vite 8/Rolldown must receive JavaScript, not unparsed TSX, for mixed-runtime entries.
// Keep this build-only transform scoped to source TSX while the React migration completes.
function transformSourceTsx() {
  return {
    name: "userscripts-cf-transform-source-tsx",
    enforce: "pre",
    async transform(code, id) {
      const file = id.split("?")[0];
      if (!file.includes("/src/") || !file.endsWith(".tsx")) return null;
      // Preserve the legacy Solid 2 JSX runtime until each component is migrated.
      // Never silently compile Solid components into React elements.
      const solid = file.includes("/solid-ui/") || /(?:from\s*["\x27]solid-js(?:\/[^"\x27]*)?["\x27]|@jsxImportSource\s+@solidjs\/web)/.test(code);
      return transformWithOxc(code, file, {
        lang: "tsx",
        jsx: { runtime: "automatic", importSource: solid ? "@solidjs/web" : "react" },
      });
    },
  };
}


// Build orchestrator calls this once per standalone and once for the unified script.
export default defineConfig({
  publicDir: false,
  // TanStack Virtual checks process.env.NODE_ENV at runtime. Browser bundles
  // must not depend on Node's global process object.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [transformSourceTsx(), runtimeHelpers(), inlineCSSModules(), inlineSVG()],
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
