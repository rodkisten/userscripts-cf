import { parse } from "acorn";
import { analyzePersistentBindings } from "./compiler-scope.js";
import { emitPersistentProgram } from "./compiler-source.js";

const reserved = new Set(["ctx", "console", "$", "$$", "$0", "_"]);
export function compile(source, { persist = true, knownNames = [] } = {}) {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    ranges: true,
  });

  const analysis = persist ? analyzePersistentBindings(ast, knownNames) : null;
  if (analysis) {
    for (const name of analysis.names) {
      if (reserved.has(name)) {
        throw Error(`Nome reservado do REPL: ${name}`);
      }
    }
  }

  return {
    code: emitPersistentProgram(source, ast, analysis, { persist }),
    names: analysis ? [...analysis.names] : [],
  };
}
