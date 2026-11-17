import ts from "typescript";

// Compile React JSX before Solid's JSX compiler sees these modules.
export function reactJSX() {
  return {
    name: "userscripts-cf:react-jsx",
    enforce: "pre",
    transform(code, id) {
      const filename = id.split("?", 1)[0].replaceAll("\\\\", "/");
      if (!/(?:\\.react\\.tsx|\\/runtime-context-react\\.tsx)$/.test(filename)) return null;
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
