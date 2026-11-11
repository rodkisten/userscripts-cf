import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import { NATIVE_X_SELECTORS } from "../../../selectors.js";
import { XDOM } from "../platform/selectors.js";
import { NativeQueryTags } from "../search/native-tags.js";
import { QueryEngine } from "../search/query-compiler.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/account.js";
import { showRodxToast } from "./toast.tsx";

export let SelectionPopover;

export function initializeDeckSelectionPopover() {
  SelectionPopover = (() => {
    let picked = "",
      node = null,
      last = 0;
    const close = () => {
      node?.remove();
      node = null;
    };
    const parse = (value) => {
      const raw = String(value || "")
        .replace(/\s+/gu, " ")
        .trim();
      if (!raw || raw.length > 500) return "";
      const braced = /^\{([\s\S]+)\}$/.exec(raw);
      const content = braced ? braced[1].trim() : raw;
      if (!content) return "";
      // Preserve the COMPLETE selected phrase, not just the first word.
      // {any text} explicitly requests an exact phrase.
      const quoted = /^"[\s\S]*"$/.test(content);
      const singleTag = /^#[\p{L}\p{M}\p{N}_]+$/u.test(content);
      const singleWord = /^[\p{L}\p{M}\p{N}_-]+$/u.test(content);
      if (singleTag || (singleWord && !braced) || (quoted && !braced)) return content;
      return '"' + content.replace(/^"|"$/g, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    };
    const show = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return close();
      const ancestor = selection.anchorNode?.parentElement;
      const focus = selection.focusNode?.parentElement;
      const firstText = ancestor?.closest(NATIVE_X_SELECTORS.nativeTweetText);
      const lastText = focus?.closest(NATIVE_X_SELECTORS.nativeTweetText);
      const firstTweet = firstText?.closest(XDOM.tweet);
      if (!firstTweet || firstTweet !== lastText?.closest(XDOM.tweet)) {
        return close();
      }
      const term = parse(selection.toString());
      if (!term) return close();
      let rect;
      try {
        rect = selection.getRangeAt(0).getBoundingClientRect();
      } catch {
        return;
      }
      if (!rect.width && !rect.height) return;
      picked = term;
      close();
      node = (<div />) as HTMLDivElement;
      node.id = "rodx-selection-popover";
      const caption = (<span />) as HTMLSpanElement;
      caption.className = "rodx-selection-caption";
      caption.textContent = term;
      node.append(caption);
      for (const [label, title, act] of [
        ["+", "Adicionar à busca", "add"],
        ["−", "Excluir da busca", "exclude"],
        ["☆", "Guardar na lista", "list"],
      ]) {
        const b = (<button />) as HTMLButtonElement;
        b.type = "button";
        b.textContent = label;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.addEventListener("pointerdown", (e) => e.preventDefault());
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (act === "list") {
            const key = term.toLocaleLowerCase();
            if (!state.selectionList.some((x) => x.toLocaleLowerCase() === key)) {
              state.selectionList.push(term);
              void saveState().catch((error) => showRodxToast(error.message, "error"));
            }
            showRodxToast("Seleção guardada nesta conta.");
          } else if (term.startsWith("#"))
            NativeQueryTags.modify(term, act === "exclude" ? "exclude" : "add");
          else {
            const raw = NativeQueryTags.current();
            const without = raw.trim();
            let changed;
            try {
              changed = QueryEngine.termChange(without, term, act === "exclude" ? "exclude" : "add");
            } catch (error) {
              showRodxToast(error.message, "error");
              return;
            }
            const native = document.querySelector<HTMLInputElement>(NATIVE_X_SELECTORS.nativeSearchInput);
            if (native) NativeQueryTags.write(QueryEngine.normalized(changed));
            else showRodxToast("Abra a busca para adicionar a palavra.");
          }
          close();
          // Prevent a delayed pointerup / selectionchange from reopening the
          // popover after a command has already consumed the selected text.
          window.getSelection()?.removeAllRanges();
        });
        node.append(b);
      }
      document.body.append(node);
      const x = Math.max(
        10,
        Math.min(
          window.innerWidth - node.offsetWidth - 10,
          rect.left + rect.width / 2 - node.offsetWidth / 2,
        ),
      );
      const y = Math.max(
        10,
        Math.min(window.innerHeight - node.offsetHeight - 10, rect.top - node.offsetHeight - 8),
      );
      node.style.setProperty("left", x + "px", "important");
      node.style.setProperty("top", y + "px", "important");
    };
    document.addEventListener(
      "selectionchange",
      () => {
        last = Date.now();
        if (!node) setTimeout(show, RUNTIME_LIMITS.uiSelection.showDelayMs);
      },
      true,
    );
    document.addEventListener(
      "pointerup",
      () => setTimeout(show, RUNTIME_LIMITS.selection.pointerReleaseDelayMs),
      true,
    );
    document.addEventListener(
      "touchend",
      () => setTimeout(show, RUNTIME_LIMITS.selection.touchReleaseDelayMs),
      true,
    );
    document.addEventListener("scroll", close, true);
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (node && !node.contains(e.target) && Date.now() - last > 80) close();
      },
      true,
    );
    return Object.freeze({
      close,
    });
  })();
}
