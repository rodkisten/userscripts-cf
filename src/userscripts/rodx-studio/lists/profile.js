import { cssDeclarations } from "../../../core/css.js";
import inlineCSS1 from "../../../styles/inline/userscripts-rodx-studio-lists-profile-1.css?inline";
import { CSS_SELECTORS } from "../../../selectors.js";
import extractedCSS1 from "../../../styles/extracted/userscripts-rodx-studio-lists-profile-1.css?inline";
import { VERSION } from "../config/search.js";
import { Studio } from "../core/studio.js";
import { XClientLists } from "./client.js";
import { studioListIndex } from "./routes.js";
import { state } from "../state/deck.js";
import { showRodxToast } from "../ui/toast.js";

export let ProfileLists;

export function initializeDeckProfileLists() {
  ProfileLists = (() => {
    const cache = new Map();
    let handle = "",
      account = "",
      host,
      shadow,
      modal;
    let loading = false,
      items = [],
      error = "";
    const excluded = new Set([
      "home",
      "search",
      "explore",
      "notifications",
      "messages",
      "i",
      "settings",
      "compose",
      "lists",
      "intent",
      "login",
      "logout",
      "signup",
      "jobs",
      "communities",
      "tos",
      "privacy",
    ]);
    function profile() {
      const match = location.pathname.match(
        /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|articles))?\/?$/,
      );
      if (!match || excluded.has(match[1].toLowerCase())) return "";
      return match[1];
    }
    function stop() {
      loading = false;
      requestController?.abort();
    }
    function remember() {
      cache.set(account + ":" + handle.toLowerCase(), {
        at: Date.now(),
        items: items.slice(),
      });
    }
    function button(text, action) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = text;
      el.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      };
      return el;
    }
    function membershipURL() {
      return "/" + handle + "/lists/memberships";
    }
    function listLink(item) {
      const a = document.createElement("a");
      a.href = studioListIndex(Studio) + "/" + item.id;
      const record = Studio.state.lists?.lists?.find((x) => x.id === item.id) || item;
      const name = Studio.services.lists?.displayName(record) || item.name;
      a.textContent = name;
      a.title = name;
      return a;
    }
    async function addToLists() {
      modal?.close();
      if (Studio.services.lists) return Studio.services.lists.picker(handle, host);
      const expected = handle;
      const primary =
        document.querySelector(CSS_SELECTORS.s031) || document.querySelector(CSS_SELECTORS.s032);
      const trigger =
        primary?.querySelector(CSS_SELECTORS.s074) ||
        [...(primary?.querySelectorAll(CSS_SELECTORS.s116) || [])].find(
          (el) =>
            !el.closest(CSS_SELECTORS.s041) &&
            /^(?:more|mais|más|plus|more options|mais opções)$/i.test(el.getAttribute("aria-label") || ""),
        );
      if (!trigger) {
        showRodxToast(
          "Menu do perfil indisponível. Abra os três pontos do perfil e escolha Adicionar/remover das Listas.",
          "error",
        );
        return;
      }
      trigger.click();
      const label = /(?:add.*remove.*lists?|adicionar.*(?:remover|listas)|agregar.*listas|añadir.*listas)/i;
      for (let attempt = 0; attempt < 25; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (profile() !== expected) return;
        const action = [...document.querySelectorAll(CSS_SELECTORS.s117)].find((el) =>
          label.test(el.textContent || ""),
        );
        if (!action) continue;
        action.click();
        cache.delete(account + ":" + handle.toLowerCase());
        return;
      }
      showRodxToast("O X não mostrou a opção de listas neste perfil. Verifique o menu do perfil.", "error");
    }
    function showAll() {
      modal?.remove();
      modal = document.createElement("dialog");
      modal.className = "all";
      const heading = document.createElement("strong");
      heading.textContent = "Listas de @" + handle;
      const close = button("Fechar", () => modal.close());
      const header = document.createElement("header");
      header.append(heading, close);
      const body = document.createElement("div");
      body.className = "all-items";
      items.forEach((item) => body.append(listLink(item)));
      if (!items.length)
        body.textContent = loading ? "Carregando as listas públicas…" : error || "Nenhuma lista disponível.";
      const footer = document.createElement("footer");
      const native = document.createElement("a");
      native.href = membershipURL();
      native.textContent = "Ver todas no X";
      footer.append(button("＋ Adicionar às minhas listas", addToLists), native);
      modal.append(header, body, footer);
      modal.addEventListener("click", (event) => {
        if (event.target === modal) modal.close();
      });
      shadow.append(modal);
      modal.showModal();
    }
    function render() {
      if (!shadow) return;
      let row = shadow.querySelector(CSS_SELECTORS.s118);
      if (!row) {
        const style = document.createElement("style");
        style.textContent = extractedCSS1;
        row = document.createElement("section");
        row.className = "row";
        row.setAttribute("aria-label", "Listas deste perfil");
        shadow.append(style, row);
      }
      const oldScroll = row.querySelector(CSS_SELECTORS.s119)?.scrollLeft || 0;
      row.replaceChildren();
      const title = button("Listas" + (items.length ? " · " + items.length : ""), showAll);
      title.title = "RodX " + VERSION + " — listas deste perfil";
      row.append(title);
      const strip = document.createElement("div");
      strip.className = "strip";
      items.forEach((item) => strip.append(listLink(item)));
      if (!items.length) {
        const status = document.createElement("span");
        status.className = "status";
        status.textContent = loading
          ? "Consultando listas…"
          : error
            ? "Listas indisponíveis"
            : "Nenhuma lista pública encontrada";
        status.title = error;
        strip.append(status);
      }
      if (error) strip.append(button("Tentar novamente", load));
      const native = document.createElement("a");
      native.href = membershipURL();
      native.textContent = "Ver no X";
      native.style.whiteSpace = "nowrap";
      row.append(strip, native, button("＋", addToLists));
      row.lastChild.title = "Adicionar/remover das minhas listas";
      row.lastChild.setAttribute("aria-label", "Adicionar/remover das minhas listas");
      strip.scrollLeft = oldScroll;
      const body = modal?.querySelector(CSS_SELECTORS.s120);
      if (body && items.length) {
        body.replaceChildren();
        items.forEach((item) => body.append(listLink(item)));
      }
    }
    let requestController;
    async function load() {
      stop();
      requestController?.abort();
      requestController = new AbortController();
      error = "";
      loading = true;
      items = [];
      render();
      const expectedHandle = handle,
        expectedAccount = account;
      const controller = requestController;
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const loaded = await XClientLists.memberships(handle, controller.signal);
        if (
          handle !== expectedHandle ||
          account !== expectedAccount ||
          requestController !== controller ||
          controller.signal.aborted
        )
          return;
        await Studio.services.lists?.ingest(loaded);
        items = loaded.map((item) => ({
          ...item,
          name:
            Studio.services.lists?.displayName(
              Studio.state.lists?.lists?.find((x) => x.id === item.id) || item,
            ) || item.name,
        }));
        remember();
      } catch (reason) {
        if (handle !== expectedHandle || account !== expectedAccount || requestController !== controller)
          return;
        error =
          reason.name === "AbortError"
            ? "Tempo esgotado ao consultar listas. Use Ver no X."
            : String(reason.message || reason);
      } finally {
        clearTimeout(timeout);
        if (handle === expectedHandle && account === expectedAccount && requestController === controller) {
          loading = false;
          render();
        }
      }
    }
    function mountPoint(current) {
      const main =
        document.querySelector(CSS_SELECTORS.s031) ||
        document.querySelector(CSS_SELECTORS.s094) ||
        document.querySelector(CSS_SELECTORS.s121);
      if (!main) return null;
      const tabs = main.querySelector(CSS_SELECTORS.s035);
      if (tabs) {
        const block = tabs.closest(CSS_SELECTORS.s036) || tabs;
        return {
          parent: block.parentElement,
          before: block,
        };
      }
      // Mobile X does not consistently expose the desktop column/tab roles.
      const reply = [...main.querySelectorAll(CSS_SELECTORS.s027)].find(
        (a) =>
          a.getAttribute("href")?.replace(/\/$/, "").toLowerCase() ===
          "/" + current.toLowerCase() + "/with_replies",
      );
      if (reply) {
        const block = reply.closest(CSS_SELECTORS.s122) || reply.parentElement;
        return {
          parent: block.parentElement,
          before: block,
        };
      }
      const bio = main.querySelector(CSS_SELECTORS.s071);
      if (bio)
        return {
          parent: bio.parentElement,
          before: bio.nextSibling,
        };
      const name = main.querySelector(CSS_SELECTORS.s123);
      if (name && !name.closest(CSS_SELECTORS.s041))
        return {
          parent: name.parentElement,
          before: name.nextSibling,
        };
      return null;
    }
    function scan() {
      const current = profile();
      if (!current || (handle && (handle !== current || account !== state.account))) {
        stop();
        host?.remove();
        host = shadow = null;
        modal?.remove();
        modal = null;
        handle = "";
      }
      if (!current) return;
      if (host?.isConnected) return;
      const point = mountPoint(current);
      if (!point?.parent || point.parent.closest(CSS_SELECTORS.s041)) return;
      stop();
      host?.remove();
      handle = current;
      account = state.account;
      host = document.createElement("div");
      host.id = "rodx-profile-lists";
      host.style.cssText = cssDeclarations(inlineCSS1);
      host.dataset.rodxVersion = VERSION;
      shadow = host.attachShadow({
        mode: "open",
      });
      point.parent.insertBefore(host, point.before);
      const hit = cache.get(account + ":" + handle.toLowerCase());
      items = hit?.items.slice() || [];
      error = "";
      render();
      if (!(hit && Date.now() - hit.at < 300000)) void load();
    }
    Studio.on("lists:names-ready", () => {
      if (host?.isConnected) render();
    });
    // Isolate the profile strip from failures in other timeline enhancements.

    return {
      scan,
    };
  })();
}
