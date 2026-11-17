import ts from "typescript";
import path from "node:path";

// Framework-specific entrypoints and *.react.tsx modules use React's automatic JSX runtime.
export function reactJSX(reactEntries = []) {
  const entries = new Set(reactEntries.map((entry) => path.resolve(entry).replaceAll(path.sep, "/")));
  return {
    name: "userscripts-cf:react-jsx",
    enforce: "pre",
    transform(code, id) {
      const filename = id.split("?", 1)[0].replaceAll(path.sep, "/");
      if (!entries.has(filename) && !filename.endsWith(".react.tsx") &&
          !filename.endsWith("/runtime-context-react.tsx")) return null;
      const result = ts.transpileModule(code, {
        fileName: filename,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: "react",
        },
      });
      return { code: result.outputText, map: null };
    },
  };
}
