import { RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, placeholder } from "@codemirror/view";
import { parseTwitterSearch } from "../src/runtime/solid-ui/form-controls/twitter-search";

export interface TwitterList { id: string; name: string }
const demoLists: TwitterList[] = [
  { id: "123456789", name: "Tecnologia (demonstração)" },
  { id: "987654321", name: "Vídeos (demonstração)" },
];

/** Replace demoLists with the authenticated X lists provider in the userscript. */
class TokenWidget extends WidgetType {
  constructor(readonly value: string, readonly start: number, readonly lists: readonly TwitterList[]) { super(); }
  eq(other: TokenWidget) { return this.value === other.value && this.start === other.start && this.lists === other.lists; }
  toDOM(view: EditorView) {
    const pill = document.createElement("span");
    pill.className = "twitter-cm-pill";
    pill.contentEditable = "false";
    const isList = this.value.startsWith("list:");
    if (isList) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Selecionar lista do X");
      const current = this.value.slice(5);
      const available = this.lists.some((list) => list.id === current)
        ? this.lists
        : [{ id: current, name: current || "Escolher lista…" }, ...this.lists];
      for (const list of available) {
        const option = document.createElement("option");
        option.value = list.id;
        option.textContent = list.name;
        option.selected = list.id === current;
        select.append(option);
      }
      select.addEventListener("change", () => this.replace(view, "list:" + select.value));
      pill.append(select);
    } else {
      const label = document.createElement("span");
      label.textContent = this.value;
      pill.append(label);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remover " + this.value);
    remove.addEventListener("mousedown", (event) => event.preventDefault());
    remove.addEventListener("click", () => this.replace(view, ""));
    pill.append(remove);
    return pill;
  }
  private replace(view: EditorView, next: string) {
    const token = parseTwitterSearch(view.state.doc.toString()).find((entry) => entry.start === this.start && entry.raw === this.value);
    if (!token) return;
    const from = token.start;
    const to = token.end;
    view.dispatch({ changes: { from, to, insert: next }, selection: { anchor: from + next.length } });
    view.focus();
  }
  ignoreEvent() { return true; }
}

export function createTwitterSearchEditor(host: HTMLElement, initial: string, onChange: (value: string) => void, lists: readonly TwitterList[] = demoLists) {
  const decorations = StateField.define({
    create(state) { return computeDecorations(state.doc.toString(), lists); },
    update(_previous, transaction) { return computeDecorations(transaction.state.doc.toString(), lists); },
    provide(field) { return EditorView.decorations.from(field); },
  });
  const view = new EditorView({
    parent: host,
    doc: initial,
    extensions: [
      decorations,
      EditorView.lineWrapping,
      placeholder("Digite termos, filter:videos ou list:…"),
      keymap.of([{ key: "Mod-Enter", run: () => { view.contentDOM.blur(); return true; } }]),
      EditorView.updateListener.of((update) => { if (update.docChanged) onChange(update.state.doc.toString()); }),
      EditorView.theme({
        "&": { minHeight: "120px", background: "#09090b", color: "#fafafa", border: "1px solid #52525b", borderRadius: "12px", fontSize: "16px" },
        "&.cm-focused": { outline: "2px solid #2563eb" },
        ".cm-content": { minHeight: "110px", padding: "12px", caretColor: "#fff" },
        ".cm-line": { lineHeight: "2.2", overflowWrap: "anywhere" },
        ".cm-scroller": { overflowX: "hidden" },
        ".cm-placeholder": { color: "#71717a" },
      }),
    ],
  });
  return {
    view,
    setValue(value: string) {
      const current = view.state.doc.toString();
      if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    },
    destroy() { view.destroy(); },
  };
}
function computeDecorations(source: string, lists: readonly TwitterList[]) {
  const builder = new RangeSetBuilder<Decoration>();
  for (const token of parseTwitterSearch(source)) {
    if (token.kind !== "operator" && token.kind !== "negative") continue;
    builder.add(token.start, token.end, Decoration.replace({ widget: new TokenWidget(token.raw, token.start, lists) }));
  }
  return builder.finish();
}
