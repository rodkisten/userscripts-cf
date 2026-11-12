import { mountView } from "./solid-mount.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { applyComponentStyle } from "../../../core/css.js";
import { DOM_SELECTORS, RODX_SELECTORS, NATIVE_X_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-ui-quick-actions-1.css?inline";
import extractedCSS2 from "../../../styles/extracted/userscripts-rodx-studio-ui-quick-actions-2.css?inline";
import { Studio } from "../core/studio.js";
import { extractIdentity } from "../identity/account.js";
import { XDOM } from "../platform/selectors.js";
import { SearchAnchors } from "../search/anchors.tsx";
import { diagnosticSpans, highlightWithIssues } from "../search/highlight.tsx";
import { SearchHistory } from "../search/history.tsx";
import { state } from "../state/deck.js";
import { currentSearch, inspectNativeQuery } from "./search-workbench.tsx";

const quickSearchStyles = new WeakMap<HTMLFormElement, HTMLStyleElement>();

/** Keep the editor stylesheet outside the Solid render tree and avoid repeated injection. */
function ensureQuickSearchStyles(form: HTMLFormElement) {
  let style = quickSearchStyles.get(form);
  if (style?.isConnected) return;
  style = form.ownerDocument.createElement("style");
  style.dataset.rodxQuickSearch = "true";
  style.textContent = extractedCSS1;
  form.prepend(style);
  quickSearchStyles.set(form, style);
}

export let QuickUI;

export function initializeDeckQuickUI() {
  QuickUI = (() => {
    let floating, listInfo;
    const authorOf = (article) => {
      const identity = article.querySelector(XDOM.author);
      if (!identity) return "";
      const link = [...identity.querySelectorAll(DOM_SELECTORS.relativeLinks)].find((anchor) =>
        /^\/[A-Za-z0-9_]{1,15}\/?$/.test(anchor.getAttribute("href") || ""),
      );
      return link?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1] || "";
    };
    // This editor reuses the Search Deck's highlightQuery/diagnosticSpans implementation.
    // Suggestions inspect the complete query, not only a trailing `list:` token.
    function search(query = "") {
      const form = (<form />) as HTMLFormElement;
      form.className = "rodx-quick-search";
      mountView(form, () => (
        <>
          {"\n            "}

          {"\n            "}
          <div class={"rxq-editor"}>
            {"\n              "}
            <pre class={"rxq-syntax"} data-rxq={"syntax"} aria-hidden={"true"}></pre>
            {"\n              "}
            <textarea
              class={"rxq-input"}
              data-rxq={"input"}
              name={"q"}
              spellcheck={"false"}
              autocapitalize={"off"}
              autocomplete={"off"}
              rows={"3"}
              aria-label={"Pesquisa com destaque de sintaxe e sugestões"}
              aria-autocomplete={"list"}
              aria-controls={"rodx-quick-suggestions"}
              placeholder={"Pesquise usando termos, list:, filtros, hashtags, AND/OR…"}
            ></textarea>
            {"\n            "}
          </div>
          {"\n            "}
          <small class={"rxq-message"} data-rxq={"message"} role={"status"} aria-live={"polite"}></small>
          {"\n            "}
          <div
            class={"rxq-suggestions"}
            id={"rodx-quick-suggestions"}
            data-rxq={"suggestions"}
            role={"listbox"}
            aria-label={"Sugestões da pesquisa"}
          ></div>
          {"\n            "}
          <div class={"rxq-tools"} data-rxq={"tools"}>
            {"\n              "}
            <button type={"button"} data-rxq-action={"copy"}>
              {"Copiar query"}
            </button>
            {"\n              "}
            <button type={"button"} data-rxq-action={"clear"}>
              {"Limpar"}
            </button>
            {"\n              "}
            <button type={"button"} data-rxq-action={"lists"}>
              {"Minhas listas"}
            </button>
            {"\n              "}
            <button type={"submit"} data-rxq={"submit"}>
              {"Pesquisar"}
            </button>
            {"\n            "}
          </div>
          {"\n          "}
        </>
      ));
      ensureQuickSearchStyles(form);
      const input = form.querySelector<HTMLInputElement>(RODX_SELECTORS.queryWorkbenchInput);
      const syntax = form.querySelector<HTMLElement>(RODX_SELECTORS.queryWorkbenchSyntax);
      const message = form.querySelector<HTMLElement>(RODX_SELECTORS.queryWorkbenchMessage);
      const submit = form.querySelector<HTMLElement>(RODX_SELECTORS.queryWorkbenchSubmit);
      const suggestionBox = form.querySelector<HTMLElement>(RODX_SELECTORS.queryWorkbenchSuggestions);
      const initial = query || (location.pathname === "/search" ? currentSearch()?.query : "") || "";
      input.value = initial;
      let rows = [];
      let selected = -1;
      let sequence = 0;
      let refreshTimer = 0;
      let closed = false;
      let preservedCursor = input.value.length;

      const normalize = (value) =>
        String(value || "")
          .toLocaleLowerCase("pt-BR")
          .trim();
      const hasOpenQuote = (value, end) => {
        let open = false;
        let escaped = false;
        for (let i = 0; i < end; i++) {
          const c = value[i];
          if (escaped) escaped = false;
          else if (c === "\\") escaped = true;
          else if (c === '"') open = !open;
        }
        return open;
      };
      const listTokenAtCursor = (value, cursor) => {
        const pattern = /(^|[\s(])(-?list:)([^\s()]*)/gi;
        let match;
        while ((match = pattern.exec(value))) {
          const start = match.index + match[1].length;
          const end = start + match[2].length + match[3].length;
          if (cursor >= start && cursor <= end && !hasOpenQuote(value, start)) {
            return { start, end, prefix: match[2], partial: match[3] };
          }
        }
        return null;
      };
      const wordAtCursor = (value, cursor) => {
        const boundary = /[\s()]/;
        let start = cursor;
        let end = cursor;
        while (start > 0 && !boundary.test(value[start - 1])) start--;
        while (end < value.length && !boundary.test(value[end])) end++;
        return { start, end, value: value.slice(start, end) };
      };
      const insertAt = (text, start, end) => {
        input.setRangeText(text, start, end, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        preservedCursor = input.selectionStart ?? input.value.length;
        input.focus();
      };
      const applySuggestion = (row) => {
        if (!row) return;
        const value = input.value;
        const cursor = preservedCursor;
        const list = listTokenAtCursor(value, cursor);
        if (row.kind === "full" || row.kind === "history") {
          input.value = row.query;
          input.setSelectionRange(row.query.length, row.query.length);
          preservedCursor = row.query.length;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
          return;
        }
        if (row.kind === "list") {
          if (list) {
            insertAt(`${list.prefix}${row.id}`, list.start, list.end);
          } else {
            const gap = value.length && !/\s$/.test(value) ? " " : "";
            insertAt(`${gap}list:${row.id}`, value.length, value.length);
          }
          return;
        }
        const word = wordAtCursor(value, cursor);
        if (word.value) insertAt(row.query, word.start, word.end);
        else insertAt(`${value && !/\s$/.test(value) ? " " : ""}${row.query}`, cursor, cursor);
      };
      const matchesFullQuery = (label, value, query) => {
        if (!query) return true;
        const terms = query.split(/\s+/).filter(Boolean);
        const content = normalize(`${label} ${value}`);
        return content.includes(query) || terms.every((term) => content.includes(term));
      };
      async function suggestions() {
        const stamp = ++sequence;
        const value = input.value;
        const cursor = input.selectionStart ?? value.length;
        const token = listTokenAtCursor(value, cursor);
        const word = wordAtCursor(value, cursor).value;
        const searchText = normalize(value);
        const partial = normalize(token?.partial || word);
        const candidates = [];
        const add = (item) => {
          if (item?.query || item?.id) candidates.push(item);
        };
        for (const item of state.searches || []) {
          if (matchesFullQuery(item.name, item.query, searchText)) {
            add({
              kind: "full",
              query: item.query,
              label: item.name || item.query,
              detail: `Busca salva${item.pinned ? " · fixada" : ""} · ${item.query}`,
              weight: item.pinned ? 180 : 130,
            });
          }
        }
        for (const item of state.presets || []) {
          if (matchesFullQuery(item.name, item.query, searchText)) {
            add({
              kind: "full",
              query: item.query,
              label: item.name || item.query,
              detail: `Preset · ${item.query}`,
              weight: 120,
            });
          }
        }
        const allLists = Studio.services.lists?.all() || [];
        for (const item of allLists) {
          const display = Studio.services.lists.displayName(item);
          const eligible = token
            ? !partial || normalize(`${display} ${item.id}`).includes(partial)
            : !searchText ||
              (searchText.length < 50 && normalize(`${display} ${item.id}`).includes(searchText)) ||
              (/^list:/i.test(word) &&
                normalize(`${display} ${item.id}`).includes(partial.replace(/^list:/, "")));
          if (eligible) {
            add({
              kind: "list",
              id: String(item.id),
              query: `list:${item.id}`,
              label: `${display}`,
              detail: `Lista · ID ${item.id} · inserir sem apagar outros filtros`,
              weight: token ? 220 : 75,
            });
          }
        }
        const filters = [
          "filter:native_video",
          "filter:images",
          "filter:media",
          "-filter:retweets",
          "-filter:replies",
          "filter:links",
          "filter:verified",
          "filter:follows",
          "lang:pt",
          "lang:en",
          "since:",
          "until:",
          "from:",
          "to:",
          "AND",
          "OR",
          "NOT",
        ];
        const counts = new Map<any, any>();
        for (const saved of state.searches || []) {
          for (const tag of String(saved.query || "").match(/#[\p{L}\p{M}\p{N}_]+/gu) || []) {
            counts.set(tag, (counts.get(tag) || 0) + 1);
          }
        }
        const snippets = [
          ...filters,
          ...[...counts]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 18)
            .map(([tag]) => tag),
        ];
        for (const option of snippets) {
          if (!partial || normalize(option).includes(partial) || (partial === "#" && option[0] === "#")) {
            add({
              kind: "token",
              query: option,
              label: option,
              detail: option.startsWith("#") ? "Hashtag frequente" : "Operador nativo do X",
              weight: 50,
            });
          }
        }
        try {
          // A bounded, read-only IndexedDB query. No full-history scan on every keypress.
          const account = state.account || extractIdentity().key || "guest";
          const page = await SearchHistory.exportPage(account, 0, 60);
          if (stamp !== sequence || closed) return;
          for (const item of page.rows || []) {
            if (matchesFullQuery("", item.query, searchText)) {
              add({
                kind: "history",
                query: item.query,
                label: item.query,
                detail: `Recente · ${item.count || 1} uso(s)`,
                weight: 100,
              });
            }
          }
        } catch {
          // Safari private browsing may block IndexedDB. Other suggestions remain usable.
        }
        if (stamp !== sequence || closed) return;
        const seen = new Set<any>();
        const quotas = token
          ? { list: 11, full: 2, history: 1, token: 2 }
          : { list: 5, full: 5, history: 3, token: 3 };
        const countByKind = { list: 0, full: 0, history: 0, token: 0 };
        rows = candidates
          .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label, "pt-BR"))
          .filter((item) => {
            const key = `${item.kind}:${item.query || item.id}`;
            if (seen.has(key) || countByKind[item.kind] >= quotas[item.kind]) return false;
            seen.add(key);
            countByKind[item.kind]++;
            return true;
          })
          .slice(0, 16);
        selected = -1;
        renderSuggestions();
      }
      function renderSuggestions() {
        suggestionBox.replaceChildren();
        suggestionBox.hidden = rows.length === 0;
        rows.forEach((row, index) => {
          const option = (<button />) as HTMLButtonElement;
          option.type = "button";
          option.className = "rxq-option";
          option.setAttribute("role", "option");
          option.id = `rodx-rxq-option-${index}`;
          option.setAttribute("aria-selected", String(index === selected));
          const title = (<strong />) as HTMLElement;
          const detail = (<small />) as HTMLElement;
          title.textContent = row.label;
          detail.textContent = row.detail;
          option.append(title, detail);
          option.addEventListener("pointerdown", (event) => {
            if (event.pointerType !== "touch") event.preventDefault();
          });
          option.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            applySuggestion(row);
          };
          suggestionBox.append(option);
        });
        input.setAttribute("aria-expanded", String(Boolean(rows.length)));
      }
      function validate() {
        const value = input.value;
        input.style.setProperty("height", "auto", "important");
        input.style.setProperty(
          "height",
          `${Math.min(Math.max(112, input.scrollHeight), innerHeight * 0.4)}px`,
          "important",
        );
        syntax.style.setProperty("height", input.style.height, "important");
        mountView(syntax, () => [highlightWithIssues(value, diagnosticSpans(value)), "\n"]);
        syntax.scrollTop = input.scrollTop;
        const diagnostic = inspectNativeQuery(value);
        const issue = diagnosticSpans(value).find((item) => item.severity === "error");
        const error = issue?.message || (diagnostic.level === "error" ? diagnostic.message : "");
        message.textContent =
          error ||
          (value.trim()
            ? "Sugestões consideram a pesquisa inteira; toque numa lista para inserir seu ID."
            : "Buscas salvas, presets, listas, recentes, filtros e hashtags aparecem aqui.");
        message.dataset.level = error ? "error" : "info";
        (submit as HTMLButtonElement).disabled = Boolean(error || !value.trim());
      }
      function queueSuggestions() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(
          () => void suggestions(),
          RUNTIME_LIMITS.uiQuickActions.queueSuggestionsDelayMs,
        );
      }
      const captureCursor = () => {
        preservedCursor = input.selectionStart ?? input.value.length;
      };
      input.addEventListener("input", () => {
        captureCursor();
        validate();
        queueSuggestions();
      });
      input.addEventListener("click", () => {
        captureCursor();
        queueSuggestions();
      });
      input.addEventListener("select", captureCursor);
      input.addEventListener("keyup", (event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          captureCursor();
          queueSuggestions();
        }
      });
      input.addEventListener(
        "scroll",
        () => {
          syntax.scrollTop = input.scrollTop;
          syntax.scrollLeft = input.scrollLeft;
        },
        { passive: true },
      );
      input.addEventListener("keydown", (event) => {
        if (event.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (!rows.length) return;
          event.preventDefault();
          event.stopPropagation();
          selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
          renderSuggestions();
          suggestionBox
            .querySelector<HTMLElement>(DOM_SELECTORS.selectedItems)
            ?.scrollIntoView({ block: "nearest" });
        } else if (event.key === "Enter" && !event.shiftKey && selected >= 0 && rows[selected]) {
          event.preventDefault();
          event.stopPropagation();
          applySuggestion(rows[selected]);
        } else if (event.key === "Escape" && rows.length) {
          event.preventDefault();
          event.stopPropagation();
          rows = [];
          renderSuggestions();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener("click", async (event) => {
        const action = (
          (event.target as HTMLElement).closest(RODX_SELECTORS.queryWorkbenchActions) as HTMLElement
        )?.dataset.rxqAction;
        if (!action) return;
        event.preventDefault();
        if (action === "copy") {
          await navigator.clipboard.writeText(input.value);
        } else if (action === "clear") {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
        } else if (action === "lists") {
          rows = (Studio.services.lists?.all() || [])
            .map((item) => ({
              kind: "list",
              id: String(item.id),
              query: `list:${item.id}`,
              label: Studio.services.lists.displayName(item),
              detail: `Lista · ID ${item.id} · inserir na pesquisa`,
              weight: 200,
            }))
            .slice(0, 50);
          selected = -1;
          renderSuggestions();
          input.focus();
        }
      });
      const handle = Studio.menu.open({
        id: "rodx-floating-search",
        title: "Pesquisar no X",
        presentation: "bottom-sheet",
        size: "lg",
        store: { persist: false },
        fields: [{ type: "custom", name: "query", chrome: "bare", render: () => form }],
        actions: [
          {
            id: "settings",
            label: "Posição e tamanho",
            validate: false,
            close: true,
            handler: () => settings(),
          },
          { id: "close", label: "Fechar", role: "cancel" },
        ],
      });
      void handle.result.finally(() => {
        closed = true;
        clearTimeout(refreshTimer);
        ++sequence;
        rows = [];
      });
      form.onsubmit = (event) => {
        event.preventDefault();
        validate();
        if ((submit as HTMLButtonElement).disabled) return;
        const full = input.value.trim();
        handle.close();
        void SearchHistory.record(full, "floating", "live");
        void SearchAnchors.nativeSearch(full);
      };
      validate();
      void suggestions();
      queueMicrotask(() => input.focus());
    }
    function settings() {
      const c = Studio.config.searchButton || {};
      Studio.menu.open({
        title: "Botão de pesquisa",
        fields: [
          { type: "number", name: "size", label: "Tamanho (px)", min: 36, max: 80, value: c.size || 48 },
          { type: "number", name: "x", label: "Distância à esquerda (px)", value: c.x ?? 12 },
          {
            type: "number",
            name: "y",
            label: "Distância ao topo (px)",
            value: c.y ?? Math.max(80, innerHeight - 170),
          },
        ],
        actions: [
          {
            id: "save",
            label: "Salvar",
            role: "submit",
            handler: (ctx) => {
              Studio.configure({ searchButton: ctx.values });
              position();
            },
          },
          { id: "close", label: "Fechar", role: "cancel" },
        ],
      });
    }
    function position() {
      if (!floating) return;
      const c = Studio.config.searchButton || {},
        size = Math.max(36, Math.min(80, Number(c.size) || 48));
      const viewport = window.visualViewport;
      const availableHeight = viewport ? viewport.height + viewport.offsetTop : innerHeight;
      const margin = 8;
      const left = Math.max(margin, Math.min(innerWidth - size - margin, Number(c.x ?? 12)));
      const top = Math.max(60, Math.min(availableHeight - size - 76, Number(c.y ?? availableHeight - 170)));
      applyComponentStyle(floating, "rx-quick-actions-floating", false);
      floating.style.setProperty("--rodx-anchor-left", String(left) + "px", "important");
      floating.style.setProperty("--rodx-anchor-top", String(top) + "px", "important");
      floating.style.setProperty("--rodx-anchor-width", String(size) + "px", "important");
      floating.style.setProperty("--rodx-anchor-height", String(size) + "px", "important");
    }
    function scan() {
      if (!floating) {
        floating = (<button />) as HTMLButtonElement;
        floating.id = "rodx-floating-search";
        floating.type = "button";
        floating.textContent = "⌕";
        floating.setAttribute("aria-label", "Pesquisar: toque para abrir, arraste para mover");
        let press,
          moved = false;
        floating.onpointerdown = (e) => {
          e.preventDefault();
          press = { x: e.clientX, y: e.clientY, left: floating.offsetLeft, top: floating.offsetTop };
          moved = false;
          floating.setPointerCapture?.(e.pointerId);
        };
        floating.onpointermove = (e) => {
          if (!press) return;
          const dx = e.clientX - press.x,
            dy = e.clientY - press.y;
          if (Math.hypot(dx, dy) > 7) moved = true;
          if (moved) {
            e.preventDefault();
            floating.style.setProperty(
              "left",
              Math.max(0, Math.min(innerWidth - floating.offsetWidth, press.left + dx)) + "px",
              "important",
            );
            floating.style.setProperty(
              "top",
              Math.max(0, Math.min(innerHeight - floating.offsetHeight - 60, press.top + dy)) + "px",
              "important",
            );
          }
        };
        floating.onpointerup = () => {
          if (moved)
            Studio.configure({
              searchButton: {
                ...Studio.config.searchButton,
                x: parseFloat(floating.style.left),
                y: parseFloat(floating.style.top),
              },
            });
          press = null;
        };
        floating.onpointercancel = () => {
          press = null;
          moved = true;
        };
        floating.onclick = () => {
          if (!moved) search();
          moved = false;
        };
        document.body.append(floating);
        position();
        if (!document.getElementById("rodx-quick-actions-page-css")) {
          const style = document.createElement("style");
          style.id = "rodx-quick-actions-page-css";
          style.textContent = extractedCSS2;
          document.head.append(style);
        }
        window.addEventListener("resize", position, { passive: true });
        window.visualViewport?.addEventListener("resize", position, { passive: true });
        window.visualViewport?.addEventListener("scroll", position, { passive: true });
      }
      for (const article of Studio.dom.nodes(XDOM.tweet)) {
        const bar = article.querySelector(RODX_SELECTORS.tweetTopbar);
        if (!bar) continue;
        let button = bar.querySelector(RODX_SELECTORS.addToListAction);
        if (!button) {
          button = (<button />) as HTMLButtonElement;
          button.type = "button";
          button.dataset.rodxAddList = "1";
          button.textContent = "☷";
          button.title = "Adicionar autor à lista";
          button.setAttribute("aria-label", "Adicionar autor à lista");
          button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const user = authorOf(article);
            if (user) void Studio.services.lists?.picker(user, button);
          };
          bar.append(button);
        }
      }
      const id = location.pathname.match(/\/(?:[\w]{1,15}\/)?lists\/(\d+)/)?.[1];
      if (!id) {
        listInfo?.remove();
        listInfo = null;
      } else {
        const main =
          document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn) ||
          document.querySelector<HTMLElement>(DOM_SELECTORS.mainElement);
        if (main && (!listInfo || listInfo.dataset.id !== id)) {
          listInfo?.remove();
          listInfo = (<div />) as HTMLDivElement;
          listInfo.dataset.id = id;
          listInfo.id = "rodx-list-id";
          applyComponentStyle(listInfo, "rx-quick-actions-listInfo", false);
          const text = (<span />) as HTMLSpanElement;
          text.textContent = "ID: " + id;
          const name = (<strong />) as HTMLElement;
          name.dataset.rodxLiveName = "1";
          const found = Studio.services.lists?.all().find((item) => item.id === id);
          name.textContent = found ? Studio.services.lists.displayName(found) : `lista ${id}`;
          const copy = (<button />) as HTMLButtonElement;
          copy.textContent = "Copiar";
          copy.onclick = async () => {
            try {
              await navigator.clipboard.writeText(id);
              copy.textContent = "Copiado";
            } catch {
              copy.textContent = "Não foi possível copiar";
            }
          };
          const refreshName = (<button />) as HTMLButtonElement;
          refreshName.textContent = "↻ Atualizar nome";
          refreshName.onclick = async () => {
            refreshName.disabled = true;
            refreshName.textContent = "Atualizando…";
            try {
              await Studio.services.lists?.editName(id, true);
            } finally {
              refreshName.disabled = false;
              refreshName.textContent = "↻ Atualizar nome";
            }
          };
          const videos = (<button />) as HTMLButtonElement;
          videos.textContent = "Ver vídeos";
          videos.onclick = () => SearchAnchors.nativeSearch("list:" + id + " filter:native_video");
          listInfo.append(name, text, copy, refreshName, videos);
          main.prepend(listInfo);
        }
      }
      if (listInfo?.isConnected && listInfo.dataset.id === id) {
        const row = Studio.services.lists?.all().find((item) => item.id === id);
        const name = row ? Studio.services.lists.displayName(row) : `lista ${id}`;
        const currentName = listInfo.querySelector(RODX_SELECTORS.liveListName);
        if (currentName && currentName.textContent !== name) currentName.textContent = name;
      }
      for (const a of document.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.listLinks)) {
        if (a.closest(RODX_SELECTORS.ownedTimelineContainers)) continue;
        const id = (a as HTMLAnchorElement).pathname.match(/\/lists\/(\d+)/)?.[1];
        if (
          a.nextElementSibling?.hasAttribute("data-rodx-list-video") &&
          (a.nextElementSibling as HTMLElement).dataset.rodxListVideo !== id
        )
          a.nextElementSibling.remove();
        if (!id || (a.nextElementSibling as HTMLElement)?.dataset.rodxListVideo === id) continue;
        const b = (<button />) as HTMLButtonElement;
        b.type = "button";
        b.textContent = "▷ Vídeos";
        b.dataset.rodxListVideo = id;
        applyComponentStyle(b, "rx-quick-actions-b", false);
        b.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          void SearchAnchors.nativeSearch("list:" + id + " filter:native_video");
        };
        a.after(b);
      }
    }
    Studio.register("ui.quick-actions", scan, {
      minMs: RUNTIME_LIMITS.uiQuickActions.initializeDeckQuickUIMinMs,
    });
    return { search };
  })();
}
