import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-lists-access-1.css?inline";
import inlineCSS2 from "../../../styles/inline/userscripts-rodx-studio-lists-access-2.css?inline";
import inlineCSS3 from "../../../styles/inline/userscripts-rodx-studio-lists-access-3.css?inline";
import inlineCSS4 from "../../../styles/inline/userscripts-rodx-studio-lists-access-4.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import { studioListIndex } from "./routes.js";

export function createListAccess(Studio, navigateSearch) {
  let footerButton, profileHost;
  const reserved = new Set([
    "home",
    "explore",
    "search",
    "i",
    "notifications",
    "messages",
    "settings",
    "compose",
    "login",
    "logout",
    "signup",
    "bookmarks",
    "lists",
    "communities",
    "jobs",
    "premium",
  ]);
  const svg =
    '<svg viewBox="0 0 24 24" aria-hidden="true" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
  function nativeLists() {
    Studio.navigate(studioListIndex(Studio));
  }
  async function open() {
    const service = Studio.services.lists;
    if (!service) return;
    await service.refresh();
    const choices = service.all().map((list) => ({ value: list.id, label: service.displayName(list) }));
    const saved = Studio.config.listAccess || { media: "video", reposts: false, lastId: "" };
    const handle = Studio.menu.open({
      id: "rodx-list-navigation",
      title: "Listas",
      presentation: "bottom-sheet",
      size: "md",
      store: { persist: false },
      description: choices.length
        ? "Escolha uma lista para pesquisar a mídia."
        : "Abra Listas do X para sincronizar suas listas neste navegador.",
      fields: [
        {
          type: "select",
          name: "list",
          label: "Lista",
          searchable: true,
          value: choices.some((x) => x.value === saved.lastId) ? saved.lastId : choices[0]?.value || "",
          options: choices,
        },
        {
          type: "segmented",
          name: "media",
          label: "Mostrar",
          value: saved.media,
          options: [
            { value: "video", label: "Vídeos" },
            { value: "media", label: "Fotos e vídeos" },
          ],
        },
        { type: "switch", name: "reposts", label: "Incluir reposts", value: saved.reposts === true },
      ],
      actions: [
        {
          id: "open",
          label: "Ver mídia da lista",
          role: "submit",
          handler: async (ctx) => {
            const id = String(ctx.values.list || "");
            if (!/^\d{1,30}$/.test(id))
              throw Error("Escolha uma lista. Se estiver vazio, abra Listas do X para sincronizar.");
            const media = ctx.values.media === "media" ? "media" : "video",
              reposts = ctx.values.reposts === true;
            const query = `list:${id} ${media === "video" ? "filter:native_video" : "(filter:images OR filter:native_video)"}${reposts ? "" : " -filter:retweets"}`;
            Studio.configure({ listAccess: { lastId: id, media, reposts } });
            Studio.state.listSearch = { query, media, reposts };
            // Publish before SPA navigation so its first response receives the selected filter.
            const config = { route: "/search", query, media, reposts };
            try {
              const routes = JSON.parse(sessionStorage.getItem("rodx:feed:routes") || "{}");
              routes["/search"] = config;
              sessionStorage.setItem("rodx:feed:routes", JSON.stringify(routes));
            } catch {}
            document.documentElement.setAttribute("data-rodx-feed-config", JSON.stringify(config));
            handle.close();
            await navigateSearch(query);
          },
        },
        { id: "native", label: "Abrir Listas do X", validate: false, close: true, handler: nativeLists },
        {
          id: "manage",
          label: "Gerenciar listas e membros",
          validate: false,
          close: true,
          handler: () => service.open(),
        },
        { id: "close", label: "Fechar", role: "cancel" },
      ],
    });
    return handle;
  }
  function footer() {
    if (!footerButton) {
      footerButton = document.createElement("button");
      footerButton.id = "rodx-footer-lists";
      footerButton.type = "button";
      footerButton.innerHTML = svg + "<span>Listas</span>";
      footerButton.title = "Listas";
      footerButton.setAttribute("aria-label", "Listas: escolher lista ou abrir Listas do X");
      footerButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        void open().catch((error) => console.warn("[RodX] Listas:", error));
      };
    }
    const home = document.querySelector(CSS_SELECTORS.homeTabLink);
    let row = home?.parentElement;
    while (row && row !== document.body && !row.querySelector(CSS_SELECTORS.exploreTabLink))
      row = row.parentElement;
    if (innerWidth < 800 && row && row !== document.body) {
      footerButton.style.cssText = cssDeclarations(inlineCSS1);
      if (footerButton.parentElement !== row) row.append(footerButton);
    } else {
      // A compact fallback keeps access available when X temporarily unmounts its bottom navigation.
      footerButton.style.cssText = cssDeclarations(inlineCSS2);
      if (footerButton.parentElement !== document.body) document.body.append(footerButton);
    }
  }
  function profile() {
    const match = location.pathname.match(
      /^\/([A-Za-z0-9_]{1,15})(?:\/(?:media|with_replies|highlights|articles))?\/?$/,
    );
    const handle = match && !reserved.has(match[1].toLowerCase()) ? match[1] : "";
    if (!handle) {
      profileHost?.remove();
      return;
    }
    const main =
      document.querySelector(CSS_SELECTORS.primaryColumn) ||
      document.querySelector(CSS_SELECTORS.mainElement);
    const identity = main?.querySelector(CSS_SELECTORS.profileIdentityOrUserName);
    if (!identity || identity.closest(CSS_SELECTORS.articles)) return;
    if (!profileHost) {
      profileHost = document.createElement("div");
      profileHost.id = "rodx-profile-add-list";
      profileHost.style.cssText = cssDeclarations(inlineCSS3);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "＋ Adicionar à lista";
      button.style.cssText = cssDeclarations(inlineCSS4);
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const user = profileHost.dataset.handle;
        if (user) void Studio.services.lists.picker(user, button);
      };
      profileHost.append(button);
    }
    profileHost.dataset.handle = handle;
    if (!profileHost.isConnected || profileHost.parentElement !== identity.parentElement)
      identity.after(profileHost);
  }
  function scan() {
    footer();
    profile();
  }
  Studio.register("lists.access", scan, { group: "lists", minMs: 300 });
  return { open, scan };
}
