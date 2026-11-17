import ts from "typescript";

// React modules use the automatic JSX runtime; Solid modules keep their own compiler.
export function reactJSX() {
  return {
    name: "userscripts-cf:react-jsx",
    enforce: "pre",
    transform(code, id) {
      const filename = id.split("?", 1)[0];
      if (!filename.endsWith(".react.tsx") && !filename.endsWith("/runtime-context-react.tsx"))
        return null;
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
