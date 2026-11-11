import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-feeds-filters-1.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import { Studio } from "../core/studio.js";
import { currentFullQuery, visibleLimit } from "./local-limits.js";
import { compileLocalRule, parseLocalDirectives } from "./local-rules.js";
import { state } from "../state/deck.js";
import { saveState } from "../storage/account.js";
import { Preferences } from "../ui/preferences.js";
import { showRodxToast } from "../ui/toast.js";

export let FeedFilters;

export function initializeDeckFeedFilters() {
  FeedFilters = (() => {
    let host,
      shadow,
      key = "",
      signature = "",
      expanded = false,
      lastPublished = "";
    function scope() {
      const p = location.pathname;
      if (p === "/home" || p === "/") return "home";
      if (p === "/i/bookmarks" || p === "/bookmarks") return "bookmarks";
      const community = p.match(/^\/i\/communities\/(\d+)/);
      if (community) return "community:" + community[1];
      const list = p.match(/^\/(?:i|[A-Za-z0-9_]{1,15})\/lists\/(\d+)/);
      if (list) return "list:" + list[1];
      const user = p.match(/^\/([\w]{1,15})(?:\/(?:media|with_replies|highlights|articles))?\/?$/);
      if (
        user &&
        !/^(search|explore|notifications|messages|settings|i|compose|login|signup|lists)$/i.test(user[1])
      )
        return "profile:" + user[1].toLowerCase();
      if (p === "/search") return "search";
      return "";
    }
    function settings() {
      return (
        (location.pathname === "/search" &&
        new URL(location.href).searchParams.get("q") === Studio.state.listSearch?.query
          ? Studio.state.listSearch
          : null) ||
        state.visual.feedFilters?.[scope()] ||
        Studio.config.feedDefaults || {
          reposts: true,
          media: "media",
        }
      );
    }
    function publish() {
      let patterns = [];
      try {
        if (location.pathname === "/search")
          patterns = parseLocalDirectives(currentFullQuery())
            .local.map(compileLocalRule)
            .map(({ kind, source, flags }) => ({
              kind,
              source,
              flags,
            }));
      } catch (_) {}
      const config = {
        ...settings(),
        route: location.pathname,
        query: location.search,
        patterns,
        limit: location.pathname === "/search" ? visibleLimit() : 0,
        seen: state.visual.hideSeen ? [...state.seen.keys()].slice(-10000) : [],
      };
      const encoded = JSON.stringify(config);
      document.documentElement.classList.toggle("rodx-snap-enabled", state.visual.snap === true);
      if (encoded === lastPublished) return;
      lastPublished = encoded;
      document.documentElement.setAttribute("data-rodx-feed-config", encoded);
      try {
        const saved = JSON.parse(sessionStorage.getItem("rodx:feed:routes") || "{}");
        saved[location.pathname] = config;
        const keys = Object.keys(saved);
        for (const key of keys.slice(0, Math.max(0, keys.length - 100))) delete saved[key];
        sessionStorage.setItem("rodx:feed:routes", JSON.stringify(saved));
      } catch (_) {}
      document.documentElement.classList.toggle("rodx-snap-enabled", state.visual.snap === true);
    }
    function local() {
      // Restore any stale cosmetic flags. Do not resize virtualized tweet cells.
      document
        .querySelectorAll(CSS_SELECTORS.filteredFeedElements)
        .forEach((el) =>
          el.classList.remove("rodx-feed-filtered", "rodx-feed-filtered-cell", "rodx-who-to-follow"),
        );
    }
    function render() {
      const config = settings(),
        summary =
          {
            media: "Imagens e vídeos",
            video: "Vídeos",
            image: "Imagens",
            all: "Todos",
          }[config.media] || "Imagens e vídeos";
      shadow.innerHTML =
        "<style>" + inlineCSS1 + "</style>" + '<button type="button" data-filter-menu></button>';
      const button = shadow.querySelector(CSS_SELECTORS.buttons);
      button.textContent =
        "⚙ " +
        summary +
        (config.reposts === false ? " · sem reposts" : "") +
        (state.visual.snap ? " · Snap" : "");
      button.title = "Configurar filtros no RodMenu";
      button.onclick = (event) => {
        event.stopPropagation();
        Preferences.filters();
      };
    }
    async function change(event) {
      const input = event.target;
      if (!input.dataset.filter) return;
      const field = input.dataset.filter;
      if (field === "snap") state.visual.snap = input.checked;
      else {
        const config = {
          ...settings(),
        };
        if (field === "reposts") config.reposts = input.checked;
        else config.media = input.checked ? field : "all";
        state.visual.feedFilters = {
          ...state.visual.feedFilters,
          [scope()]: config,
        };
        const id = scope().startsWith("list:") ? scope().slice(5) : "";
        if (id && Studio.services.lists) {
          const list = Studio.services.lists;
          Object.assign(list.settings, {
            hideReposts: !config.reposts,
            media: config.media === "video" ? "videos" : config.media === "image" ? "images" : "all",
          });
          list.presets[id] = {
            ...list.presets[id],
            hideReposts: !config.reposts,
            media: list.settings.media,
          };
          localStorage.setItem("xls-v1:list-presets", JSON.stringify(list.presets));
          localStorage.setItem("xls-v1:settings", JSON.stringify(list.settings));
        }
      }
      publish();
      local();
      render();
      await saveState();
    }
    function scan() {
      publish();
      const current = scope();
      if (!current) {
        host?.remove();
        host = null;
        key = "";
        return;
      }
      if (host?.isConnected && key === current) {
        const s = JSON.stringify([
          settings(),
          state.visual.snap,
          document.documentElement.getAttribute("data-rodx-feed-network"),
        ]);
        if (s !== signature) {
          signature = s;
          render();
        }
        return;
      }
      const main =
        document.querySelector(CSS_SELECTORS.primaryColumn) ||
        document.querySelector(CSS_SELECTORS.mainContent);
      if (!main) return;
      host?.remove();
      host = document.createElement("div");
      host.id = "rodx-feed-filters";
      shadow = host.attachShadow({
        mode: "open",
      });
      shadow.addEventListener(
        "change",
        (e) => void change(e).catch((error) => showRodxToast(error.message, "error")),
      );
      shadow.addEventListener("click", (e) => {
        if (e.target.closest(CSS_SELECTORS.feedRefreshControls)) location.reload();
        if (e.target.closest(CSS_SELECTORS.feedFilterMenu)) {
          expanded = !expanded;
          render();
        }
      });
      const tabs = main.querySelector(CSS_SELECTORS.tabLists);
      const block = tabs?.closest(CSS_SELECTORS.scrollSnapList) || tabs;
      if (block?.parentElement) block.after(host);
      else main.prepend(host);
      key = current;
      signature = "";
      render();
    }
    return {
      scan,
      publish,
      scope,
      settings,
    };
  })();
}
