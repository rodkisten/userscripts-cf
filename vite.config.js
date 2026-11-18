import { runtimeHelpers } from "./build/runtime-helpers.mjs";
import { inlineCSSModules } from "./build/css-modules.mjs";
import { inlineSVG } from "./build/svg.mjs";
import { stylesPipeline } from "./build/styles.mjs";
import { defineConfig } from "vite";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

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
      const result = ts.transpileModule(code, {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: solid ? "@solidjs/web" : "react",
          isolatedModules: true,
          sourceMap: false,
        },
      });
      const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
      if (errors.length) {
        throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => "\\n",
        }));
      }
      return { code: result.outputText, map: null };
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
  // Runtime helper rewrites must see original TSX before Oxc strips its syntax.
  plugins: [runtimeHelpers(), transformSourceTsx(), inlineCSSModules(), inlineSVG()],
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
