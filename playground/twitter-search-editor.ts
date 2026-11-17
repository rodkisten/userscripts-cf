import { RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, placeholder } from "@codemirror/view";
import { parseTwitterSearch } from "../src/runtime/solid-ui/form-controls/twitter-search";

export interface TwitterList {
  id: string;
  name: string;
}
const demoLists: TwitterList[] = [
  { id: "123456789", name: "Tecnologia (demonstração)" },
  { id: "987654321", name: "Vídeos (demonstração)" },
];

/** Replace demoLists with the authenticated X lists provider in the userscript. */
class TokenWidget extends WidgetType {
  constructor(
    readonly value: string,
    readonly start: number,
    readonly lists: readonly TwitterList[],
  ) {
    super();
  }
  eq(other: TokenWidget) {
    return this.value === other.value && this.start === other.start && this.lists === other.lists;
  }
  toDOM(view: EditorView) {
    const pill = document.createElement("span");
    pill.className = "twitter-cm-pill";
    pill.contentEditable = "false";
    const isList = this.value.startsWith("list:");
    const isFilter = this.value.startsWith("filter:") || this.value.startsWith("-filter:");
    const label = document.createElement("button");
    label.type = "button";
    label.className = "twitter-cm-pill-trigger";
    label.textContent = isList ? (this.lists.find((list) => list.id === this.value.slice(5))?.name || this.value) : this.value;
    if (isList || isFilter) {
      label.setAttribute("aria-haspopup", "menu");
      label.setAttribute("aria-expanded", "false");
      label.addEventListener("mousedown", (event) => event.preventDefault());
      label.addEventListener("click", (event) => {
        event.stopPropagation();
        showTokenMenu(label, view, this.value, this.start, this.lists);
      });
    } else label.disabled = true;
    pill.append(label);
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
    const token = parseTwitterSearch(view.state.doc.toString()).find(
      (entry) => entry.start === this.start && entry.raw === this.value,
    );
    if (!token) return;
    const from = token.start;
    const to = token.end;
    view.dispatch({ changes: { from, to, insert: next }, selection: { anchor: from + next.length } });
    view.focus();
  }
  ignoreEvent() {
    return true;
  }
}

export function createTwitterSearchEditor(
  host: HTMLElement,
  initial: string,
  onChange: (value: string) => void,
  lists: readonly TwitterList[] = demoLists,
) {
  const decorations = StateField.define({
    create(state) {
      return computeDecorations(state.doc.toString(), lists);
    },
    update(_previous, transaction) {
      return computeDecorations(transaction.state.doc.toString(), lists);
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
  const view = new EditorView({
    parent: host,
    doc: initial,
    extensions: [
      decorations,
      EditorView.lineWrapping,
      placeholder("Digite termos, filter:videos ou list:…"),
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            view.contentDOM.blur();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
      EditorView.theme({
        "&": {
          minHeight: "120px",
          background: "#09090b",
          color: "#fafafa",
          border: "1px solid #52525b",
          borderRadius: "12px",
          fontSize: "16px",
        },
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
    destroy() {
      view.destroy();
    },
  };
}
function computeDecorations(source: string, lists: readonly TwitterList[]) {
  const builder = new RangeSetBuilder<Decoration>();
  for (const token of parseTwitterSearch(source)) {
    if (token.kind !== "operator" && token.kind !== "negative") continue;
    if (/^(?:-?filter:|list:)$/i.test(token.raw)) continue;
    builder.add(
      token.start,
      token.end,
      Decoration.replace({ widget: new TokenWidget(token.raw, token.start, lists) }),
    );
  }
  return builder.finish();
}

const filterGroups = [
  { label: "Mídia", items: [["filter:images", "Imagens"], ["filter:videos", "Vídeos"], ["filter:native_video", "Vídeo nativo"]] },
  { label: "Conteúdo", items: [["filter:links", "Links"], ["filter:replies", "Respostas"], ["-filter:replies", "Sem respostas"], ["filter:media", "Qualquer mídia"]] },
  { label: "Idioma", items: [["lang:pt", "Português"], ["lang:en", "Inglês"], ["lang:es", "Espanhol"]] },
];
let dismissMenu: (() => void) | undefined;
function showTokenMenu(trigger: HTMLElement, view: EditorView, current: string, start: number, lists: readonly TwitterList[]) {
  dismissMenu?.();
  const panel = document.createElement("div");
  panel.className = "twitter-token-menu";
  panel.setAttribute("role", "menu");
  panel.tabIndex = -1;
  document.body.append(panel);
  const close = () => { panel.remove(); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", keyboard, true); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); trigger.setAttribute("aria-expanded", "false"); if (dismissMenu === close) dismissMenu = undefined; };
  dismissMenu = close;
  trigger.setAttribute("aria-expanded", "true");
  const outside = (event: PointerEvent) => { if (!panel.contains(event.target as Node) && !trigger.contains(event.target as Node)) close(); };
  const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); trigger.focus(); } };
  const position = () => {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    panel.style.width = width + "px";
    panel.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + "px";
    const below = window.innerHeight - rect.bottom;
    panel.style.top = (below >= 240 || below > rect.top ? Math.min(rect.bottom + 6, window.innerHeight - 16) : Math.max(12, rect.top - Math.min(panel.scrollHeight, 340) - 6)) + "px";
    panel.style.maxHeight = Math.max(140, Math.min(340, window.innerHeight - 32)) + "px";
  };
  const title = document.createElement("div");
  title.className = "twitter-token-menu-label";
  title.textContent = current.startsWith("list:") ? "Suas listas" : "Filtros da pesquisa";
  panel.append(title);
  const search = document.createElement("input");
  search.type = "search";
  search.className = "twitter-token-menu-search";
  search.placeholder = "Pesquisar…";
  search.setAttribute("aria-label", "Pesquisar opções");
  panel.append(search);
  const results = document.createElement("div");
  panel.append(results);
  const choose = (value: string) => {
    const token = parseTwitterSearch(view.state.doc.toString()).find((item) => item.start === start && item.raw === current);
    if (token) view.dispatch({ changes: { from: token.start, to: token.end, insert: value }, selection: { anchor: token.start + value.length } });
    close();
  };
  const render = () => {
    results.replaceChildren();
    const query = search.value.toLocaleLowerCase();
    const groups = current.startsWith("list:")
      ? [{ label: "Listas", items: lists.map((item) => ["list:" + item.id, item.name]) }]
      : filterGroups;
    for (const group of groups) {
      const matching = group.items.filter(([value, label]) => value.toLowerCase().includes(query) || label.toLowerCase().includes(query));
      if (!matching.length) continue;
      const heading = document.createElement("div");
      heading.className = "twitter-token-menu-label";
      heading.textContent = group.label;
      results.append(heading);
      for (const [value, label] of matching) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "twitter-token-menu-item";
        option.setAttribute("role", "menuitemradio");
        option.setAttribute("aria-checked", String(value === current));
        const text = document.createElement("span");
        text.textContent = label;
        const shortcut = document.createElement("span");
        shortcut.className = "twitter-token-menu-shortcut";
        shortcut.textContent = value === current ? "✓" : value;
        option.append(text, shortcut);
        option.addEventListener("click", () => choose(value));
        results.append(option);
      }
      const separator = document.createElement("div");
      separator.className = "twitter-token-menu-separator";
      results.append(separator);
    }
    if (!results.children.length) {
      const empty = document.createElement("div");
      empty.className = "twitter-token-menu-label";
      empty.textContent = "Nenhum resultado";
      results.append(empty);
    }
    position();
  };
  search.addEventListener("input", render);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { const first = results.querySelector<HTMLButtonElement>('[role="menuitemradio"]'); if (first) { event.preventDefault(); first.click(); } }
  });
  render();
  position();
  requestAnimationFrame(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", keyboard, true); window.addEventListener("resize", position); window.addEventListener("scroll", position, true); });
}
