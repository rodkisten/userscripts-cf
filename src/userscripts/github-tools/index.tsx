// @ts-nocheck
import { createSignal } from "solid-js";
import { render } from "@solidjs/web";
import { FileToolbar, scanWorkflowSteps, fitGitHubNavigation } from "./ui.tsx";
import { css } from "./GitHub.module.css";

// File listing extraction, bounded downloads and Markdown fencing preserve v1 behavior.
export default {
  init(ctx) {
    const start = () => startGitHub(ctx);
    if (document.readyState === "loading") ctx.listen(document, "DOMContentLoaded", start, { once: true });
    else start();
  },
};
function startGitHub(ctx) {
  const KEY = "gh-native-file-tools:preferences:v1";
  const DEFAULTS = Object.freeze({ sort: "name", direction: "asc", mode: "content" });
  const ROW_SELECTOR = 'tr, [role="row"], .react-directory-row, .js-navigation-item';
  const CONTENT_LIMIT = 12 * 1024 * 1024;
  const SINGLE_FILE_LIMIT = 3 * 1024 * 1024;
  const RETRY_NAV_EVENTS = ["turbo:load", "turbo:render", "pjax:end", "popstate"];
  const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
  const panels = new WeakMap();
  let prefs = readPrefs();
  const [preferences, setPreferences] = createSignal(prefs);
  const mounts = new Map<HTMLElement, () => void>();
  let timer;
  let lastUrl = location.href;

  function readPrefs() {
    try {
      const stored = typeof GM_getValue === "function" ? GM_getValue(KEY, "") : localStorage.getItem(KEY);
      const value = typeof stored === "string" ? JSON.parse(stored || "{}") : stored || {};
      return {
        sort: value.sort === "modified" ? "modified" : "name",
        direction: value.direction === "desc" ? "desc" : "asc",
        mode: value.mode === "paths" ? "paths" : "content",
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function savePrefs(changes) {
    prefs = { ...prefs, ...changes };
    const value = JSON.stringify(prefs);
    try {
      if (typeof GM_setValue === "function") GM_setValue(KEY, value);
      else localStorage.setItem(KEY, value);
    } catch (error) {
      console.warn("[GitHub File Tools] Não foi possível salvar as preferências:", error);
    }
    setPreferences(prefs);
    scheduleScan();
  }

  function repoFromLocation() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo, segment] = parts;
    if (["settings", "notifications", "search", "orgs", "topics", "marketplace"].includes(owner)) return null;
    if (segment && !["tree", "blob"].includes(segment)) return null;
    if (segment === "blob") return null;
    return { owner, repo };
  }

  function getFileLink(row, repo) {
    const links = row.querySelectorAll("a[href]");
    for (const anchor of links) {
      let url;
      try {
        url = new URL(anchor.href, location.href);
      } catch {
        continue;
      }
      if (url.origin !== location.origin) continue;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== repo.owner || parts[1] !== repo.repo) continue;
      if (!["tree", "blob"].includes(parts[2]) || parts.length < 5) continue;
      return { anchor, url, type: parts[2] === "tree" ? "folder" : "file" };
    }
    return null;
  }

  function lastModified(row) {
    for (const element of row.querySelectorAll(
      "relative-time[datetime], time[datetime], [data-time], [data-timestamp], [datetime]",
    )) {
      const raw =
        element.getAttribute("datetime") ||
        element.getAttribute("data-time") ||
        element.getAttribute("data-timestamp");
      if (!raw) continue;
      let timestamp = /^\d{10,13}$/.test(raw) ? Number(raw) : Date.parse(raw);
      if (timestamp > 0 && timestamp < 1e11) timestamp *= 1000;
      if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
    }
    return null;
  }

  function getInfo(row, repo) {
    const link = getFileLink(row, repo);
    if (!link) return null;
    const name =
      link.anchor.textContent.trim() || decodeURIComponent(link.url.pathname.split("/").pop() || "");
    if (!name || name === "..") return null;
    const tail = link.url.pathname.slice(
      `/${repo.owner}/${repo.repo}/${link.type === "file" ? "blob" : "tree"}/`.length,
    );
    return { row, name, type: link.type, href: link.url.href, tail, date: lastModified(row) };
  }

  function listGroups(repo) {
    const main = document.querySelector("main") || document;
    const groups = new Map();
    for (const anchor of main.querySelectorAll('a[href*="/blob/"], a[href*="/tree/"]')) {
      if (
        anchor.closest(
          'aside, nav, [role="tree"], [data-ghft-toolbar], .PRIVATE_TreeView, [data-testid="file-tree"]',
        )
      )
        continue;
      const row = anchor.closest(ROW_SELECTOR);
      if (!row || !row.parentElement || !main.contains(row)) continue;
      const info = getInfo(row, repo);
      if (!info || info.href !== anchor.href) continue;
      const parent = row.parentElement;
      const known =
        parent.matches('tbody, [role="rowgroup"], .react-directory-list, .Box') ||
        row.matches(".react-directory-row, .js-navigation-item") ||
        !!row.closest('table, [role="table"]');
      if (!known) continue;
      if (!groups.has(parent)) groups.set(parent, new Map());
      groups.get(parent).set(row, info);
    }
    return [...groups.entries()]
      .map(([parent, infoMap]) => ({ parent, items: [...infoMap.values()] }))
      .filter((group) => group.items.length > 0);
  }

  function sortGroup(group) {
    const items = group.items.filter((item) => item.row.parentElement === group.parent);
    if (!items.length) return;
    const direction = prefs.direction === "asc" ? 1 : -1;
    const sorted = [...items].sort((a, b) => {
      // Mantém a convenção nativa do GitHub: pastas antes de arquivos.
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      if (prefs.sort === "modified") {
        if (a.date === null && b.date !== null) return 1;
        if (b.date === null && a.date !== null) return -1;
        if (a.date !== null && b.date !== null && a.date !== b.date) {
          return (a.date - b.date) * direction;
        }
      }
      return collator.compare(a.name, b.name) * direction;
    });
    if (items.every((item, i) => item.row === sorted[i].row)) return;

    // Move os nós originais, preservando links, handlers, menus e a UI nativa.
    // O observer reaplica a ordem quando o GitHub substitui a listagem via SPA.
    const original = [...group.parent.children].filter((el) => items.some((item) => item.row === el));
    const followingSibling = original.at(-1).nextSibling;
    for (const item of sorted) group.parent.insertBefore(item.row, followingSibling);
  }

  function attachGroup(group, repo) {
    const previous = panels.get(group.parent);
    if (previous?.isConnected) return previous;
    let listContainer = group.parent;
    if (listContainer.matches('tbody, [role="rowgroup"], .react-directory-list'))
      listContainer = listContainer.closest('table, [role="table"]') || listContainer;
    const toolbar = (
      <div data-ghft-toolbar="" aria-label="Ferramentas para arquivos do GitHub" />
    ) as HTMLDivElement;
    listContainer.before(toolbar);
    const dispose = render(
      () => (
        <FileToolbar
          preferences={preferences}
          save={savePrefs}
          copy={(button) => {
            const items = listGroups(repo).find((entry) => entry.parent === group.parent)?.items || [];
            const files = items.filter((item) => item.type === "file");
            if (prefs.mode === "content" && !files.length) {
              notify("Esta pasta só contém subpastas. Escolha Caminhos.");
              return;
            }
            if (
              prefs.mode === "content" &&
              files.length > 100 &&
              !confirm(`Copiar ${files.length} arquivos?`)
            )
              return;
            copyFiles(items, repo, button);
          }}
        />
      ),
      toolbar,
    );
    mounts.set(toolbar, dispose);
    panels.set(group.parent, toolbar);
    return toolbar;
  }

  function currentRef() {
    const selectors = [
      "#branch-picker-repos-header-ref-selector",
      '[data-testid="branch-selector"]',
      'button[data-hotkey="w"]',
      ".ref-selector",
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element?.textContent?.trim();
      if (value && value.length < 160) return value.replace(/^Branch:\s*/i, "");
    }
    return "";
  }

  function displayPath(item) {
    const decoded = decodeURIComponent(item.tail);
    const ref = currentRef();
    return ref && decoded.startsWith(`${ref}/`) ? decoded.slice(ref.length + 1) : decoded;
  }

  function rawUrl(item, repo) {
    const path = new URL(item.href).pathname;
    const needle = `/${repo.owner}/${repo.repo}/blob/`;
    if (!path.startsWith(needle)) throw new Error(`Link não reconhecido: ${item.name}`);
    return `${location.origin}/${repo.owner}/${repo.repo}/raw/${path.slice(needle.length)}`;
  }

  function parseHeaders(headers) {
    const match = String(headers || "").match(/^content-type:\s*([^\r\n]+)/im);
    return match?.[1]?.toLowerCase() || "";
  }

  function downloadText(url) {
    return new Promise((resolve, reject) => {
      const gmRequest =
        typeof GM_xmlhttpRequest === "function"
          ? GM_xmlhttpRequest
          : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
            ? GM.xmlHttpRequest
            : null;

      if (gmRequest) {
        gmRequest({
          method: "GET",
          url,
          timeout: 45000,
          responseType: "text",
          onload: (result) => {
            if (result.status < 200 || result.status >= 300) {
              reject(new Error(`HTTP ${result.status}`));
              return;
            }
            resolve({
              text: result.responseText ?? result.response ?? "",
              type: parseHeaders(result.responseHeaders),
            });
          },
          ontimeout: () => reject(new Error("Tempo esgotado")),
          onerror: () => reject(new Error("Falha na requisição ao GitHub")),
        });
        return;
      }

      fetch(url, { credentials: "include", redirect: "follow" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          resolve({ text: await response.text(), type: response.headers.get("content-type") || "" });
        })
        .catch(reject);
    });
  }

  function isBinaryOrHTML(text, mime) {
    if (/^(image\/|audio\/|video\/|application\/(pdf|zip|octet-stream|wasm))/.test(mime)) return true;
    if (text.includes("\u0000")) return true;
    // Não descartar arquivos .html legítimos. Rejeitar páginas de login/erro do GitHub.
    if (
      /^\s*<!doctype html|^\s*<html[\s>]/i.test(text.slice(0, 500)) &&
      /<title>[^<]*(?:GitHub · Sign in|Sign in to GitHub|404 · GitHub|Rate limit)[^<]*<\/title>/i.test(text)
    )
      return true;
    return false;
  }

  async function fetchContents(items, repo, progress) {
    const results = Array(items.length);
    let next = 0;
    let finished = 0;
    let totalBytes = 0;
    const pool = Math.min(3, items.length);

    await Promise.all(
      Array.from({ length: pool }, async () => {
        while (next < items.length) {
          const index = next++;
          const item = items[index];
          try {
            const { text, type } = await downloadText(rawUrl(item, repo));
            if (isBinaryOrHTML(text, type)) throw new Error("binário ou página HTML");
            const bytes = new Blob([text]).size;
            if (bytes > SINGLE_FILE_LIMIT) throw new Error("arquivo acima de 3 MB");
            totalBytes += bytes;
            if (totalBytes > CONTENT_LIMIT) throw new Error("limite total de 12 MB excedido");
            results[index] = { item, text };
          } catch (error) {
            results[index] = { item, error: error.message || String(error) };
          } finally {
            progress(++finished, items.length);
          }
        }
      }),
    );
    return results;
  }

  function languageFor(filename) {
    const extension = filename.split(".").pop()?.toLowerCase();
    return (
      {
        ts: "ts",
        tsx: "tsx",
        js: "js",
        jsx: "jsx",
        py: "python",
        sh: "bash",
        yml: "yaml",
        yaml: "yaml",
        md: "markdown",
        json: "json",
        css: "css",
        html: "html",
        rs: "rust",
        go: "go",
        rb: "ruby",
        c: "c",
        cpp: "cpp",
        h: "c",
        java: "java",
        kt: "kotlin",
        swift: "swift",
        sql: "sql",
        xml: "xml",
        toml: "toml",
        php: "php",
        vue: "vue",
        svelte: "svelte",
        dockerfile: "dockerfile",
      }[extension] || ""
    );
  }

  function fenceFor(text) {
    const sequences = text.match(/`{3,}/g) || [];
    const maximum = sequences.reduce((n, sequence) => Math.max(n, sequence.length), 2);
    return "`".repeat(maximum + 1);
  }

  async function makeCopyText(items, repo, mode, progress) {
    const header = `# ${repo.owner}/${repo.repo}\nFonte: ${location.href}\n`;
    if (mode === "paths") {
      return `${header}\n${items.map((item) => `${item.type === "folder" ? "📁" : "📄"} ${displayPath(item)}`).join("\n")}\n`;
    }
    const files = items.filter((item) => item.type === "file");
    const results = await fetchContents(files, repo, progress);
    const successful = results.filter((item) => !item.error);
    if (!successful.length)
      throw new Error("Não consegui ler nenhum arquivo. Verifique o acesso ao repositório.");
    const sections = results.map((result) => {
      const path = displayPath(result.item);
      if (result.error) return `## ${path}\n[Não copiado: ${result.error}]`;
      const fence = fenceFor(result.text);
      return `## ${path}\n${fence}${languageFor(path)}\n${result.text.replace(/\n*$/, "")}\n${fence}`;
    });
    const ignored = items.filter((item) => item.type === "folder").length;
    return `${header}\n${sections.join("\n\n")}\n\n${ignored ? `> ${ignored} subpasta(s) não incluídas. Use “Caminhos” para copiá-las.\n` : ""}`;
  }

  async function setClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      await GM_setClipboard(text, "text");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fallback para Safari/gerenciadores sem permissão */
    }
    const input = (<textarea readonly />) as HTMLTextAreaElement;
    input.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;";
    input.value = text;
    document.body.append(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length);
    const success = document.execCommand("copy");
    input.remove();
    if (!success) throw new Error("O Safari não permitiu a cópia. Autorize a área de transferência.");
  }

  function writeClipboardOnGesture(textPromise) {
    // Safari móvel exige que a escrita seja iniciada dentro do clique.
    // O ClipboardItem recebe o Blob futuramente, depois dos downloads.
    if (
      typeof GM_setClipboard !== "function" &&
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard?.write
    ) {
      try {
        const item = new ClipboardItem({
          "text/plain": textPromise.then((text) => new Blob([text], { type: "text/plain" })),
        });
        return navigator.clipboard.write([item]).catch(async () => setClipboard(await textPromise));
      } catch {
        /* cair para o método alternativo */
      }
    }
    return textPromise.then(setClipboard);
  }

  function copyFiles(items, repo, targetButton) {
    if (!items.length) return;
    const mode = prefs.mode;
    const original = targetButton.textContent;
    targetButton.disabled = true;
    targetButton.textContent = "Preparando…";
    const progress = (current, total) => {
      targetButton.textContent = `Lendo ${current}/${total}…`;
    };
    // A chamada abaixo ocorre diretamente no evento de clique.
    const textPromise = makeCopyText(items, repo, mode, progress);
    writeClipboardOnGesture(textPromise)
      .then(() => {
        const files = items.filter((item) => item.type === "file").length;
        notify(
          mode === "paths"
            ? `${items.length} caminhos copiados.`
            : `Conteúdo de até ${files} arquivos copiado.`,
          false,
        );
      })
      .catch((error) => {
        console.warn("[GitHub File Tools]", error);
        notify(`Não foi possível copiar: ${error.message}`, true);
      })
      .finally(() => {
        targetButton.disabled = false;
        targetButton.textContent = original;
      });
  }

  function notify(message, error = false) {
    ctx.toaster({ title: message, variant: error ? "error" : "success" });
  }

  const fitNavigation = fitGitHubNavigation(ctx);
  function scan() {
    fitNavigation();
    for (const [node, dispose] of mounts) {
      if (!node.isConnected) {
        dispose();
        mounts.delete(node);
      }
    }
    scanWorkflowSteps(ctx, mounts);

    const repo = repoFromLocation();
    if (!repo) {
      document.querySelectorAll("[data-ghft-toolbar]").forEach((node) => node.remove());
      return;
    }
    const groups = listGroups(repo);
    for (const group of groups) {
      const toolbar = attachGroup(group, repo);
      const missingDates = group.items.filter((item) => item.date === null).length;
      const hint = toolbar.querySelector("[data-ghft-hint]");
      hint.textContent =
        prefs.sort === "modified" && missingDates
          ? `${missingDates} sem data`
          : `${group.items.length} itens`;
      hint.title =
        missingDates && prefs.sort === "modified"
          ? "Itens sem a data do último commit aparecem por último em cada grupo."
          : "";
      sortGroup(group);
    }
  }

  function scheduleScan() {
    clearTimeout(timer);
    timer = setTimeout(scan, 180);
  }

  ctx.pageStyle(css);
  if (typeof GM_registerMenuCommand === "function") {
    const id = GM_registerMenuCommand("GitHub · Token para logs (Actions: read)", async () => {
      const token = prompt(
        "Token GitHub com Actions: read (vazio remove o token). Não é enviado a outros hosts.",
      );
      if (token !== null) await ctx.storage.set("actionsToken", token.trim());
    });
    ctx.onDispose(() => {
      if (typeof GM_unregisterMenuCommand === "function") GM_unregisterMenuCommand(id);
    });
  }

  const observer = new MutationObserver((records) => {
    if (
      records.every(
        (record) =>
          record.target.nodeType === 1 &&
          record.target.closest?.("[data-ghft-toolbar], [data-ghft-step-host], #ghft-toast"),
      )
    )
      return;
    if (lastUrl !== location.href) lastUrl = location.href;
    scheduleScan();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["datetime", "data-time"],
  });

  for (const event of RETRY_NAV_EVENTS) ctx.listen(window, event, scheduleScan);
  const interval = setInterval(() => {
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      scheduleScan();
    }
  }, 1200);
  scheduleScan();

  ctx.onDispose(() => {
    observer.disconnect();
    clearInterval(interval);
    clearTimeout(timer);
    for (const [node, dispose] of mounts) {
      dispose();
      node.remove();
    }
    mounts.clear();
  });
}
