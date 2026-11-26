import { mountView } from "../ui/runtime.tsx";
import { RUNTIME_LIMITS } from "../../../config/runtime.js";
import BookmarkSVGIcon from "../../../assets/icons/bookmark.svg?component";
import {
  DOM_SELECTORS,
  NATIVE_X_SELECTORS,
  RODX_SELECTORS,
  COMPOSITE_SELECTORS,
} from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-tweets-enhancer-1.css?inline";
import { Studio } from "../core/studio-runtime.js";
import { currentFullQuery, nativeSearch } from "../feeds/local-limits.js";
import { compileLocalRule, parseLocalDirectives } from "../feeds/local-rules.js";
import { NATIVE_X_SELECTORS as XDOM } from "../../../selectors.js";
import { NativeQueryTags } from "../search/native-tags.js";
import { state } from "../state/deck.js";
import { ForeignTags } from "../translation/foreign-tags.tsx";
import { Seen } from "./seen.js";
import { showRodxToast } from "../ui/runtime.tsx";

// ============================================================================
// Constantes Semânticas e Mensagens
// ============================================================================
const SELECTORS_IDS = {
  resultsStyle: "rodx-results-css",
} as const;

const CSS_CLASSES = {
  resultActions: "rodx-result-actions",
  nativeOnlyTags: "rodx-native-only-tags",
  nativeTagTail: "rodx-native-tag-tail",
  nativeTagSource: "rodx-native-tag-source",
  hashtagsTray: "rodx-hashtags",
  hashtagItem: "rodx-hashtag-item",
  tagAdd: "rodx-tag-add",
  tagExclude: "rodx-tag-exclude",
  bookmarkBtn: "rodx-bookmark-btn",
} as const;

const DATA_ATTRS = {
  seen: "rodx-read",
  observed: "rodx-rodxObserved",
  unmatched: "rodx-unmatched",
  limited: "rodx-limited",
  tight: "rodx-tight",
  expand: "1",
  readBtn: "1",
  selected: "selected",
  excluded: "excluded",
  color: "color",
  tag: "tag",
  signature: "signature",
  read: "seen",
} as const;

const SORT_MODES = {
  live: "live",
  top: "top",
} as const;

const UI_TEXTS = {
  seenMark: "✓",
  seenUnmark: "◦",
  seenTitleMark: "Marcar como visto",
  seenTitleUnmark: "Marcar como não visto",
  expandSymbol: "↗",
  expandTitle: "Expandir e abrir tweet",
  hashtagsAriaLabel: "Hashtags do post",
  bookmarkTitle: "Salvar nos Itens salvos do X",
  bookmarkMenuError: "O X não mostrou o menu deste post",
  toastAnchorError: "Não foi possível localizar o link nativo deste post.",
  filterErrorLog: "[RodX] Filtro local inválido. Não esconder posts:",
} as const;

const REGEX_PATTERNS = {
  uid: /\/status\/(\d{5,25})(?:\/|\?|$)/,
  positiveHashtag: /(?<![\w#-])#[\p{L}\p{M}\p{N}_]+/gu,
  negativeHashtag: /-#[\p{L}\p{M}\p{N}_]+/gu,
  hashtagOnly: /^(?:\s*#[\\p{L}\\p{M}\\p{N}_]+[\s,;]*)+$/u,
  hashtagMulti: /(?:#[\\p{L}\\p{M}\\p{N}_]+[\s,;]+){1,}#[\\p{L}\\p{M}\\p{N}_]+/u,
  bookmarkMenuMatch:
    /^(?:bookmark|save to bookmarks|salvar nos itens salvos|adicionar aos itens salvos|remove bookmark|remover dos itens salvos|remover marcador)/i,
  bookmarkTestIdMatch: /^(?:bookmark|removeBookmark)$/,
} as const;

export interface HashtagInfo {
  tag: string;
  href: string;
}

export interface ReadProgress {
  id: string;
  account: string;
  started: number;
  qualified: boolean;
}

export interface ResultEnhancerAPI {
  scan(force?: boolean): void;
  syncTags(): void;
}

export type ResultEnhancerController = ResultEnhancerAPI | undefined;

export let ResultEnhancer: ResultEnhancerController;

export function initializeDeckResultEnhancer(): void {
  ResultEnhancer = (() => {
    let style: HTMLStyleElement | null = null;
    let cachedSig = "";
    let rules: unknown[] = [];

    function postId(article: HTMLElement): string {
      const link =
        article
          .querySelector<HTMLAnchorElement>(DOM_SELECTORS.timestamps)
          ?.closest(NATIVE_X_SELECTORS.statusLinks) ||
        article.querySelector<HTMLAnchorElement>(NATIVE_X_SELECTORS.statusLinks);
      return link?.getAttribute("href")?.match(REGEX_PATTERNS.uid)?.[1] || "";
    }

    function ensureStyle(): void {
      if (style?.isConnected) {
        return;
      }
      style = document.createElement("style");
      style.id = SELECTORS_IDS.resultsStyle;
      style.textContent = extractedCSS1;
      (document.head || document.documentElement).append(style);
    }

    function currentRules(): unknown[] {
      const full = currentFullQuery();
      if (cachedSig !== full) {
        cachedSig = full;
        rules = [];
        try {
          rules = parseLocalDirectives(full).local.map(compileLocalRule);
        } catch (err) {
          console.warn(UI_TEXTS.filterErrorLog, err);
          rules = [];
        }
      }
      return rules;
    }

    function seenButtonText(article: HTMLElement, id: string): void {
      const btn = article.querySelector<HTMLElement>(
        RODX_SELECTORS.resultReadButtonByActionClass(CSS_CLASSES.resultActions),
      );
      if (btn) {
        const read = state.seen.has(id);
        btn.textContent = read ? UI_TEXTS.seenMark : UI_TEXTS.seenUnmark;
        btn.dataset[DATA_ATTRS.seen] = read ? "1" : "0";
        btn.title = read ? UI_TEXTS.seenTitleUnmark : UI_TEXTS.seenTitleMark;
        btn.setAttribute("aria-label", btn.title);
      }
    }

    function normalizedTag(tag: string): string {
      return String(tag || "")
        .normalize("NFKC")
        .replace(/^#/, "")
        .toLocaleLowerCase();
    }

    function nativeQueryInput(): HTMLInputElement | null {
      return document.querySelector<HTMLInputElement>(NATIVE_X_SELECTORS.nestedNativeSearchInput);
    }

    function nativeQueryText(): string {
      const input = nativeQueryInput();
      return input ? input.value : nativeSearch()?.query || "";
    }

    function queryHashtags(): { positive: Set<string>; negative: Set<string> } {
      const source = nativeQueryText();
      return {
        positive: new Set((source.match(REGEX_PATTERNS.positiveHashtag) || []).map(normalizedTag)),
        negative: new Set(
          (source.match(REGEX_PATTERNS.negativeHashtag) || []).map((v) => normalizedTag(v.slice(1))),
        ),
      };
    }

    function appendToNativeSearch(tag: string, mode: "add" | "exclude" = "add"): boolean {
      NativeQueryTags.modify(tag, mode);
      return true;
    }

    function flushPendingNativeTags(): void {
      NativeQueryTags.flush();
    }

    function findActions(article: HTMLElement): HTMLElement | null {
      const reply = article.querySelector(COMPOSITE_SELECTORS.replyButton);
      const retweet = article.querySelector(NATIVE_X_SELECTORS.retweetToggleButtons);
      const share = article.querySelector(NATIVE_X_SELECTORS.shareButton);
      return (reply || retweet || share)?.closest<HTMLElement>(DOM_SELECTORS.actionGroups) || null;
    }

    function collectHashtags(article: HTMLElement): HashtagInfo[] {
      const text = article.querySelector(NATIVE_X_SELECTORS.nativeTweetText);
      if (!text) {
        return [];
      }
      const found = new Map<string, HashtagInfo>();

      for (const anchor of text.querySelectorAll(NATIVE_X_SELECTORS.encodedHashtagLinks)) {
        const t = (anchor.textContent || "").trim().match(/#[\p{L}\p{N}_]+/u)?.[0];
        if (t && !found.has(normalizedTag(t))) {
          found.set(normalizedTag(t), {
            tag: t,
            href: anchor.getAttribute("href") || "",
          });
        }
      }

      for (const t of text.textContent?.match(/#[\p{L}\p{N}_]+/gu) || []) {
        const key = normalizedTag(t);
        if (!found.has(key)) {
          found.set(key, {
            tag: t,
            href: "/search?q=" + encodeURIComponent(t) + "&src=typed_query",
          });
        }
      }
      return Array.from(found.values());
    }

    function removeOldInlineButtons(article: HTMLElement): void {
      for (const old of article.querySelectorAll(RODX_SELECTORS.externalTagAddButtons)) {
        old.remove();
      }
    }

    function refreshAllHashtagStates(): void {
      const { positive, negative } = queryHashtags();
      for (const item of document.querySelectorAll<HTMLElement>(RODX_SELECTORS.hashtagItems)) {
        const tagAttr = item.dataset.tag;
        if (!tagAttr) {
          continue;
        }
        const id = normalizedTag(tagAttr);
        const yes = positive.has(id);
        const no = negative.has(id);

        item.dataset.selected = yes ? "1" : "0";
        item.dataset.excluded = no ? "1" : "0";
        item.dataset.color = state.visual.colorfulTags && !yes && !no ? "1" : "0";

        const add = item.querySelector<HTMLElement>(RODX_SELECTORS.tagAddButton);
        if (add) {
          add.hidden = yes;
        }

        const remove = item.querySelector<HTMLElement>(RODX_SELECTORS.tagExcludeButton);
        if (remove) {
          remove.hidden = no;
        }
      }
    }

    function suppressNativeHashtagList(article: HTMLElement, tags: HashtagInfo[]): void {
      const text = article.querySelector<HTMLElement>(NATIVE_X_SELECTORS.nativeTweetText);
      if (!text) {
        return;
      }

      text.classList.remove(CSS_CLASSES.nativeOnlyTags);
      for (const node of text.querySelectorAll(RODX_SELECTORS.nativeTagArtifacts)) {
        node.classList.remove(CSS_CLASSES.nativeTagTail, CSS_CLASSES.nativeTagSource);
      }
      if (tags.length < 2) {
        return;
      }

      const onlyTags = REGEX_PATTERNS.hashtagOnly;
      const multi = REGEX_PATTERNS.hashtagMulti;
      const full = (text.innerText || text.textContent || "").trim();

      if (onlyTags.test(full)) {
        text.classList.add(CSS_CLASSES.nativeOnlyTags);
        return;
      }

      const candidates = Array.from(
        text.querySelectorAll<HTMLElement>(DOM_SELECTORS.textContainers),
      ).reverse();
      for (const node of candidates) {
        if (node.classList.contains(CSS_CLASSES.nativeTagSource)) {
          continue;
        }
        if (node.closest(RODX_SELECTORS.nativeTagSource)) {
          continue;
        }
        const value = (node.innerText || node.textContent || "").trim();
        if (!value || !onlyTags.test(value) || !multi.test(value)) {
          continue;
        }
        const parent = node.parentElement;
        if (
          parent &&
          parent !== text &&
          onlyTags.test((parent.innerText || parent.textContent || "").trim())
        ) {
          continue;
        }
        node.classList.add(CSS_CLASSES.nativeTagSource);
      }

      const lines = (text.innerText || text.textContent || "").split(/\n+/);
      const listLines = lines.filter((line) => onlyTags.test(line.trim()) && multi.test(line.trim()));
      if (!listLines.length) {
        return;
      }

      const wanted = new Set(
        listLines
          .flatMap((line) => line.match(/#[\p{L}\p{M}\p{N}_]+/gu) || [])
          .map((tag) => tag.normalize("NFKC").toLocaleLowerCase()),
      );

      for (const anchor of text.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.hashtagLinks)) {
        if (anchor.closest(RODX_SELECTORS.nativeTagSource)) {
          continue;
        }
        const anchorText = anchor.textContent || "";
        const tag = anchorText.trim().normalize("NFKC").toLocaleLowerCase();
        if (!wanted.has(tag)) {
          continue;
        }

        const parentText = (anchor.parentElement?.textContent || "").trim();
        if (parentText && !onlyTags.test(parentText) && /[\p{L}\p{N}]/u.test(parentText.replace(tag, ""))) {
          continue;
        }
        anchor.classList.add(CSS_CLASSES.nativeTagSource);
      }

      const breaks = Array.from(text.querySelectorAll<HTMLElement>(DOM_SELECTORS.lineBreaks));
      for (const source of text.querySelectorAll<HTMLElement>(RODX_SELECTORS.nativeTagSource)) {
        let previous: ChildNode | null = source.previousSibling;
        let steps = 0;
        while (previous && steps++ < 5) {
          if (previous.nodeType === Node.TEXT_NODE && !(previous.textContent || "").trim()) {
            previous = previous.previousSibling;
            continue;
          }
          if (previous.nodeType === Node.ELEMENT_NODE && (previous as HTMLElement).tagName === "BR") {
            (previous as HTMLElement).classList.add(CSS_CLASSES.nativeTagTail);
            previous = previous.previousSibling;
            continue;
          }
          break;
        }
      }

      for (const br of breaks.slice(-2)) {
        const following = (br.nextSibling?.textContent || "").trim();
        if (following && onlyTags.test(following)) {
          br.classList.add(CSS_CLASSES.nativeTagTail);
        }
      }
    }

    function addHashtagBtns(article: HTMLElement): void {
      removeOldInlineButtons(article);
      const tags = collectHashtags(article);
      let tray = article.querySelector<HTMLDivElement>(RODX_SELECTORS.scopedHashtagContainer);
      if (!tags.length) {
        tray?.remove();
        return;
      }

      const actions = findActions(article);
      if (!tray) {
        tray = document.createElement("div");
        tray.className = CSS_CLASSES.hashtagsTray;
        tray.setAttribute("aria-label", UI_TEXTS.hashtagsAriaLabel);
      }

      if (actions?.parentElement) {
        if (tray.parentElement !== actions.parentElement || tray.nextElementSibling !== actions) {
          actions.before(tray);
        }
      } else if (!tray.isConnected) {
        article.append(tray);
      }

      const signature = tags.map(({ tag }) => normalizedTag(tag)).join("|");
      if (tray.dataset.signature !== signature) {
        tray.replaceChildren();
        tray.dataset.signature = signature;
        for (const { tag, href } of tags) {
          const item = document.createElement("span");
          item.className = CSS_CLASSES.hashtagItem;
          item.dataset.tag = tag;
          const link = document.createElement("a");
          link.href = href || "/search?q=" + encodeURIComponent(tag);
          link.textContent = tag;
          item.append(link);
          for (const [mode, symbol, className, title] of [
            ["include", "+", CSS_CLASSES.tagAdd, `Adicionar ${tag} à pesquisa nativa`],
            ["exclude", "−", CSS_CLASSES.tagExclude, `Excluir ${tag} da pesquisa`],
          ] as const) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = className;
            button.title = title;
            button.setAttribute("aria-label", title);
            button.textContent = symbol;
            button.addEventListener("click", (event: MouseEvent) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              if (mode === "exclude") {
                appendToNativeSearch(tag, "exclude");
              } else {
                appendToNativeSearch(tag);
              }
            });
            item.append(button);
          }

          tray.append(item);
        }
      }

      if (state.visual.translateForeignTags) {
        ForeignTags.scan(tray);
      } else {
        for (const item of tray.querySelectorAll<HTMLElement>(RODX_SELECTORS.hashtagItems)) {
          item.hidden = false;
          item.querySelector(RODX_SELECTORS.tagTranslation)?.remove();
        }
      }

      suppressNativeHashtagList(article, tags);
      refreshAllHashtagStates();
    }

    function ensureBookmark(article: HTMLElement): void {
      const group = findActions(article);
      if (!group) {
        return;
      }
      const native = group.querySelector<HTMLElement>(NATIVE_X_SELECTORS.bookmarkToggleButtons);
      const visibleNative =
        native && native.getClientRects().length && getComputedStyle(native).display !== "none";
      const existing = group.querySelector<HTMLElement>(RODX_SELECTORS.bookmarkButton);

      if (visibleNative) {
        existing?.remove();
        return;
      }
      if (existing) {
        return;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = CSS_CLASSES.bookmarkBtn;
      btn.title = UI_TEXTS.bookmarkTitle;
      btn.setAttribute("aria-label", UI_TEXTS.bookmarkTitle);
      btn.addEventListener("click", (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const menuButton =
          article.querySelector<HTMLElement>(NATIVE_X_SELECTORS.tweetCaret) ||
          article.querySelector<HTMLElement>(DOM_SELECTORS.localizedMoreButtons);

        if (!menuButton) {
          btn.title = UI_TEXTS.bookmarkMenuError;
          return;
        }

        let observer: MutationObserver | null = null;
        let timeout: ReturnType<typeof setTimeout> | null = null;
        let committed = false;

        const finish = (): void => {
          observer?.disconnect();
          if (timeout !== null) {
            clearTimeout(timeout);
          }
        };

        const choose = (): void => {
          if (committed) {
            return;
          }
          const options = Array.from(
            document.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.bookmarkMenuItems),
          ).filter((el) => !article.contains(el) && el.getClientRects().length > 0);

          const target =
            options.find((el) => REGEX_PATTERNS.bookmarkMenuMatch.test((el.textContent || "").trim())) ||
            options.find((el) => REGEX_PATTERNS.bookmarkTestIdMatch.test(el.dataset.testid || ""));

          if (!target) {
            return;
          }
          committed = true;
          finish();
          target.click();
        };

        observer = new MutationObserver(choose);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
        timeout = setTimeout(finish, RUNTIME_LIMITS.tweetsEnhancer.finishDelayMs);
        menuButton.click();
        setTimeout(choose, 0);
      });

      mountView(btn, () => <BookmarkSVGIcon />);

      const share = group.querySelector<HTMLElement>(NATIVE_X_SELECTORS.shareButton);
      if (share?.parentElement?.parentElement === group) {
        share.parentElement.before(btn);
      } else {
        group.append(btn);
      }
    }

    function setSeen(article: HTMLElement, id: string): void {
      seenButtonText(article, id);
      article.dataset[DATA_ATTRS.seen] = state.seen.has(id) ? "1" : "0";
    }

    function setupReader(): void {
      if (state.readObserver || document.visibilityState !== "visible") {
        return;
      }
      const getHeight = (): number => window.innerHeight || document.documentElement.clientHeight;

      function fullyOutside(rect: DOMRectReadOnly): boolean {
        const viewportHeight = getHeight();
        return rect.bottom <= 0 || rect.top >= viewportHeight;
      }

      function sufficientlyVisible(rect: DOMRectReadOnly, visiblePixels: number, ratio: number): boolean {
        return ratio >= state.visual.viewedThreshold || (rect.height > 440 && visiblePixels >= 220);
      }

      function pause(article: HTMLElement, progress: ReadProgress): void {
        const timer = state.readTimers.get(article);
        if (timer != null) {
          clearTimeout(timer);
        }
        state.readTimers.delete(article);
        progress.started = 0;
      }

      function valid(progress: ReadProgress, article: HTMLElement): boolean {
        const timelineCell = article.closest<HTMLElement>(NATIVE_X_SELECTORS.timelineCells);
        return (
          progress.account === state.account &&
          progress.id === postId(article) &&
          article.isConnected &&
          document.visibilityState === "visible" &&
          document.body.classList.contains("rodx-search-page") &&
          timelineCell?.style.display !== "none"
        );
      }

      state.readObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const article = entry.target as HTMLElement;
            const id = postId(article);
            if (!id) {
              continue;
            }

            let progress = state.readProgress.get(article) as ReadProgress | undefined;
            if (!progress || progress.id !== id || progress.account !== state.account) {
              if (progress) {
                pause(article, progress);
              }
              progress = {
                id,
                account: state.account,
                started: 0,
                qualified: false,
              };
              state.readProgress.set(article, progress);
            }

            if (state.seen.has(id) || !valid(progress, article)) {
              pause(article, progress);
              continue;
            }

            const rect = entry.boundingClientRect;
            if (!entry.isIntersecting && fullyOutside(rect)) {
              if (progress.qualified) {
                Seen.mark(id);
                setSeen(article, id);
              }
              pause(article, progress);
              progress.qualified = false;
              continue;
            }

            if (progress.qualified) {
              continue;
            }
            if (
              !entry.isIntersecting ||
              !sufficientlyVisible(rect, entry.intersectionRect.height, entry.intersectionRatio)
            ) {
              pause(article, progress);
              continue;
            }

            if (progress.started) {
              continue;
            }
            progress.started = performance.now();
            const delay = state.visual.seenDelayMs;

            const timer = setTimeout(() => {
              state.readTimers.delete(article);
              if (!valid(progress!, article)) {
                progress!.started = 0;
                return;
              }

              const nowRect = article.getBoundingClientRect();
              const intersectionHeight = Math.max(
                0,
                Math.min(nowRect.bottom, getHeight()) - Math.max(0, nowRect.top),
              );
              const ratio = nowRect.height ? intersectionHeight / nowRect.height : 0;
              if (!sufficientlyVisible(nowRect, intersectionHeight, ratio)) {
                progress!.started = 0;
                return;
              }
              progress!.qualified = true;
            }, delay);

            state.readTimers.set(article, timer);
          }
        },
        {
          threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.65, 0.75, 0.9, 1],
        },
      );

      if (!state.readVisibilityHandlerInstalled) {
        state.readVisibilityHandlerInstalled = true;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            return;
          }
          state.readTimers.forEach(clearTimeout);
          state.readTimers.clear();
          state.readObserver?.disconnect();
          state.readObserver = null;
          state.readProgress = new WeakMap<HTMLElement, ReadProgress>();
          document.querySelectorAll<HTMLElement>(RODX_SELECTORS.observedElements).forEach((article) => {
            delete article.dataset.rodxObserved;
          });
        });
      }
    }

    function scan(_force: boolean = false): void {
      flushPendingNativeTags();
      const current = nativeSearch();
      ensureStyle();

      document.body?.classList.toggle(
        "rodx-search-page",
        Boolean(current && [SORT_MODES.live, SORT_MODES.top].includes(current.sort as any)),
      );

      if (!current || ![SORT_MODES.live, SORT_MODES.top].includes(current.sort as any)) {
        for (const article of Studio.dom.nodes(XDOM.tweet)) {
          if (!(article instanceof HTMLElement)) {
            continue;
          }
          article.style.setProperty("--rodx-font", state.visual.font + "px", "important");
          article.style.setProperty("--rodx-dense", String(state.visual.density), "important");
          article.dataset.rodxTight = state.visual.density < 0.9 ? "1" : "0";
          addHashtagBtns(article);
          ensureBookmark(article);
        }
        return;
      }

      ensureStyle();
      setupReader();
      const local = currentRules();
      const main = document.querySelector<HTMLElement>(NATIVE_X_SELECTORS.primaryColumn);
      if (!main) {
        return;
      }

      const matches = main.querySelectorAll<HTMLElement>(NATIVE_X_SELECTORS.nativeTweets);
      for (const article of matches) {
        const id = postId(article);
        if (!id) {
          continue;
        }
        const cell = article.closest<HTMLElement>(NATIVE_X_SELECTORS.timelineCells) || article;

        if (cell.dataset.rodxUnmatched === "1" || cell.dataset.rodxLimited === "1") {
          cell.style.removeProperty("display");
        }

        delete cell.dataset.rodxUnmatched;
        delete cell.dataset.rodxLimited;

        article.style.setProperty("--rodx-font", state.visual.font + "px", "important");
        article.style.setProperty("--rodx-dense", String(state.visual.density), "important");
        article.dataset.rodxTight = state.visual.density < 0.9 ? "1" : "0";

        setSeen(article, id);
        addHashtagBtns(article);
        ensureBookmark(article);

        let actions = article.querySelector<HTMLDivElement>(
          DOM_SELECTORS.resultActionsByClass(CSS_CLASSES.resultActions),
        );
        if (!actions) {
          actions = document.createElement("div");
          actions.className = CSS_CLASSES.resultActions;
          const expand = document.createElement("button");
          expand.type = "button";
          expand.dataset.rodxExpand = DATA_ATTRS.expand;
          expand.textContent = UI_TEXTS.expandSymbol;
          expand.addEventListener("click", (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const anchor =
              article
                .querySelector<HTMLElement>(DOM_SELECTORS.timestamps)
                ?.closest<HTMLElement>(NATIVE_X_SELECTORS.statusLinks) ||
              article.querySelector<HTMLElement>(NATIVE_X_SELECTORS.statusLinks);

            if (!anchor) {
              showRodxToast(UI_TEXTS.toastAnchorError, "error");
              return;
            }
            anchor.click();
          });
          const read = document.createElement("button");
          read.type = "button";
          read.dataset.rodxReadBtn = DATA_ATTRS.readBtn;
          read.addEventListener("click", (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (state.seen.has(id)) {
              state.seen.delete(id);
            } else {
              state.seen.set(id, Date.now());
            }
            Seen.flushSoon?.();
            setSeen(article, id);
          });
          actions.append(expand, read);

          const nativeActions = findActions(article);
          if (nativeActions) {
            nativeActions.append(actions);
          } else {
            actions.hidden = true;
            article.append(actions);
          }
        }

        const targetActions = findActions(article);
        if (targetActions && actions.parentElement !== targetActions) {
          actions.hidden = false;
          targetActions.append(actions);
        }

        const exp = actions.querySelector<HTMLElement>(RODX_SELECTORS.expandAction);
        if (exp) {
          exp.textContent = UI_TEXTS.expandSymbol;
          exp.title = UI_TEXTS.expandTitle;
          exp.setAttribute("aria-label", exp.title);
        }

        if (state.readObserver && article.dataset.rodxObserved !== "1") {
          state.readObserver.observe(article);
          article.dataset.rodxObserved = "1";
        }
      }
    }

    return Object.freeze({
      scan,
      syncTags: refreshAllHashtagStates,
    });
  })();
}
