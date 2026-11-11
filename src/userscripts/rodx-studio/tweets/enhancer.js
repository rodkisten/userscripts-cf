import {
  DOM_SELECTORS,
  NATIVE_X_SELECTORS,
  RODX_SELECTORS,
  COMPOSITE_SELECTORS,
} from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-tweets-enhancer-1.css?inline";
import { Studio } from "../core/studio.js";
import { currentFullQuery, nativeSearch } from "../feeds/local-limits.js";
import { compileLocalRule, parseLocalDirectives } from "../feeds/local-rules.js";
import { XDOM } from "../platform/selectors.js";
import { NativeQueryTags } from "../search/native-tags.js";
import { state } from "../state/deck.js";
import { ForeignTags } from "../translation/foreign-tags.js";
import { Seen } from "./seen.js";
import { showRodxToast } from "../ui/toast.js";

export let ResultEnhancer;

export function initializeDeckResultEnhancer() {
  ResultEnhancer = (() => {
    let style = null,
      cachedSig = "",
      rules = [];
    const UID_RE = /\/status\/(\d{5,25})(?:\/|\?|$)/;
    const actionClass = "rodx-result-actions";
    function postId(article) {
      const link =
        article.querySelector(DOM_SELECTORS.timestamps)?.closest(NATIVE_X_SELECTORS.statusLinks) ||
        article.querySelector(NATIVE_X_SELECTORS.statusLinks);
      return link?.getAttribute("href")?.match(UID_RE)?.[1] || "";
    }
    function ensureStyle() {
      if (style?.isConnected) return;
      style = document.createElement("style");
      style.id = "rodx-results-css";
      style.textContent = extractedCSS1;
      (document.head || document.documentElement).append(style);
    }
    function currentRules() {
      const full = currentFullQuery();
      if (cachedSig !== full) {
        cachedSig = full;
        rules = [];
        try {
          rules = parseLocalDirectives(full).local.map(compileLocalRule);
        } catch (err) {
          console.warn("[RodX] Filtro local inválido. Não esconder posts:", err);
          rules = [];
        }
      }
      return rules;
    }
    function seenButtonText(article, id) {
      const btn = article.querySelector(RODX_SELECTORS.resultReadButtonByActionClass(actionClass));
      if (btn) {
        const read = state.seen.has(id);
        btn.textContent = read ? "✓" : "◦";
        btn.dataset.seen = read ? "1" : "0";
        btn.title = read ? "Marcar como não visto" : "Marcar como visto";
        btn.setAttribute("aria-label", btn.title);
      }
    }
    function normalizedTag(tag) {
      return String(tag || "")
        .normalize("NFKC")
        .replace(/^#/, "")
        .toLocaleLowerCase();
    }
    function nativeQueryInput() {
      return document.querySelector(NATIVE_X_SELECTORS.nestedNativeSearchInput);
    }
    function nativeQueryText() {
      const input = nativeQueryInput();
      return input ? input.value : nativeSearch()?.query || "";
    }
    function queryHashtags() {
      const source = nativeQueryText();
      return {
        positive: new Set((source.match(/(?<![\w#-])#[\p{L}\p{M}\p{N}_]+/gu) || []).map(normalizedTag)),
        negative: new Set(
          (source.match(/-#[\p{L}\p{M}\p{N}_]+/gu) || []).map((v) => normalizedTag(v.slice(1))),
        ),
      };
    }
    function appendToNativeSearch(tag, mode = "add") {
      NativeQueryTags.modify(tag, mode);
      return true;
    }
    function flushPendingNativeTags() {
      NativeQueryTags.flush();
    }
    function findActions(article) {
      const reply = article.querySelector(COMPOSITE_SELECTORS.replyButton);
      const retweet = article.querySelector(NATIVE_X_SELECTORS.retweetToggleButtons);
      const share = article.querySelector(NATIVE_X_SELECTORS.shareButton);
      return (reply || retweet || share)?.closest(DOM_SELECTORS.actionGroups) || null;
    }
    function collectHashtags(article) {
      const text = article.querySelector(NATIVE_X_SELECTORS.nativeTweetText);
      if (!text) return [];
      const found = new Map();
      for (const anchor of text.querySelectorAll(NATIVE_X_SELECTORS.encodedHashtagLinks)) {
        const t = (anchor.textContent || "").trim().match(/#[\p{L}\p{N}_]+/u)?.[0];
        if (t && !found.has(normalizedTag(t)))
          found.set(normalizedTag(t), {
            tag: t,
            href: anchor.getAttribute("href"),
          });
      }
      // Also recognize nonlinked hashtags in text spans, not only X's anchors.
      for (const t of text.textContent?.match(/#[\p{L}\p{N}_]+/gu) || []) {
        const key = normalizedTag(t);
        if (!found.has(key))
          found.set(key, {
            tag: t,
            href: "/search?q=" + encodeURIComponent(t) + "&src=typed_query",
          });
      }
      return [...found.values()];
    }
    function removeOldInlineButtons(article) {
      for (const old of article.querySelectorAll(RODX_SELECTORS.externalTagAddButtons)) old.remove();
    }
    function refreshAllHashtagStates() {
      const { positive, negative } = queryHashtags();
      for (const item of document.querySelectorAll(RODX_SELECTORS.hashtagItems)) {
        const id = normalizedTag(item.dataset.tag);
        const yes = positive.has(id),
          no = negative.has(id);
        item.dataset.selected = yes ? "1" : "0";
        item.dataset.excluded = no ? "1" : "0";
        item.dataset.color = state.visual.colorfulTags && !yes && !no ? "1" : "0";
        const add = item.querySelector(RODX_SELECTORS.tagAddButton);
        if (add) add.hidden = yes;
        const remove = item.querySelector(RODX_SELECTORS.tagExcludeButton);
        if (remove) remove.hidden = no;
      }
    }
    function suppressNativeHashtagList(article, tags) {
      const text = article.querySelector(NATIVE_X_SELECTORS.nativeTweetText);
      if (!text) return;
      // No destructive textContent/innerHTML edits on React-controlled X nodes.
      // Recompute on each scan so recycled posts don't keep stale CSS classes.
      text.classList.remove("rodx-native-only-tags");
      for (const node of text.querySelectorAll(RODX_SELECTORS.nativeTagArtifacts)) {
        node.classList.remove("rodx-native-tag-tail", "rodx-native-tag-source");
      }
      if (tags.length < 2) return;
      const HASH = "#[\\p{L}\\p{M}\\p{N}_]+";
      const onlyTags = new RegExp("^(?:\\s*" + HASH + "[\\s,;]*)+$", "u");
      const multi = new RegExp("(?:" + HASH + "[\\s,;]+){1,}" + HASH, "u");
      const full = (text.innerText || text.textContent || "").trim();
      if (onlyTags.test(full)) {
        text.classList.add("rodx-native-only-tags");
        return;
      }

      // Hide discrete hashtag-only DOM subtrees first (including when X wraps
      // several tags in a single span). An inline hashtag between words remains.
      const candidates = [...text.querySelectorAll(DOM_SELECTORS.textContainers)].reverse();
      for (const node of candidates) {
        if (node.classList.contains("rodx-native-tag-source")) continue;
        if (node.closest(RODX_SELECTORS.nativeTagSource)) continue;
        const value = (node.innerText || node.textContent || "").trim();
        if (!value || !onlyTags.test(value) || !multi.test(value)) continue;
        const parent = node.parentElement;
        if (parent && parent !== text && onlyTags.test((parent.innerText || parent.textContent || "").trim()))
          continue;
        node.classList.add("rodx-native-tag-source");
      }
      // X also renders hashtag runs as sibling anchors. Suppress only a link
      // that's part of an isolated multi-tag run, not an in-sentence tag.
      const lines = (text.innerText || text.textContent || "").split(/\n+/);
      const listLines = lines.filter((line) => onlyTags.test(line.trim()) && multi.test(line.trim()));
      if (!listLines.length) return;
      const wanted = new Set(
        listLines
          .flatMap((line) => line.match(/#[\p{L}\p{M}\p{N}_]+/gu) || [])
          .map((tag) => tag.normalize("NFKC").toLocaleLowerCase()),
      );
      for (const anchor of text.querySelectorAll(NATIVE_X_SELECTORS.hashtagLinks)) {
        if (anchor.closest(RODX_SELECTORS.nativeTagSource)) continue;
        const tag = anchor.textContent.trim().normalize("NFKC").toLocaleLowerCase();
        if (!wanted.has(tag)) continue;
        // A parent containing regular text marks a sentence; never hide it.
        const parentText = (anchor.parentElement?.textContent || "").trim();
        if (parentText && !onlyTags.test(parentText) && /[\p{L}\p{N}]/u.test(parentText.replace(tag, "")))
          continue;
        anchor.classList.add("rodx-native-tag-source");
      }
      // Remove visible line breaks directly before a trailing tag-only block.
      // This prevents the empty two-line gap seen on iOS when hashes moved.
      const breaks = [...text.querySelectorAll(DOM_SELECTORS.lineBreaks)];
      for (const source of text.querySelectorAll(RODX_SELECTORS.nativeTagSource)) {
        let previous = source.previousSibling;
        let steps = 0;
        while (previous && steps++ < 5) {
          if (previous.nodeType === Node.TEXT_NODE && !(previous.textContent || "").trim()) {
            previous = previous.previousSibling;
            continue;
          }
          if (previous.nodeType === Node.ELEMENT_NODE && previous.tagName === "BR") {
            previous.classList.add("rodx-native-tag-tail");
            previous = previous.previousSibling;
            continue;
          }
          break;
        }
      }
      for (const br of breaks.slice(-2)) {
        const following = (br.nextSibling?.textContent || "").trim();
        if (following && onlyTags.test(following)) br.classList.add("rodx-native-tag-tail");
      }
    }
    function addHashtagBtns(article) {
      removeOldInlineButtons(article);
      const tags = collectHashtags(article);
      let tray = article.querySelector(RODX_SELECTORS.scopedHashtagContainer);
      if (!tags.length) {
        tray?.remove();
        return;
      }
      const actions = findActions(article);
      if (!tray) {
        tray = document.createElement("div");
        tray.className = "rodx-hashtags";
        tray.setAttribute("aria-label", "Hashtags do post");
      }
      // Always place *after* the media and *before* the action toolbar.
      // The native group shares the media's content column on X desktop/mobile.
      if (actions?.parentElement) {
        if (tray.parentElement !== actions.parentElement || tray.nextElementSibling !== actions)
          actions.before(tray);
      } else if (!tray.isConnected) article.append(tray);
      const signature = tags.map(({ tag }) => normalizedTag(tag)).join("|");
      if (tray.dataset.signature !== signature) {
        tray.replaceChildren();
        tray.dataset.signature = signature;
        for (const { tag, href } of tags) {
          const item = document.createElement("span");
          item.className = "rodx-hashtag-item";
          item.dataset.tag = tag;
          const link = document.createElement("a");
          link.href = href || "/search?q=" + encodeURIComponent(tag);
          link.textContent = tag;
          const plus = document.createElement("button");
          plus.type = "button";
          plus.className = "rodx-tag-add";
          plus.textContent = "+";
          plus.title = `Adicionar ${tag} à pesquisa nativa`;
          plus.setAttribute("aria-label", `Adicionar ${tag} à pesquisa nativa`);
          plus.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            appendToNativeSearch(tag);
          });
          const minus = document.createElement("button");
          minus.type = "button";
          minus.className = "rodx-tag-exclude";
          minus.textContent = "−";
          minus.title = `Excluir ${tag} da pesquisa`;
          minus.setAttribute("aria-label", minus.title);
          minus.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            appendToNativeSearch(tag, "exclude");
          });
          item.append(link, plus, minus);
          tray.append(item);
        }
      }
      if (state.visual.translateForeignTags) ForeignTags.scan(tray);
      else
        for (const item of tray.querySelectorAll(RODX_SELECTORS.hashtagItems)) {
          item.hidden = false;
          item.querySelector(RODX_SELECTORS.tagTranslation)?.remove();
        }
      suppressNativeHashtagList(article, tags);
      refreshAllHashtagStates();
    }
    // Preserve the bookmark action in the native toolbar. On X layouts that
    // remove it, offer a small fallback using X's own action menu (no private API).
    function ensureBookmark(article) {
      const group = findActions(article);
      if (!group) return;
      const native = group.querySelector(NATIVE_X_SELECTORS.bookmarkToggleButtons);
      const visibleNative =
        native && native.getClientRects().length && getComputedStyle(native).display !== "none";
      const existing = group.querySelector(RODX_SELECTORS.bookmarkButton);
      if (visibleNative) {
        existing?.remove();
        return;
      }
      if (existing) return;
      const btn = document.createElement("button");
      btn.className = "rodx-bookmark-btn";
      btn.type = "button";
      btn.title = "Salvar nos Itens salvos do X";
      btn.setAttribute("aria-label", btn.title);
      btn.innerHTML =
        '<svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.8A1.8 1.8 0 0 1 7.8 2h8.4A1.8 1.8 0 0 1 18 3.8V22l-6-4-6 4V3.8Z"/></svg>';
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const menuButton =
          article.querySelector(NATIVE_X_SELECTORS.tweetCaret) ||
          article.querySelector(DOM_SELECTORS.localizedMoreButtons);
        if (!menuButton) {
          btn.title = "O X não mostrou o menu deste post";
          return;
        }
        let observer = null;
        let timeout = null;
        let committed = false;
        const finish = () => {
          observer?.disconnect();
          clearTimeout(timeout);
        };
        const choose = () => {
          if (committed) return;
          const options = [...document.querySelectorAll(NATIVE_X_SELECTORS.bookmarkMenuItems)].filter(
            (el) => !article.contains(el) && el.getClientRects().length > 0,
          );
          const target =
            options.find((el) =>
              /^(?:bookmark|save to bookmarks|salvar nos itens salvos|adicionar aos itens salvos|remove bookmark|remover dos itens salvos|remover marcador)/i.test(
                (el.textContent || "").trim(),
              ),
            ) || options.find((el) => /^(?:bookmark|removeBookmark)$/.test(el.dataset.testid || ""));
          if (!target) return;
          committed = true;
          finish();
          target.click();
        };
        observer = new MutationObserver(choose);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
        timeout = setTimeout(finish, 1400);
        menuButton.click();
        setTimeout(choose, 0);
      });
      const share = group.querySelector(NATIVE_X_SELECTORS.shareButton);
      if (share?.parentElement?.parentElement === group) share.parentElement.before(btn);
      else group.append(btn);
    }
    function setSeen(article, id) {
      seenButtonText(article, id);
      article.dataset.rodxRead = state.seen.has(id) ? "1" : "0";
    }
    // A post is seen only after BOTH conditions hold:
    // (1) meaningful continuous exposure for the configured delay, and
    // (2) a subsequent complete viewport exit. There is no mark-on-timeout.
    function setupReader() {
      if (state.readObserver || document.visibilityState !== "visible") return;
      const getHeight = () => window.innerHeight || document.documentElement.clientHeight;
      function fullyOutside(rect) {
        const viewportHeight = getHeight();
        return rect.bottom <= 0 || rect.top >= viewportHeight;
      }
      function sufficientlyVisible(rect, visiblePixels, ratio) {
        return ratio >= state.visual.viewedThreshold || (rect.height > 440 && visiblePixels >= 220);
      }
      function pause(article, progress) {
        const timer = state.readTimers.get(article);
        if (timer != null) clearTimeout(timer);
        state.readTimers.delete(article);
        progress.started = 0;
      }
      function valid(progress, article) {
        return (
          progress.account === state.account &&
          progress.id === postId(article) &&
          article.isConnected &&
          document.visibilityState === "visible" &&
          document.body.classList.contains("rodx-search-page") &&
          article.closest(NATIVE_X_SELECTORS.timelineCells)?.style.display !== "none"
        );
      }
      state.readObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const article = entry.target;
            const id = postId(article);
            if (!id) continue;
            let progress = state.readProgress.get(article);
            if (!progress || progress.id !== id || progress.account !== state.account) {
              if (progress) pause(article, progress);
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
              // Mark only after the article has completely exited. No partial
              // departure or fast swipe may register as a read.
              if (progress.qualified) {
                Seen.mark(id);
                setSeen(article, id);
              }
              pause(article, progress);
              progress.qualified = false;
              continue;
            }
            if (progress.qualified) continue; // wait until complete exit
            if (
              !entry.isIntersecting ||
              !sufficientlyVisible(rect, entry.intersectionRect.height, entry.intersectionRatio)
            ) {
              pause(article, progress);
              continue;
            }
            if (progress.started) continue; // do not restart on every ratio change
            progress.started = performance.now();
            const delay = state.visual.seenDelayMs;
            const timer = setTimeout(() => {
              state.readTimers.delete(article);
              if (!valid(progress, article)) {
                progress.started = 0;
                return;
              }
              const nowRect = article.getBoundingClientRect();
              const intersectionHeight = Math.max(
                0,
                Math.min(nowRect.bottom, getHeight()) - Math.max(0, nowRect.top),
              );
              const ratio = nowRect.height ? intersectionHeight / nowRect.height : 0;
              if (!sufficientlyVisible(nowRect, intersectionHeight, ratio)) {
                progress.started = 0;
                return;
              }
              // Eligible for marking later. Do not persist yet.
              progress.qualified = true;
            }, delay);
            state.readTimers.set(article, timer);
          }
        },
        {
          threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.65, 0.75, 0.9, 1],
        },
      );
      // Backgrounding Safari must invalidate in-flight reading sessions.
      if (!state.readVisibilityHandlerInstalled) {
        state.readVisibilityHandlerInstalled = true;
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") return;
          state.readTimers.forEach(clearTimeout);
          state.readTimers.clear();
          state.readObserver?.disconnect();
          state.readObserver = null;
          state.readProgress = new WeakMap();
          document.querySelectorAll(RODX_SELECTORS.observedElements).forEach((article) => {
            delete article.dataset.rodxObserved;
          });
        });
      }
    }
    function scan(force = false) {
      flushPendingNativeTags();
      const current = nativeSearch();
      ensureStyle();
      document.body?.classList.toggle(
        "rodx-search-page",
        Boolean(current && ["live", "top"].includes(current.sort)),
      );
      // The + action is useful on Home, profiles and search alike; appearance,
      // seen-state and filtering remain restricted to search results.
      if (!current || !["live", "top"].includes(current.sort)) {
        for (const article of Studio.dom.nodes(XDOM.tweet)) {
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
      const main = document.querySelector(NATIVE_X_SELECTORS.primaryColumn);
      if (!main) return;
      const matches = main.querySelectorAll(NATIVE_X_SELECTORS.nativeTweets);
      for (const article of matches) {
        const id = postId(article);
        if (!id) continue;
        const cell = article.closest(NATIVE_X_SELECTORS.timelineCells) || article;
        // Query patterns, seen filters and limits run before X renders the response.
        if (cell.dataset.rodxUnmatched === "1" || cell.dataset.rodxLimited === "1")
          cell.style.removeProperty("display");
        delete cell.dataset.rodxUnmatched;
        delete cell.dataset.rodxLimited;
        article.style.setProperty("--rodx-font", state.visual.font + "px", "important");
        article.style.setProperty("--rodx-dense", String(state.visual.density), "important");
        article.dataset.rodxTight = state.visual.density < 0.9 ? "1" : "0";
        setSeen(article, id);
        addHashtagBtns(article);
        ensureBookmark(article);
        let actions = article.querySelector(DOM_SELECTORS.resultActionsByClass(actionClass));
        if (!actions) {
          actions = document.createElement("div");
          actions.className = actionClass;
          const exp = document.createElement("button");
          exp.type = "button";
          exp.dataset.rodxExpand = "1";
          // X uses SPA navigation for its own status links. Call the real
          // anchor handler rather than assigning window.location or dispatching
          // a click on the tweet container (which RodX intentionally blocks).
          exp.textContent = "↗";
          exp.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const anchor =
              article.querySelector(DOM_SELECTORS.timestamps)?.closest(NATIVE_X_SELECTORS.statusLinks) ||
              article.querySelector(NATIVE_X_SELECTORS.statusLinks);
            if (!anchor) {
              showRodxToast("Não foi possível localizar o link nativo deste post.", "error");
              return;
            }
            anchor.click();
          });
          const read = document.createElement("button");
          read.type = "button";
          read.dataset.rodxReadBtn = "1";
          read.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (state.seen.has(id)) state.seen.delete(id);
            else state.seen.set(id, Date.now());
            Seen.flushSoon?.();
            setSeen(article, id);
          });
          actions.append(exp, read);
          const nativeActions = findActions(article);
          if (nativeActions) nativeActions.append(actions);
          else {
            actions.hidden = true;
            article.append(actions);
          }
        }
        const targetActions = findActions(article);
        if (targetActions && actions.parentElement !== targetActions) {
          actions.hidden = false;
          targetActions.append(actions);
        }
        const exp = actions.querySelector(RODX_SELECTORS.expandAction);
        if (exp) {
          exp.textContent = "↗";
          exp.title = "Expandir e abrir tweet";
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
