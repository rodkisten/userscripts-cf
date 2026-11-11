import { CSS_SELECTORS } from "../../../selectors.js";
import { nativeSearch } from "../feeds/local-limits.js";
import { QueryEngine } from "./query-compiler.js";
import { ResultEnhancer } from "../tweets/enhancer.js";
import { showRodxToast } from "../ui/toast.js";

export let NativeQueryTags;

export function initializeDeckNativeQueryTags() {
  NativeQueryTags = (() => {
    const pending = [];
    const input = () => document.querySelector(CSS_SELECTORS.s203);
    const current = () => input()?.value || nativeSearch()?.query || "";
    const set = (value) => {
      const field = input();
      if (!field) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(field, value);
      else field.value = value;
      try {
        field.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertReplacementText",
            data: value,
          }),
        );
      } catch {
        field.dispatchEvent(
          new Event("input", {
            bubbles: true,
          }),
        );
      }
      field.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      );
      return true;
    };
    const route = () => {
      const nav = document.querySelector(CSS_SELECTORS.s204);
      if (nav) nav.click();
      else showRodxToast("Abra a busca do X para editar as hashtags.", "info");
    };
    const modify = (words, mode = "add") => {
      const values = Array.isArray(words) ? words : [words];
      try {
        if (!input()) {
          pending.push({
            words: values,
            mode,
            at: Date.now(),
          });
          route();
          return;
        }
        const next = QueryEngine.batch(current(), values, mode);
        if (next !== current()) set(next);
        ResultEnhancer.syncTags();
        showRodxToast(
          mode === "exclude"
            ? `${values.length} termo(s) excluído(s) da busca`
            : `${values.length} termo(s) adicionado(s) com OR`,
        );
      } catch (error) {
        showRodxToast(error.message, "error");
      }
    };
    const flush = () => {
      if (!input()) return;
      for (const item of pending.splice(0)) if (Date.now() - item.at < 16000) modify(item.words, item.mode);
    };
    document.addEventListener(
      "input",
      (event) => {
        if (event.target === input()) ResultEnhancer.syncTags();
      },
      true,
    );
    // Paste auto-composition applies ONLY to hashtag-only sequences, never normal text.
    document.addEventListener(
      "paste",
      (event) => {
        const field = input();
        if (!field || event.target !== field) return;
        const raw = event.clipboardData?.getData("text/plain") || "";
        const tags = QueryEngine.tags(raw, false);
        if (tags.length < 2) return;
        event.preventDefault();
        modify(tags, "add");
      },
      true,
    );
    return Object.freeze({
      current,
      modify,
      flush,
      write: set,
    });
  })();
}
