import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, selectAll } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import { linter, lintGutter, forceLinting } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { pageCompletions } from "./completion";

export function createEditor(
  parent: HTMLElement,
  options: {
    value: string;
    page: () => Window;
    names: () => Iterable<string>;
    validate: (source: string) => void;
    onChange: () => void;
    onValidation: (message: string) => void;
    execute: () => void;
    history: (direction: number) => void;
  },
) {
  const view = new EditorView({
    parent,
    root: parent.getRootNode() as ShadowRoot,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        EditorView.lineWrapping,
        javascript(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        oneDark,
        lintGutter(),
        EditorView.contentAttributes.of({
          "aria-label": "Código JavaScript",
          spellcheck: "false",
          autocapitalize: "off",
          autocorrect: "off",
        }),
        javascriptLanguage.data.of({ autocomplete: pageCompletions(options.page, options.names) }),
        autocompletion(),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              options.execute();
              return true;
            },
          },
          {
            key: "Alt-ArrowUp",
            run: () => {
              options.history(-1);
              return true;
            },
          },
          {
            key: "Alt-ArrowDown",
            run: () => {
              options.history(1);
              return true;
            },
          },
          indentWithTab,
          ...completionKeymap,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        linter(
          (view) => {
            try {
              options.validate(view.state.doc.toString());
              options.onValidation("Sintaxe válida · Ctrl/Cmd+Enter executa · Alt+↑/↓ histórico");
              return [];
            } catch (error) {
              const problem = error as Error & { pos?: number };
              const from = Math.min(view.state.doc.length, Math.max(0, problem.pos || 0));
              options.onValidation(problem.message);
              return [
                {
                  from,
                  to: Math.min(view.state.doc.length, from + 1),
                  severity: "error" as const,
                  message: problem.message,
                },
              ];
            }
          },
          { delay: 350 },
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange();
        }),
      ],
    }),
  });
  return {
    view,
    get value() {
      return view.state.doc.toString();
    },
    set value(value: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    focus: () => view.focus(),
    complete: () => {
      view.focus();
      startCompletion(view);
    },
    selectAll: () => {
      view.focus();
      selectAll(view);
    },
    selected: () =>
      view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) ||
      view.state.doc.toString(),
    insert: (text: string) => {
      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    },
    validate: () => forceLinting(view),
    refresh: () => view.requestMeasure(),
    destroy: () => view.destroy(),
  };
}
