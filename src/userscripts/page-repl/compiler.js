import { javascriptLanguage } from "@codemirror/lang-javascript";
import {
  analyzePersistentDeclarations,
  assertLezerSyntax,
  emitLezerProgram,
} from "./compiler-lezer.js";

const reserved = new Set(["ctx", "console", "$", "$$", "$0", "_"]);

export function compile(source, { persist = true, knownNames = [] } = {}) {
  const tree = javascriptLanguage.parser.parse(source);
  assertLezerSyntax(source, tree);

  const analysis = persist
    ? analyzePersistentDeclarations(source, tree)
    : { names: new Set(), variableDeclarations: [], forBindings: [], declarations: [] };

  for (const name of analysis.names) {
    if (reserved.has(name)) {
      throw Error(`Nome reservado do REPL: ${name}`);
    }
  }

  return {
    code: emitLezerProgram(source, tree, analysis, {
      persist,
      knownNames: knownNames.filter((name) => !reserved.has(name)),
    }),
    names: [...analysis.names],
  };
}
