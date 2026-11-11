import { cssDeclarations } from "../../../core/css.js";
import dynamicCSS from "../../../styles/dynamic-list-typeahead.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-search-list-typeahead-1.css?inline";
export function installListTypeahead(Studio) {
  let host,
    root,
    field,
    start = 0,
    end = 0,
    choices = [],
    index = 0;
  function close() {
    if (host) host.hidden = true;
    field = null;
  }
  function choose(row) {
    if (!field || !row) return;
    const input = field,
      value = input.value;
    const next = value.slice(0, start) + "list:" + row.id + value.slice(end);
    Object.getOwnPropertyDescriptor(
      input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value",
    ).set.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const cursor = start + 5 + row.id.length;
    input.focus();
    input.setSelectionRange(cursor, cursor);
    close();
  }
  function render(input) {
    const cursor = input.selectionStart ?? input.value.length;
    const re = /\blist:([^\s()]*)/gi;
    let match, token;
    while ((match = re.exec(input.value))) {
      if (cursor >= match.index + 5 && cursor <= re.lastIndex) {
        token = match;
        break;
      }
    }
    if (!token) {
      close();
      return;
    }
    field = input;
    start = token.index;
    end = token.index + token[0].length;
    const raw = token[1].toLocaleLowerCase();
    const term = (Studio.services.lists?.all() || []).some((row) => row.id === raw) ? "" : raw;
    choices = (Studio.services.lists?.all() || [])
      .filter(
        (row) =>
          row.id.includes(term) ||
          String(Studio.services.lists.displayName(row) || "")
            .toLocaleLowerCase()
            .includes(term),
      )
      .slice(0, 30);
    index = 0;
    if (!host) {
      host = document.createElement("div");
      host.id = "rodx-list-typeahead";
      root = host.attachShadow({ mode: "open" });
      document.body.append(host);
    }
    const r = input.getBoundingClientRect();
    host.style.cssText = cssDeclarations(dynamicCSS);
    host.style.setProperty("--rodx-value-1", String(Math.max(4, r.left)) + "px");
    host.style.setProperty("--rodx-value-2", String(Math.min(innerHeight - 100, r.bottom + 4)) + "px");
    host.style.setProperty("--rodx-value-3", String(Math.min(r.width, innerWidth - 8)) + "px");

    host.hidden = false;
    root.innerHTML = `
        <style>${extractedCSS1}</style>
        <div role="listbox"></div>
      `;
    const list = root.querySelector(CSS_SELECTORS.divElements);
    choices.forEach((row, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(i === index));
      button.textContent = Studio.services.lists.displayName(row) + " · " + row.id;
      button.onpointerdown = (e) => {
        e.preventDefault();
        choose(row);
      };
      list.append(button);
    });
    if (!choices.length) list.textContent = "Nenhuma lista local. Abra suas Listas para sincronizar.";
  }
  const isSearch = (el) =>
    el?.matches?.(CSS_SELECTORS.searchQueryFields) && !el.closest?.(CSS_SELECTORS.quickSearchButton);
  document.addEventListener(
    "input",
    (e) => {
      const input = e.composedPath().find(isSearch);
      if (input) render(input);
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const input = e.composedPath().find(isSearch);
      if (input) render(input);
      else if (e.target !== host) close();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (!e.composedPath().includes(field) || host?.hidden) return;
      if (e.key === "Escape") {
        close();
        return;
      }
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        index =
          (index + (e.key === "ArrowDown" ? 1 : -1) + Math.max(1, choices.length)) %
          Math.max(1, choices.length);
        root
          .querySelectorAll(CSS_SELECTORS.buttons)
          .forEach((b, i) => b.setAttribute("aria-selected", String(i === index)));
      }
      if (e.key === "Enter" && choices.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(choices[index]);
      }
    },
    true,
  );
  window.addEventListener("scroll", close, { passive: true });
  document.addEventListener("rodx:route", close);
}
