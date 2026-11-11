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
        document.querySelector('[data-testid="primaryColumn"]') ||
        document.querySelector('main,[role="main"]');
      const trigger =
        primary?.querySelector('[data-testid="userActions"]') ||
        [...(primary?.querySelectorAll('button,[role="button"]') || [])].find(
          (el) =>
            !el.closest("article") &&
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
        const action = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
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
      let row = shadow.querySelector(".row");
      if (!row) {
        const style = document.createElement("style");
        style.textContent = `
:host {
  display: block;
  min-width: 0;
  color: inherit;
  font:
    13px TwitterChirp,
    Arial,
    sans-serif;
}
* {
  box-sizing: border-box;
}
button,
a {
  font: inherit;
  color: inherit;
}
button {
  cursor: pointer;
}
.row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border-bottom: 1px solid #71767b33;
  min-width: 0;
}
.strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  min-width: 0;
  flex: 1;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}
button,
.strip a {
  background: transparent;
  border: 1px solid #71767b55;
  border-radius: 18px;
  padding: 6px 10px;
  white-space: nowrap;
  text-decoration: none;
  flex: none;
}
button:hover,
a:hover {
  background: #71767b22;
}
.status {
  opacity: 0.7;
  white-space: nowrap;
  font-size: 12px;
}
.all {
  width: min(520px, 92vw);
  max-height: 80dvh;
  border: 1px solid #71767b66;
  border-radius: 16px;
  background: #15202b;
  color: #e7e9ea;
  padding: 16px;
}
.all::backdrop {
  background: #0008;
}
.all header,
.all footer {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
}
.all-items {
  display: grid;
  gap: 8px;
  overflow: auto;
  max-height: 50dvh;
  padding: 16px 0;
}
.all-items a {
  display: block;
  padding: 10px;
  border-radius: 10px;
  text-decoration: none;
}
.all footer a {
  font-size: 12px;
}
`;
        row = document.createElement("section");
        row.className = "row";
        row.setAttribute("aria-label", "Listas deste perfil");
        shadow.append(style, row);
      }
      const oldScroll = row.querySelector(".strip")?.scrollLeft || 0;
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
      const body = modal?.querySelector(".all-items");
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
        document.querySelector('[data-testid="primaryColumn"]') ||
        document.querySelector("main") ||
        document.querySelector('[role="main"]');
      if (!main) return null;
      const tabs = main.querySelector('[role="tablist"]');
      if (tabs) {
        const block = tabs.closest('[data-testid="ScrollSnap-List"]') || tabs;
        return {
          parent: block.parentElement,
          before: block,
        };
      }
      // Mobile X does not consistently expose the desktop column/tab roles.
      const reply = [...main.querySelectorAll("a[href]")].find(
        (a) =>
          a.getAttribute("href")?.replace(/\/$/, "").toLowerCase() ===
          "/" + current.toLowerCase() + "/with_replies",
      );
      if (reply) {
        const block =
          reply.closest('[data-testid="ScrollSnap-List"],nav,[role="navigation"]') || reply.parentElement;
        return {
          parent: block.parentElement,
          before: block,
        };
      }
      const bio = main.querySelector('[data-testid="UserDescription"]');
      if (bio)
        return {
          parent: bio.parentElement,
          before: bio.nextSibling,
        };
      const name = main.querySelector('[data-testid="UserName"],[data-testid="UserProfileHeader_Items"]');
      if (name && !name.closest("article"))
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
      if (!point?.parent || point.parent.closest("article")) return;
      stop();
      host?.remove();
      handle = current;
      account = state.account;
      host = document.createElement("div");
      host.id = "rodx-profile-lists";
      host.style.cssText =
        "display:block!important;position:relative!important;width:100%!important;min-height:44px!important;flex:0 0 100%!important;clear:both;color:inherit;";
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
