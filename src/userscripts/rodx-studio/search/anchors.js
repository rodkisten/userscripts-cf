import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-search-anchors-1.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-search-anchors-1.css?inline";
import { Studio } from "../core/studio.js";
import { XDOM } from "../platform/selectors.js";
import { parseQueryBlocks } from "./query-parser.js";
import { state } from "../state/deck.js";

export let SearchAnchors;

export function initializeDeckSearchAnchors() {
  SearchAnchors = (() => {
    const storageKey = "rodx:search-return:v2";
    let origin = null,
      dismissed = "",
      lastRoute = "",
      host,
      shadow,
      cancelRestore,
      pending = false,
      account = "",
      navigationUntil = 0,
      captureBlockedUntil = 0;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      origin = saved?.origin || null;
      dismissed = saved?.dismissed || "";
    } catch (_) {}
    const route = () => location.pathname + location.search;
    const query = () => new URL(location.href).searchParams.get("q") || "";
    const searchPage = () => location.pathname === "/search";
    const globalPage = () =>
      /^\/(?:home|explore|search|notifications|messages|settings|compose|i(?:\/|$)|login|logout)(?:\/|$)/.test(
        location.pathname,
      );
    const index = () =>
      Number(
        document.documentElement.getAttribute("data-rodx-nav-index") || history.state?.rodxNavIndex || 0,
      );
    function persist() {
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            origin,
            dismissed,
          }),
        );
      } catch (_) {}
    }
    function clear() {
      cancelRestore?.();
      origin = null;
      pending = false;
      persist();
      render();
    }
    function capture() {
      const q = query();
      if (!searchPage() || !q || dismissed === q || Date.now() < captureBlockedUntil) return;
      const article = [...Studio.dom.nodes(XDOM.tweet)].find((a) => a.getBoundingClientRect().bottom > 65);
      const status =
        article?.querySelector(CSS_SELECTORS.s053)?.closest(CSS_SELECTORS.s052) ||
        article?.querySelector(CSS_SELECTORS.s052);
      const saved = state.searches?.find((item) => item.query === q);
      origin = {
        account: state.account,
        href: route(),
        query: q,
        label: saved?.name || q,
        index: index(),
        tweet: status?.getAttribute("href")?.match(/\/status\/(\d+)/)?.[1] || "",
        y: scrollY,
        offset: article?.getBoundingClientRect().top || 0,
      };
      persist();
    }
    async function nativeSearch(q, href) {
      navigationUntil = Date.now() + 4500;
      const wanted = new URL(
        href || "/search?q=" + encodeURIComponent(q) + "&src=typed_query",
        location.origin,
      );
      const matches = () => location.pathname === "/search" && query() === q;
      const existing = [...document.querySelectorAll(CSS_SELECTORS.s027)].find(
        (a) => a.pathname === wanted.pathname && a.search === wanted.search && !a.closest(CSS_SELECTORS.s187),
      );
      if (existing) {
        existing.click();
        return;
      }
      let field = document.querySelector(CSS_SELECTORS.s188);
      if (!field) {
        const explore = document.querySelector(CSS_SELECTORS.s189);
        if (explore) {
          explore.click();
          for (let i = 0; i < 20 && !field; i++) {
            await new Promise((r) => setTimeout(r, 80));
            field = document.querySelector(CSS_SELECTORS.s188);
          }
        }
      }
      if (field) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, q);
        field.dispatchEvent(
          new Event("input", {
            bubbles: true,
          }),
        );
        field.dispatchEvent(
          new Event("change", {
            bubbles: true,
          }),
        );
        await new Promise((r) => setTimeout(r, 40));
        const form = field.closest(CSS_SELECTORS.s190);
        if (form) form.requestSubmit();
        else
          field.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            }),
          );
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 80));
          if (matches()) return;
        }
      }
      // A real navigation is the bounded fallback; never leave a dead pending UI.
      if (!matches()) location.assign(wanted.href);
    }
    function restore(entry) {
      cancelRestore?.();
      let ticks = 0,
        stable = 0;
      const stop = () => {
        clearInterval(timer);
        pending = false;
        render();
        document.removeEventListener("touchstart", stop, true);
        document.removeEventListener("wheel", stop, true);
        cancelRestore = null;
      };
      const timer = setInterval(() => {
        if (++ticks > 40) {
          stop();
          return;
        }
        if (!searchPage() || query() !== entry.query) return;
        const target =
          entry.tweet &&
          [...Studio.dom.nodes(XDOM.tweet)].find((a) =>
            [...a.querySelectorAll(CSS_SELECTORS.s052)].some((link) =>
              link.getAttribute("href")?.includes("/status/" + entry.tweet),
            ),
          );
        if (target) {
          const delta = target.getBoundingClientRect().top - entry.offset;
          if (Math.abs(delta) > 2) {
            scrollBy(0, delta);
            stable = 0;
          } else if (++stable >= 3) stop();
        } else if (ticks < 8)
          scrollTo(0, Math.min(entry.y, Math.max(0, document.documentElement.scrollHeight - innerHeight)));
      }, 200);
      cancelRestore = stop;
      document.addEventListener("touchstart", stop, {
        once: true,
        capture: true,
      });
      document.addEventListener("wheel", stop, {
        once: true,
        capture: true,
      });
    }
    async function returnToSearch() {
      if (!origin || pending) return;
      const entry = {
        ...origin,
      };
      pending = true;
      render();
      restore(entry);
      const delta = entry.index - index();
      if (delta < 0 && delta >= -40) {
        history.go(delta);
        await new Promise((r) => setTimeout(r, 750));
        if (searchPage() && query() === entry.query) return;
      }
      try {
        await nativeSearch(entry.query, entry.href);
      } catch (error) {
        cancelRestore?.();
        shadow.querySelector(CSS_SELECTORS.s191).textContent = String(error.message || error);
      } finally {
        pending = false;
        render();
      }
    }
    function mount() {
      const main = document.querySelector(CSS_SELECTORS.s031) || document.querySelector(CSS_SELECTORS.s032);
      if (!main) return false;
      if (!host) {
        document.querySelectorAll(CSS_SELECTORS.s192).forEach((el) => el.remove());
        host = document.createElement("section");
        host.id = "rodx-navigation-strip";
        host.style.cssText = cssDeclarations(inlineCSS1);
        shadow = host.attachShadow({
          mode: "open",
        });
        shadow.innerHTML = `<style>${extractedCSS1}</style>
<div class="list-context" role="status" hidden></div>
<div class="return" hidden>
  <button type="button" data-return></button>
  <button type="button" data-dismiss aria-label="Fechar retorno à pesquisa">×</button>
</div>
<small data-nav-status role="status"></small>`;
        shadow.querySelector(CSS_SELECTORS.s193).onclick = () => void returnToSearch();
        shadow.querySelector(CSS_SELECTORS.s194).onclick = () => {
          dismissed = origin?.query || "";
          clear();
        };
      }
      if (host.parentElement !== main) {
        const style = getComputedStyle(main);
        if (style.display.includes("flex") && style.flexDirection === "row") return false;
        main.prepend(host);
      }
      return true;
    }
    function positiveListIds(searchText) {
      if (!searchText) return [];
      try {
        const tree = parseQueryBlocks(searchText);
        const ids = new Set();
        const visit = (node, excluded = false) => {
          if (!node || typeof node !== "object") return;
          const negated = excluded !== Boolean(node.not);
          if (node.kind === "group") {
            for (const child of node.children || []) visit(child, negated);
          } else if (!negated && node.type === "raw") {
            const match = /^list:(\d+)$/i.exec(String(node.value || ""));
            if (match) ids.add(match[1]);
          }
        };
        visit(tree);
        return [...ids].slice(0, 12);
      } catch {
        // Unsupported/partially written query: no speculative list association.
        return [];
      }
    }
    let listNameCheck = "";
    function render() {
      if (!mount()) return;
      const native = document.querySelector(CSS_SELECTORS.s188);
      const positiveIds = searchPage() ? positiveListIds(query()) : [];
      const listContext = shadow.querySelector(CSS_SELECTORS.s195);
      listContext.hidden = positiveIds.length === 0;
      if (positiveIds.length) {
        const rows = Studio.services.lists?.all() || [];
        const labels = positiveIds.map((id) => {
          const row = rows.find((value) => value.id === id);
          return row ? Studio.services.lists.displayName(row) : "lista " + id;
        });
        const complex = /\bOR\b|\bNOT\b|\([^)]*\)|-list:/i.test(query());
        listContext.textContent = complex
          ? "Pesquisa envolvendo as listas " + labels.join(", ")
          : positiveIds.length === 1
            ? "Exibindo resultados para a lista " + labels[0]
            : "Exibindo resultados para as listas " + labels.join(", ");
        const missing = positiveIds.filter(
          (id) =>
            !rows.some(
              (row) =>
                row.id === id && (row.alias || row.apiName || (row.nameSource !== "placeholder" && row.name)),
            ),
        );
        const key = missing.join(",");
        if (key && key !== listNameCheck) {
          listNameCheck = key;
          Promise.all(
            missing.slice(0, 3).map((id) => Studio.services.lists?.refreshName(id).catch(() => null)),
          )
            .then((found) => {
              if (found.some(Boolean)) Studio.emit("lists:names-ready");
            })
            .catch(() => {});
        }
      }
      const show =
        !!origin &&
        origin.account === state.account &&
        !searchPage() &&
        !globalPage() &&
        dismissed !== origin.query;
      const row = shadow.querySelector(CSS_SELECTORS.s196);
      row.hidden = !show;
      const button = shadow.querySelector(CSS_SELECTORS.s193);
      button.textContent = "↩ Voltar para a pesquisa " + (origin?.label || "");
      button.title = origin?.query || "";
      button.disabled = pending;
      host.hidden = !show && !positiveIds.length;
    }
    document.addEventListener("rodx:before-route", (event) => {
      try {
        const data = JSON.parse(event.detail);
        if (new URL(data.from, location.origin).pathname === "/search") capture();
      } catch (_) {}
    });
    document.addEventListener(
      "click",
      (event) => {
        const link = event.target.closest?.(CSS_SELECTORS.s027);
        if (!link) return;
        const testid = link.getAttribute("data-testid") || "";
        if (
          /^AppTabBar_|^SideNav_/.test(testid) ||
          ["/home", "/explore", "/notifications", "/messages"].includes(link.getAttribute("href"))
        ) {
          if (Date.now() < navigationUntil && !event.isTrusted) return;
          navigationUntil = 0;
          captureBlockedUntil = Date.now() + 2000;
          clear();
          return;
        }
        if (searchPage()) capture();
      },
      true,
    );
    let scrollTimer;
    window.addEventListener(
      "scroll",
      () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          if (searchPage()) capture();
        }, 180);
      },
      {
        passive: true,
      },
    );
    function scan() {
      if (account !== state.account) {
        account = state.account;
        if (origin && origin.account !== account) origin = null;
      }
      if (lastRoute !== route()) {
        lastRoute = route();
        pending = false;
        if (globalPage() && !searchPage() && Date.now() >= navigationUntil) {
          clear();
        }
        if (searchPage() && origin && query() !== origin.query) {
          cancelRestore?.();
          origin = null;
          dismissed = "";
          persist();
        }
        shadow?.querySelector(CSS_SELECTORS.s191)?.replaceChildren();
      }
      render();
    }
    Studio.on("lists:names-ready", () => Studio.invalidate("state"));
    Studio.on("lists:changed", () => Studio.invalidate("state"));
    return { nativeSearch, scan, positiveListIds };
  })();
}
