import * as ts from "typescript";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { instrumentErrorCallbacks } from "../build/instrument-errors.mjs";

const examples = {
  js: 'button.addEventListener("click", async () => { await saveSettings(); });',
  ts: "type Settings = { enabled: boolean };\nconst save = async (settings: Settings): Promise<void> => {\n  setTimeout(() => console.log(settings.enabled), 100);\n};",
  tsx: "type Props = { title: string };\nexport function Button(props: Props) {\n  return <button onClick={() => setTimeout(() => console.log(props.title), 0)}>{props.title}</button>;\n}",
  nested: 'setTimeout(() => queueMicrotask(() => { throw Error("nested"); }), 100);',
  named: 'button.addEventListener("click", handler);\nbutton.removeEventListener("click", handler);',
};
const $ = (selector) => document.querySelector(selector);
const language = $("#language");
const preset = $("#preset");
const status = $("#status");
const common = [
  lineNumbers(),
  history(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  javascript({ typescript: true, jsx: true }),
  syntaxHighlighting(defaultHighlightStyle),
  oneDark,
  EditorView.lineWrapping,
];
const editor = (parent, doc, readOnly = false) =>
  new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [...common, ...(readOnly ? [EditorState.readOnly.of(true)] : [])],
    }),
  });
const input = editor($("#input"), examples.js);
const output = editor($("#output"), "", true);
const replace = (view, value) =>
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
let last = "";
function diffLines(before, after) {
  const a = before.split("\n"),
    b = after.split("\n");
  const limit = 1200;
  const root = $("#diff");
  root.replaceChildren();
  if (a.length * b.length > limit * limit) {
    root.textContent = "Diff muito grande. Reduza o exemplo para comparar as linhas.";
    return;
  }
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0,
    j = 0;
  const fragment = document.createDocumentFragment();
  const append = (mark, value, kind) => {
    const line = document.createElement("div");
    line.className = "diff-line " + kind;
    const prefix = document.createElement("span");
    prefix.className = "diff-mark";
    prefix.textContent = mark;
    line.append(prefix, document.createTextNode(value || " "));
    fragment.append(line);
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      append(" ", a[i++], "same");
      j++;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) append("+", b[j++], "added");
    else append("-", a[i++], "removed");
  }
  root.append(fragment);
}
function transform() {
  const source = input.state.doc.toString();
  const lang = language.value;
  try {
    const compiled =
      lang === "js"
        ? source
        : ts.transpileModule(source, {
            fileName: lang === "tsx" ? "example.tsx" : "example.ts",
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
              jsx: ts.JsxEmit.ReactJSX,
            },
            reportDiagnostics: true,
          });
    const diagnostics = lang === "js" ? [] : compiled.diagnostics || [];
    const errors = diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error);
    if (errors.length)
      throw Error(errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
    const code = lang === "js" ? source : compiled.outputText;
    const result = instrumentErrorCallbacks(code, "/playground/example.js", { root: "/playground" });
    last = result.code;
    replace(output, last);
    diffLines(code, last);
    status.textContent =
      result.transformed +
      " callback(s) · " +
      (lang === "js" ? "JavaScript" : lang.toUpperCase() + " → JavaScript") +
      " · diff calculado";
  } catch (error) {
    last = "";
    replace(output, "");
    $("#diff").textContent = "";
    status.textContent = "Erro: " + String(error.message || error);
  }
}
function selectPreset() {
  const key = preset.value;
  language.value = key === "ts" || key === "tsx" ? key : "js";
  replace(input, examples[key]);
  transform();
}
preset.addEventListener("change", selectPreset);
language.addEventListener("change", transform);
$("#transform").addEventListener("click", transform);
$("#copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(last);
    status.textContent = "Resultado copiado";
  } catch {
    status.textContent = "Não foi possível copiar";
  }
});
transform();
