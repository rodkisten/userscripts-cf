import { RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, placeholder } from "@codemirror/view";
import { parseTwitterSearch } from "./twitter-search";

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
    label.textContent = isList
      ? this.lists.find((list) => list.id === this.value.slice(5))?.name || this.value
      : this.value;
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

const editorCSS = `
.twitter-cm-pill {
  display: inline-flex; align-items: center; vertical-align: middle;
  gap: 3px; max-width: 100%; padding: 2px 3px 2px 8px;
  border: 1px solid #3f3f46; border-radius: 9px;
  background: #18181b; color: #fafafa;
  font: 500 13px/1.4 system-ui, sans-serif;
}
.twitter-cm-pill-trigger, .twitter-cm-pill > button {
  appearance: none; border: 0; background: transparent; color: inherit;
  font: inherit; cursor: pointer; border-radius: 6px;
}
.twitter-cm-pill-trigger { padding: 5px 6px; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.twitter-cm-pill-trigger[aria-haspopup="menu"]::after { content: "⌄"; color: #a1a1aa; padding-left: 7px; }
.twitter-cm-pill-trigger:disabled { opacity: 1; cursor: default; }
.twitter-cm-pill > button:last-child { min-width: 26px; min-height: 26px; color: #a1a1aa; font-size: 19px; }
.twitter-cm-pill > button:hover, .twitter-cm-pill > button:focus-visible { background: #ffffff16; outline: none; }
.twitter-token-menu {
  position: fixed; z-index: 2147483647; box-sizing: border-box;
  overflow-y: auto; overscroll-behavior: contain; padding: 5px;
  border: 1px solid #303036; border-radius: 12px; background: #171717;
  color: #fafafa; box-shadow: 0 16px 48px #0009, 0 2px 8px #0006;
  font: 14px/1.5 system-ui, -apple-system, sans-serif;
}
.twitter-token-menu-label { padding: 8px 9px 5px; color: #a1a1aa; font-size: 12px; font-weight: 550; }
.twitter-token-menu-search {
  box-sizing: border-box; width: calc(100% - 12px); margin: 5px 6px 8px;
  min-height: 36px; border: 1px solid #3f3f46; border-radius: 7px;
  background: #262626; color: #fafafa; padding: 6px 10px;
  font: inherit; font-size: 16px; outline: none;
}
.twitter-token-menu-search:focus { border-color: #a78bfa; }
.twitter-token-menu-item {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; width: 100%; min-height: 38px; padding: 7px 9px;
  border: 0; border-radius: 6px; background: transparent;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.twitter-token-menu-item:hover, .twitter-token-menu-item:focus-visible { background: #353535; outline: none; }
.twitter-token-menu-item[aria-checked="true"] { color: #c4b5fd; }
.twitter-token-menu-shortcut { color: #a1a1aa; font-size: 11px; white-space: nowrap; }
.twitter-token-menu-separator { height: 1px; margin: 5px -5px; background: #303036; }
`;
let editorStyle: HTMLStyleElement | undefined;
function ensureEditorStyles() {
  if (editorStyle?.isConnected) return;
  editorStyle = document.createElement("style");
  editorStyle.dataset.twitterSearchEditor = "true";
  editorStyle.textContent = editorCSS;
  document.head.append(editorStyle);
}

export function createTwitterSearchEditor(
  host: HTMLElement,
  initial: string,
  onChange: (value: string) => void,
  lists: readonly TwitterList[] = demoLists,
) {
  ensureEditorStyles();
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
      dismissMenu?.();
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
  {
    label: "Mídia",
    items: [
      ["filter:images", "Imagens"],
      ["filter:videos", "Vídeos"],
      ["filter:native_video", "Vídeo nativo"],
    ],
  },
  {
    label: "Conteúdo",
    items: [
      ["filter:links", "Links"],
      ["filter:replies", "Respostas"],
      ["-filter:replies", "Sem respostas"],
      ["filter:media", "Qualquer mídia"],
    ],
  },
  {
    label: "Idioma",
    items: [
      ["lang:pt", "Português"],
      ["lang:en", "Inglês"],
      ["lang:es", "Espanhol"],
    ],
  },
];
let dismissMenu: (() => void) | undefined;
function showTokenMenu(
  trigger: HTMLElement,
  view: EditorView,
  current: string,
  start: number,
  lists: readonly TwitterList[],
) {
  dismissMenu?.();
  const panel = document.createElement("div");
  panel.className = "twitter-token-menu";
  panel.setAttribute("role", "menu");
  panel.tabIndex = -1;
  document.body.append(panel);
  const close = () => {
    panel.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keyboard, true);
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    trigger.setAttribute("aria-expanded", "false");
    if (dismissMenu === close) dismissMenu = undefined;
  };
  dismissMenu = close;
  trigger.setAttribute("aria-expanded", "true");
  const outside = (event: PointerEvent) => {
    if (!panel.contains(event.target as Node) && !trigger.contains(event.target as Node)) close();
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
      trigger.focus();
    }
  };
  const position = () => {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    panel.style.width = width + "px";
    panel.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + "px";
    const below = window.innerHeight - rect.bottom;
    panel.style.top =
      (below >= 240 || below > rect.top
        ? Math.min(rect.bottom + 6, window.innerHeight - 16)
        : Math.max(12, rect.top - Math.min(panel.scrollHeight, 340) - 6)) + "px";
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
    const token = parseTwitterSearch(view.state.doc.toString()).find(
      (item) => item.start === start && item.raw === current,
    );
    if (token)
      view.dispatch({
        changes: { from: token.start, to: token.end, insert: value },
        selection: { anchor: token.start + value.length },
      });
    close();
    view.focus();
  };
  const groups = current.startsWith("list:")
    ? [{ label: "Listas", items: lists.map((item) => ["list:" + item.id, item.name]) }]
    : filterGroups;
  let activeGroup: string | null = null;
  const focusItem = (direction: number) => {
    const items = [
      ...results.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]'),
    ];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(index + direction + items.length) % items.length]?.focus();
  };
  const render = () => {
    results.replaceChildren();
    const query = search.value.toLocaleLowerCase();
    const visibleGroups = groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          ([value, label]) => value.toLowerCase().includes(query) || label.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.items.length);
    if (activeGroup && !visibleGroups.some((group) => group.label === activeGroup)) activeGroup = null;
    if (activeGroup) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "twitter-token-menu-item";
      back.textContent = "‹  Voltar aos grupos";
      back.addEventListener("click", () => {
        activeGroup = null;
        render();
        search.focus();
      });
      results.append(back);
    }
    for (const group of visibleGroups) {
      if (!activeGroup && !query) {
        const folder = document.createElement("button");
        folder.type = "button";
        folder.className = "twitter-token-menu-item";
        folder.setAttribute("role", "menuitem");
        folder.setAttribute("aria-haspopup", "menu");
        folder.textContent = group.label + "  ›";
        folder.addEventListener("click", () => {
          activeGroup = group.label;
          render();
          focusItem(1);
        });
        results.append(folder);
        continue;
      }
      if (activeGroup && activeGroup !== group.label) continue;
      const heading = document.createElement("div");
      heading.className = "twitter-token-menu-label";
      heading.textContent = group.label;
      results.append(heading);
      for (const [value, label] of group.items) {
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
    }
    if (!results.children.length) {
      const empty = document.createElement("div");
      empty.className = "twitter-token-menu-label";
      empty.textContent = "Nenhum resultado";
      results.append(empty);
    }
    position();
  };
  search.addEventListener("input", () => {
    activeGroup = null;
    render();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && event.target !== search) {
      event.preventDefault();
      focusItem(1);
    } else if (event.key === "ArrowUp" && event.target !== search) {
      event.preventDefault();
      focusItem(-1);
    } else if (
      event.key === "ArrowRight" &&
      document.activeElement?.getAttribute("aria-haspopup") === "menu"
    ) {
      event.preventDefault();
      (document.activeElement as HTMLButtonElement).click();
    } else if (event.key === "ArrowLeft" && activeGroup) {
      event.preventDefault();
      activeGroup = null;
      render();
      search.focus();
    } else if (event.key === "Enter" && event.target !== search) {
      event.preventDefault();
      (document.activeElement as HTMLButtonElement).click();
    } else if (event.key === "Home" && event.target !== search) {
      event.preventDefault();
      results.querySelector<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]')?.focus();
    } else if (event.key === "End" && event.target !== search) {
      event.preventDefault();
      [...results.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]')]
        .at(-1)
        ?.focus();
    }
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(1);
    } else if (event.key === "Enter") {
      const first = results.querySelector<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]');
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
  render();
  position();
  requestAnimationFrame(() => {
    if (!panel.isConnected) return;
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
  });
}
