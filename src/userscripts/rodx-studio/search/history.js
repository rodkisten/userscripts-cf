import { currentFullQuery, nativeSearch } from "../feeds/local-limits.js";
import { extractIdentity } from "../identity/account.js";
import { captureCurrent, newDraft } from "./actions.js";
import { hrefFor } from "./query-compiler.js";
import { state } from "../state/deck.js";
import { CloudSync } from "../sync/cloud.js";

export let SearchHistory;

export function initializeDeckSearchHistory() {
  SearchHistory = (() => {
    const DB_NAME = "RodXSearchDeckHistory";
    const STORE = "queries";
    let opening = null;
    let queue = Promise.resolve();
    let launch = null;
    let dialog = null;
    let visible = 40;
    let observedKey = "";
    let renderGeneration = 0;
    let searchTerm = "";
    const lastCapture = new Map();
    const accountKey = () => state.account || extractIdentity().key || "guest";
    function openDB() {
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) return reject(new Error("IndexedDB indisponível"));
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, {
              keyPath: "id",
            });
            store.createIndex("account_time", ["account", "lastUsed"], {
              unique: false,
            });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            opening = null;
          };
          resolve(db);
        };
        request.onerror = () => reject(request.error || new Error("Falha ao abrir IndexedDB"));
        request.onblocked = () => reject(new Error("IndexedDB bloqueado por outra aba"));
      }).catch((err) => {
        opening = null;
        throw err;
      });
      return opening;
    }
    function transaction(mode, callback) {
      return openDB().then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            let value;
            try {
              value = callback(tx.objectStore(STORE));
            } catch (error) {
              tx.abort();
              reject(error);
              return;
            }
            tx.oncomplete = () => resolve(value);
            tx.onabort = () => reject(tx.error || new Error("Transação cancelada"));
            tx.onerror = () => reject(tx.error || new Error("Falha na transação"));
          }),
      );
    }
    function record(query, source = "search", sort = "top", account = accountKey()) {
      const clean = String(query || "")
        .trim()
        .replace(/\s+/gu, " ");
      if (!clean) return Promise.resolve();
      const id = JSON.stringify([account, clean]);
      const previous = lastCapture.get(id) || 0;
      if (Date.now() - previous < 900) return Promise.resolve();
      lastCapture.set(id, Date.now());
      const work = async () => {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          const store = tx.objectStore(STORE);
          const req = store.get(id);
          req.onsuccess = () => {
            const old = req.result;
            const entry = {
              id,
              account,
              query: clean,
              sort,
              firstUsed: old?.firstUsed || Date.now(),
              lastUsed: Date.now(),
              count: (old?.count || 0) + 1,
              source,
            };
            store.put(entry);
            CloudSync.recordHistory(account, entry);
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      };
      queue = queue.catch(() => {}).then(work);
      return queue.catch((err) => console.warn("[RodX] Histórico IndexedDB:", err));
    }
    function currentRoute() {
      const data = nativeSearch();
      if (!data?.query) {
        observedKey = "";
        return;
      }
      const full = currentFullQuery() || data.query;
      const key = JSON.stringify([accountKey(), full, data.sort, location.pathname]);
      if (observedKey === key) return;
      observedKey = key;
      void record(full, data.isHashtag ? "hashtag" : "search", data.sort);
    }
    function onSubmit(event) {
      const form = event.target;
      if (!(form instanceof Element) || !form.querySelector('input[data-testid="SearchBox_Search_Input"]'))
        return;
      const input = form.querySelector('input[data-testid="SearchBox_Search_Input"]');
      void record(input.value, "submit", "live");
    }
    function onKeydown(event) {
      if (event.key !== "Enter" || event.isComposing) return;
      const input = event.target;
      if (input instanceof HTMLInputElement && input.matches('[data-testid="SearchBox_Search_Input"]')) {
        void record(input.value, "submit", "live");
      }
    }
    async function page(account, offset, count = 40, filter = "") {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const index = tx.objectStore(STORE).index("account_time");
        const bound = IDBKeyRange.bound([account, 0], [account, Number.MAX_SAFE_INTEGER]);
        const cursor = index.openCursor(bound, "prev");
        const rows = [];
        let matched = 0;
        let more = false;
        cursor.onsuccess = () => {
          const result = cursor.result;
          if (!result)
            return resolve({
              rows,
              more,
            });
          const row = result.value;
          if (!filter || row.query.toLocaleLowerCase().includes(filter)) {
            if (matched >= offset && rows.length < count) rows.push(row);
            else if (rows.length >= count) {
              more = true;
              return resolve({
                rows,
                more,
              });
            }
            matched += 1;
          }
          result.continue();
        };
        cursor.onerror = () => reject(cursor.error);
      });
    }
    async function remove(id) {
      await transaction("readwrite", (store) => {
        store.delete(id);
      });
    }
    async function clearAccount(account) {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const index = tx.objectStore(STORE).index("account_time");
        const cursor = index.openCursor(IDBKeyRange.bound([account, 0], [account, Number.MAX_SAFE_INTEGER]));
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (row) {
            row.delete();
            row.continue();
          }
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    async function importRemote(account, entries) {
      if (!Array.isArray(entries) || !entries.length) return;
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        for (const remote of entries) {
          const query = String(remote.query || "").trim();
          if (!query) continue;
          const id = JSON.stringify([account, query]);
          const get = store.get(id);
          get.onsuccess = () => {
            const old = get.result;
            store.put({
              id,
              account,
              query,
              sort: (old?.lastUsed || 0) > remote.lastUsed ? old.sort : remote.sort,
              source: (old?.lastUsed || 0) > remote.lastUsed ? old.source : remote.source,
              firstUsed: Math.min(old?.firstUsed || Infinity, remote.firstUsed || Date.now()),
              lastUsed: Math.max(old?.lastUsed || 0, remote.lastUsed || 0),
              count: Math.max(old?.count || 0, remote.count || 1),
            });
          };
        }
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    const exportPage = (account, offset, limit = 100) => page(account, offset, limit);
    function installStyle() {
      if (document.getElementById("rodx-history-style")) return;
      const sheet = document.createElement("style");
      sheet.id = "rodx-history-style";
      sheet.textContent = `
#rodx-search-tools {
  position: fixed;
  z-index: 10010;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 88px;
  pointer-events: auto;
  box-sizing: border-box;
  font-family: TwitterChirp, Chirp, system-ui, sans-serif;
}
#rodx-search-tools > button {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font:
    500 21px/1 TwitterChirp,
    Chirp,
    system-ui;
  touch-action: manipulation;
}
#rodx-search-tools > button:is(:hover, :focus-visible) {
  background: rgba(29, 155, 240, 0.13);
  color: #1d9bf0;
}
#rodx-search-tools > button[hidden] {
  display: none !important;
}
#rodx-recent-panel {
  box-sizing: border-box;
  position: fixed;
  z-index: 10011;
  width: min(380px, calc(100vw - 20px));
  max-height: min(66dvh, 540px);
  overflow: auto;
  background: rgb(0, 0, 0);
  color: rgb(231, 233, 234);
  border: 1px solid rgb(47, 51, 54);
  border-radius: 16px;
  box-shadow: 0 9px 36px #0008;
  font:
    14px/1.4 TwitterChirp,
    Chirp,
    -apple-system,
    system-ui;
  -webkit-overflow-scrolling: touch;
}
#rodx-recent-panel .rh-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 12px;
  background: inherit;
  border-bottom: 1px solid #2f3336;
}
#rodx-recent-panel button {
  font: inherit;
  cursor: pointer;
}
#rodx-recent-panel .rh-icon {
  border: 0;
  background: transparent;
  color: inherit;
  border-radius: 50%;
  min-width: 32px;
  min-height: 32px;
}
#rodx-recent-panel input {
  display: block;
  width: calc(100% - 24px);
  margin: 9px 12px;
  box-sizing: border-box;
  padding: 9px 12px;
  border-radius: 99px;
  background: #16181c;
  border: 1px solid #2f3336;
  color: inherit;
  outline: none;
  font: inherit;
}
#rodx-recent-panel .rh-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border-bottom: 1px solid #22262a;
  min-height: 46px;
}
#rodx-recent-panel .rh-open {
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  flex: 1;
  min-width: 0;
  padding: 5px 6px;
  overflow-wrap: anywhere;
}
#rodx-recent-panel .rh-row:is(:hover, :focus-within) {
  background: #16181c;
}
#rodx-recent-panel .rh-query {
  display: block;
  max-height: 42px;
  overflow: hidden;
}
#rodx-recent-panel small {
  display: block;
  color: #71767b;
  font-size: 11px;
}
#rodx-recent-panel .rh-more {
  display: block;
  padding: 10px;
  width: 100%;
  border: 0;
  background: transparent;
  color: #1d9bf0;
}
#rodx-recent-panel .rh-empty {
  padding: 16px;
  color: #71767b;
  text-align: center;
}
`;
      document.head.append(sheet);
    }
    function close() {
      dialog?.remove();
      dialog = null;
    }
    function placePanel() {
      if (!dialog || !launch) return;
      const rect = launch.getBoundingClientRect();
      dialog.style.top = `${Math.max(8, Math.min(window.innerHeight - 160, rect.bottom + 8))}px`;
      dialog.style.left = `${Math.min(window.innerWidth - dialog.offsetWidth - 10, Math.max(10, rect.left - 200))}px`;
    }
    function createPanel() {
      close();
      visible = 40;
      searchTerm = "";
      dialog = document.createElement("div");
      dialog.id = "rodx-recent-panel";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-label", "Pesquisas recentes");
      const header = document.createElement("div");
      header.className = "rh-head";
      const title = document.createElement("strong");
      title.textContent = "Pesquisas recentes";
      const closeBtn = document.createElement("button");
      closeBtn.className = "rh-icon";
      closeBtn.textContent = "×";
      closeBtn.title = "Fechar";
      closeBtn.onclick = close;
      header.append(title, closeBtn);
      const input = document.createElement("input");
      input.placeholder = "Filtrar histórico";
      input.setAttribute("aria-label", "Filtrar pesquisas recentes");
      input.oninput = () => {
        searchTerm = input.value.trim().toLocaleLowerCase();
        visible = 40;
        void renderList();
      };
      const rows = document.createElement("div");
      rows.className = "rh-rows";
      dialog.append(header, input, rows);
      document.body.append(dialog);
      placePanel();
      void renderList();
    }
    async function renderList() {
      if (!dialog) return;
      const generation = ++renderGeneration;
      const account = accountKey();
      const target = dialog.querySelector(".rh-rows");
      try {
        const { rows, more } = await page(account, 0, visible, searchTerm);
        if (generation !== renderGeneration || !dialog || account !== accountKey()) return;
        target.replaceChildren();
        if (!rows.length) {
          const empty = document.createElement("p");
          empty.className = "rh-empty";
          empty.textContent = "Nenhuma pesquisa registrada nesta conta.";
          target.append(empty);
        }
        for (const entry of rows) {
          const row = document.createElement("div");
          row.className = "rh-row";
          const open = document.createElement("button");
          open.className = "rh-open";
          const text = document.createElement("span");
          text.className = "rh-query";
          text.textContent = entry.query;
          const meta = document.createElement("small");
          meta.textContent = `${new Date(entry.lastUsed).toLocaleString("pt-BR")} · ${entry.count}×`;
          open.append(text, meta);
          open.title = "Pesquisar novamente";
          open.onclick = () => {
            close();
            location.assign(hrefFor(entry.query, entry.sort || "live"));
          };
          const del = document.createElement("button");
          del.className = "rh-icon";
          del.textContent = "×";
          del.title = "Remover do histórico";
          del.setAttribute("aria-label", `Remover ${entry.query}`);
          del.onclick = () => {
            void remove(entry.id).then(() => renderList());
          };
          row.append(open, del);
          target.append(row);
        }
        if (more) {
          const moreBtn = document.createElement("button");
          moreBtn.className = "rh-more";
          moreBtn.textContent = "Mostrar mais";
          moreBtn.onclick = () => {
            visible += 40;
            void renderList();
          };
          target.append(moreBtn);
        }
        const options = document.createElement("div");
        options.style.cssText = "display:flex;gap:8px;padding:8px 12px;";
        const edit = document.createElement("button");
        edit.className = "rh-more";
        edit.textContent = "Abrir Query Lab";
        edit.onclick = () => {
          close();
          const current = nativeSearch();
          if (current) captureCurrent();
          else newDraft();
        };
        options.append(edit);
        if (rows.length && !searchTerm) {
          const clear = document.createElement("button");
          clear.className = "rh-more";
          clear.textContent = "Limpar";
          clear.onclick = () => {
            if (confirm("Apagar todas as pesquisas recentes desta conta?")) {
              void clearAccount(account).then(() => renderList());
            }
          };
          options.append(clear);
        }
        target.append(options);
      } catch (err) {
        if (target) {
          target.textContent = `Não foi possível acessar IndexedDB: ${err.message}`;
        }
      }
    }
    function ensureLauncher() {
      const input = document.querySelector('input[data-testid="SearchBox_Search_Input"]');
      if (!input?.isConnected) {
        launch?.remove();
        launch = null;
        close();
        return;
      }
      installStyle();
      if (!launch) {
        launch = document.createElement("div");
        launch.id = "rodx-search-tools";
        const recent = document.createElement("button");
        recent.type = "button";
        recent.textContent = "◷";
        recent.title = "Pesquisas recentes (IndexedDB)";
        recent.setAttribute("aria-label", "Pesquisas recentes");
        recent.onclick = (e) => {
          e.stopPropagation();
          if (dialog) close();
          else createPanel();
        };
        const builder = document.createElement("button");
        builder.type = "button";
        builder.textContent = "⌘";
        builder.title = "Abrir Query Lab";
        builder.setAttribute("aria-label", "Abrir editor de pesquisa");
        builder.onclick = (e) => {
          e.stopPropagation();
          close();
          const c = nativeSearch();
          if (c) captureCurrent();
          else newDraft();
        };
        launch.append(recent, builder);
        document.body.append(launch);
      }
      // Fixed/portal placement means the X header keeps its exact flex tree.
      // Show one button on narrow screens; Query Lab remains in its menu.
      const rect = input.closest('[role="search"]')?.getBoundingClientRect() || input.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;
      let x;
      let two = true;
      if (spaceRight >= 82) x = rect.right + 3;
      else if (spaceLeft >= 82) x = rect.left - 79;
      else {
        two = false;
        x = spaceRight >= 40 ? rect.right + 2 : Math.max(2, rect.left - 39);
      }
      // If X's native More/Clear button occupies the remaining space, keep
      // the single history button INSIDE the search capsule rather than
      // drawing over that native control or forcing the header to wrap.
      const centerY = rect.top + Math.max(0, rect.height / 2);
      const occupied = document.elementFromPoint(x + 19, centerY);
      const competing = occupied?.closest?.('button,[role="button"]');
      const collide = competing && !launch.contains(competing) && !input.contains(competing);
      if (collide) {
        two = false;
        x = Math.max(0, rect.right - 38);
        if (!input.dataset.rodxPaddingSaved) {
          input.dataset.rodxPaddingSaved = "1";
          input.dataset.rodxPaddingRight = input.style.paddingRight || "";
        }
        input.style.paddingRight = "43px";
      } else if (input.dataset.rodxPaddingSaved) {
        input.style.paddingRight = input.dataset.rodxPaddingRight;
        delete input.dataset.rodxPaddingSaved;
        delete input.dataset.rodxPaddingRight;
      }
      launch.children[1].hidden = !two;
      launch.style.left = `${Math.round(x)}px`;
      launch.style.top = `${Math.round(rect.top + Math.max(0, (rect.height - 36) / 2))}px`;
      launch.style.display = rect.width < 60 || rect.bottom < 0 || rect.top > innerHeight ? "none" : "flex";
      if (dialog) placePanel();
      currentRoute();
    }
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener(
      "click",
      (e) => {
        if (dialog && !dialog.contains(e.target) && !launch?.contains(e.target)) close();
      },
      true,
    );
    return Object.freeze({
      ensureLauncher,
      record,
      currentRoute,
      importRemote,
      exportPage,
    });
  })();
}
