import { gmClipboard } from "../../runtime/userscript-capabilities.ts";
import { fitGitHubNavigation } from "./navigation.ts";
import { decorateGitHubFiles } from "./material-icons.ts";
import { mountDirectoryTree, restoreGitHubTreeScroll } from "./directory-tree.tsx";
import { mountGitHubDashboard, FileCommit } from "./dashboard.tsx";
import { useSyncExternalStore, type ReactElement } from "react";
import { FileToolbar, scanWorkflowSteps, GitHubTokenSettings } from "./ui.tsx";
import styles, { css } from "./GitHub.module.css";

type ReactMount = { host: HTMLElement; dispose: () => void };

/** Every GitHub Tools mount is a portal owned by this script's shared runtime. */
function mountReactPoint(
  ctx: any,
  parent: Node,
  node: ReactElement,
  options: { before?: Node | null; tag?: string; shadow?: boolean; styles?: string[] } = {},
): ReactMount {
  const host = document.createElement(options.tag || "div");
  const target = options.shadow ? host.attachShadow({ mode: "open" }) : host;
  if (options.shadow && options.styles?.length) {
    const style = document.createElement("style");
    style.textContent = options.styles.join("\n");
    target.append(style);
  }
  const portalContainer = document.createElement("div");
  target.append(portalContainer);
  parent.insertBefore(host, options.before || null);
  try {
    const mount = ctx.ui.mountReact(node, portalContainer);
    let disposed = false;
    return {
      host,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        mount.dispose();
        host.remove();
      },
    };
  } catch (error) {
    host.remove();
    throw error;
  }
}

// ============================================================================
// Constantes Semânticas
// ============================================================================
const PREFERENCES_STORAGE_KEY = "gh-native-file-tools:preferences:v1";
const DEFAULT_SORT_MODE = "name";
const DEFAULT_DIRECTION_MODE = "asc";
const DEFAULT_CONTENT_MODE = "content";
const MODIFIED_SORT_VALUE = "modified";
const DESC_DIRECTION_VALUE = "desc";
const PATHS_MODE_VALUE = "paths";

const DIRECTORY_ROW_SELECTOR = 'tr, [role="row"], .react-directory-row, .js-navigation-item';
const TIME_ELEMENT_SELECTORS =
  "relative-time[datetime], time[datetime], [data-time], [data-timestamp], [datetime]";
const BRANCH_PICKER_SELECTORS = [
  "#branch-picker-repos-header-ref-selector",
  '[data-testid="branch-selector"]',
  'button[data-hotkey="w"]',
  ".ref-selector",
];

const IGNORED_OWNER_SETTINGS = ["settings", "notifications", "search", "orgs", "topics", "marketplace"];
const ALLOWED_REPO_SEGMENTS = ["tree", "blob"];
const BLOB_SEGMENT = "blob";
const TREE_SEGMENT = "tree";

const CONTENT_LIMIT_BYTES = 12 * 1024 * 1024;
const SINGLE_FILE_LIMIT_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45000;
const SCHEDULE_SCAN_DEBOUNCE_MS = 180;
const URL_POLL_INTERVAL_MS = 1200;
const PARALLEL_DOWNLOAD_POOL = 3;
const MAX_STRING_SLICE_LIMIT = 160;
const BINARY_CHECK_SLICE_SIZE = 500;
const TIMESTAMP_LOWER_BOUND = 1e11;

const GITHUB_DATE_LOCALE = "pt-BR";
const ERROR_BINARY_OR_HTML = "binário ou página HTML";
const ERROR_EXCEEDED_SINGLE_LIMIT = "arquivo acima de 3 MB";
const ERROR_EXCEEDED_TOTAL_LIMIT = "limite total de 12 MB excedido";
const ERROR_FETCH_FAILED = "Falha na requisição ao GitHub";
const ERROR_TIMEOUT = "Tempo esgotado";

const NAVIGATION_RETRY_EVENTS = ["turbo:load", "turbo:render", "pjax:end", "popstate"];

// ============================================================================
// Tipos e Interfaces Auxiliares
// ============================================================================
export interface GitHubPreferences {
  sort: "name" | "modified";
  direction: "asc" | "desc";
  mode: "content" | "paths";
}

export interface RepositoryInfo {
  owner: string;
  repo: string;
}

export interface FileItemInfo {
  row: Element;
  name: string;
  type: "file" | "folder";
  href: string;
  tail: string;
  date: number | null;
}

export interface DirectoryGroup {
  parent: Element;
  items: FileItemInfo[];
}

export interface FileLinkResult {
  anchor: HTMLAnchorElement;
  url: URL;
  type: "file" | "folder";
}

// ============================================================================
// Módulo Principal (Default Export)
// ============================================================================
export default {
  init(ctx: any): void {
    const start = () => startGitHub(ctx);
    if (document.readyState === "loading") {
      ctx.listen(document, "DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  },
};

// ============================================================================
// Funções Auxiliares Semânticas de Gerenciamento de Preferências
// ============================================================================
function normalizeUserPreferences(stored: unknown): GitHubPreferences {
  let value: Record<string, unknown> = {};
  try {
    const parsed = typeof stored === "string" ? JSON.parse(stored || "{}") : stored;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      value = parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupt legacy preferences must not prevent GitHub Tools from loading.
  }
  return {
    sort: value.sort === MODIFIED_SORT_VALUE ? MODIFIED_SORT_VALUE : DEFAULT_SORT_MODE,
    direction: value.direction === DESC_DIRECTION_VALUE ? DESC_DIRECTION_VALUE : DEFAULT_DIRECTION_MODE,
    mode: value.mode === PATHS_MODE_VALUE ? PATHS_MODE_VALUE : DEFAULT_CONTENT_MODE,
  };
}

// ============================================================================
// Funções Auxiliares Semânticas de Extração do GitHub
// ============================================================================
function extractRepositoryFromLocation(): RepositoryInfo | null {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const [owner, repo, segment] = parts;
  if (IGNORED_OWNER_SETTINGS.includes(owner)) {
    return null;
  }
  if (segment && !ALLOWED_REPO_SEGMENTS.includes(segment)) {
    return null;
  }
  if (segment === BLOB_SEGMENT) {
    return null;
  }
  return { owner, repo };
}

function extractFileLinkFromRow(row: Element, repo: RepositoryInfo): FileLinkResult | null {
  const links = row.querySelectorAll("a[href]");
  for (const anchor of links) {
    let url: URL;
    try {
      url = new URL((anchor as HTMLAnchorElement).href, location.href);
    } catch {
      continue;
    }
    if (url.origin !== location.origin) {
      continue;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== repo.owner || parts[1] !== repo.repo) {
      continue;
    }
    if (!ALLOWED_REPO_SEGMENTS.includes(parts[2]) || parts.length < 5) {
      continue;
    }
    return { anchor: anchor as HTMLAnchorElement, url, type: parts[2] === TREE_SEGMENT ? "folder" : "file" };
  }
  return null;
}

function extractRowLastModifiedTimestamp(row: Element): number | null {
  for (const element of row.querySelectorAll(TIME_ELEMENT_SELECTORS)) {
    const raw =
      element.getAttribute("datetime") ||
      element.getAttribute("data-time") ||
      element.getAttribute("data-timestamp");
    if (!raw) {
      continue;
    }
    let timestamp = /^\d{10,13}$/.test(raw) ? Number(raw) : Date.parse(raw);
    if (timestamp > 0 && timestamp < TIMESTAMP_LOWER_BOUND) {
      timestamp *= 1000;
    }
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }
  }
  return null;
}

function extractRowFileInfo(row: Element, repo: RepositoryInfo): FileItemInfo | null {
  const link = extractFileLinkFromRow(row, repo);
  if (!link) {
    return null;
  }
  const name = link.anchor.textContent.trim() || decodeURIComponent(link.url.pathname.split("/").pop() || "");
  if (!name || name === "..") {
    return null;
  }
  const tail = link.url.pathname.slice(
    `/${repo.owner}/${repo.repo}/${link.type === "file" ? BLOB_SEGMENT : TREE_SEGMENT}/`.length,
  );
  return {
    row,
    name,
    type: link.type,
    href: link.url.href,
    tail,
    date: extractRowLastModifiedTimestamp(row),
  };
}

function collectRepositoryDirectoryGroups(repo: RepositoryInfo): DirectoryGroup[] {
  const main = document.querySelector("main") || document;
  const groups = new Map<Element, Map<Element, FileItemInfo>>();

  for (const anchor of main.querySelectorAll<HTMLAnchorElement>('a[href*="/blob/"], a[href*="/tree/"]')) {
    if (
      anchor.closest(
        'aside, nav, [role="tree"], [data-ghft-toolbar], .PRIVATE_TreeView, [data-testid="file-tree"]',
      )
    ) {
      continue;
    }
    const row = anchor.closest(DIRECTORY_ROW_SELECTOR);
    if (!row || !row.parentElement || !main.contains(row)) {
      continue;
    }
    const info = extractRowFileInfo(row, repo);
    if (!info || info.href !== anchor.href) {
      continue;
    }
    const parent = row.parentElement;
    const known =
      parent.matches('tbody, [role="rowgroup"], .react-directory-list, .Box') ||
      row.matches(".react-directory-row, .js-navigation-item") ||
      !!row.closest('table, [role="table"]');
    if (!known) {
      continue;
    }
    if (!groups.has(parent)) {
      groups.set(parent, new Map());
    }
    groups.get(parent)!.set(row, info);
  }

  return [...groups.entries()]
    .map(([parent, infoMap]) => ({ parent, items: [...infoMap.values()] }))
    .filter((group) => group.items.length > 0);
}

function resolveCurrentRepositoryReference(): string {
  for (const selector of BRANCH_PICKER_SELECTORS) {
    const element = document.querySelector(selector);
    const value = element?.textContent?.trim();
    if (value && value.length < MAX_STRING_SLICE_LIMIT) {
      return value.replace(/^Branch:\s*/i, "");
    }
  }
  return "";
}

function formatDisplayPathForItem(item: FileItemInfo): string {
  const decoded = decodeURIComponent(item.tail);
  const ref = resolveCurrentRepositoryReference();
  return ref && decoded.startsWith(`${ref}/`) ? decoded.slice(ref.length + 1) : decoded;
}

function buildRawFileUrl(item: FileItemInfo, repo: RepositoryInfo): string {
  const path = new URL(item.href).pathname;
  const needle = `/${repo.owner}/${repo.repo}/${BLOB_SEGMENT}/`;
  if (!path.startsWith(needle)) {
    throw new Error(`Link não reconhecido: ${item.name}`);
  }
  return `${location.origin}/${repo.owner}/${repo.repo}/raw/${path.slice(needle.length)}`;
}

function extractHttpHeaderContentType(headers: string): string {
  const match = String(headers || "").match(/^content-type:\s*([^\r\n]+)/im);
  return match?.[1]?.toLowerCase() || "";
}

// ============================================================================
// Funções Auxiliares Semânticas de Download e Manipulação de Arquivos
// ============================================================================
function downloadRawTextContent(url: string): Promise<{ text: string; type: string }> {
  return new Promise<{ text: string; type: string }>((resolve, reject) => {
    const gmRequest =
      typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : typeof GM !== "undefined" && typeof (GM as any).xmlHttpRequest === "function"
          ? (GM as any).xmlHttpRequest
          : null;

    if (gmRequest) {
      gmRequest({
        method: "GET",
        url,
        timeout: FETCH_TIMEOUT_MS,
        responseType: "text",
        onload: (result: any) => {
          if (result.status < 200 || result.status >= 300) {
            reject(new Error(`HTTP ${result.status}`));
            return;
          }
          resolve({
            text: result.responseText ?? result.response ?? "",
            type: extractHttpHeaderContentType(result.responseHeaders),
          });
        },
        ontimeout: () => reject(new Error(ERROR_TIMEOUT)),
        onerror: () => reject(new Error(ERROR_FETCH_FAILED)),
      });
      return;
    }

    fetch(url, { credentials: "include", redirect: "follow" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        resolve({ text: await response.text(), type: response.headers.get("content-type") || "" });
      })
      .catch(reject);
  });
}

function isContentBinaryOrGitHubErrorPage(text: string, mime: string): boolean {
  if (/^(image\/|audio\/|video\/|application\/(pdf|zip|octet-stream|wasm))/.test(mime)) {
    return true;
  }
  if (text.includes("\u0000")) {
    return true;
  }
  if (
    /^\s*<!doctype html|^\s*<html[\s>]/i.test(text.slice(0, BINARY_CHECK_SLICE_SIZE)) &&
    /<title>[^<]*(?:GitHub · Sign in|Sign in to GitHub|404 · GitHub|Rate limit)[^<]*<\/title>/i.test(text)
  ) {
    return true;
  }
  return false;
}

async function fetchMultipleFileContents(
  items: FileItemInfo[],
  repo: RepositoryInfo,
  progress: (done: number, total: number) => void,
): Promise<Array<{ item: FileItemInfo; text?: string; error?: string }>> {
  const results: Array<{ item: FileItemInfo; text?: string; error?: string }> = Array(items.length);
  let next = 0;
  let finished = 0;
  let totalBytes = 0;
  const pool = Math.min(PARALLEL_DOWNLOAD_POOL, items.length);

  await Promise.all(
    Array.from({ length: pool }, async () => {
      while (next < items.length) {
        const index = next++;
        const item = items[index];
        try {
          const { text, type } = await downloadRawTextContent(buildRawFileUrl(item, repo));
          if (isContentBinaryOrGitHubErrorPage(text, type)) {
            throw new Error(ERROR_BINARY_OR_HTML);
          }
          const bytes = new Blob([text]).size;
          if (bytes > SINGLE_FILE_LIMIT_BYTES) {
            throw new Error(ERROR_EXCEEDED_SINGLE_LIMIT);
          }
          totalBytes += bytes;
          if (totalBytes > CONTENT_LIMIT_BYTES) {
            throw new Error(ERROR_EXCEEDED_TOTAL_LIMIT);
          }
          results[index] = { item, text };
        } catch (error: any) {
          results[index] = { item, error: error?.message || String(error) };
        } finally {
          progress(++finished, items.length);
        }
      }
    }),
  );
  return results;
}

function detectCodeLanguageForFilename(filename: string): string {
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
    }[extension || ""] || ""
  );
}

function calculateMarkdownCodeFence(text: string): string {
  const sequences: string[] = text.match(/`{3,}/g) ?? [];
  const maximum = sequences.reduce<number>((n, sequence) => Math.max(n, sequence.length), 2);
  return "`".repeat(maximum + 1);
}

async function buildCombinedClipboardText(
  items: FileItemInfo[],
  repo: RepositoryInfo,
  mode: "content" | "paths",
  progress: (done: number, total: number) => void,
): Promise<string> {
  const header = `# ${repo.owner}/${repo.repo}\nFonte: ${location.href}\n`;
  if (mode === PATHS_MODE_VALUE) {
    return `${header}\n${items.map((item) => `${item.type === "folder" ? "📁" : "📄"} ${formatDisplayPathForItem(item)}`).join("\n")}\n`;
  }
  const files = items.filter((item) => item.type === "file");
  const results = await fetchMultipleFileContents(files, repo, progress);
  const successful = results.filter((item) => !item.error);
  if (!successful.length) {
    throw new Error("Não consegui ler nenhum arquivo. Verifique o acesso ao repositório.");
  }
  const sections = results.map((result) => {
    const path = formatDisplayPathForItem(result.item);
    if (result.error) {
      return `## ${path}\n[Não copiado: ${result.error}]`;
    }
    const fence = calculateMarkdownCodeFence(result.text!);
    return `## ${path}\n${fence}${detectCodeLanguageForFilename(path)}\n${result.text!.replace(/\n*$/, "")}\n${fence}`;
  });
  const ignored = items.filter((item) => item.type === "folder").length;
  return `${header}\n${sections.join("\n\n")}\n\n${ignored ? `> ${ignored} subpasta(s) não incluídas. Use “Caminhos” para copiá-las.\n` : ""}`;
}

async function handleClipboardWriteGesture(textPromise: Promise<string>): Promise<void> {
  const clipboard = gmClipboard();
  if (!clipboard) {
    await textPromise.catch(() => undefined);
    throw new Error("Clipboard indisponível: verifique o grant GM_setClipboard.");
  }
  await clipboard(await textPromise, "text");
}

function copyDirectoryItemsToClipboard(
  items: FileItemInfo[],
  repo: RepositoryInfo,
  prefs: GitHubPreferences,
  progress: (done: number, total: number) => void,
): Promise<void> {
  if (!items.length) {
    return Promise.resolve();
  }
  const mode = prefs.mode;
  return handleClipboardWriteGesture(buildCombinedClipboardText(items, repo, mode, progress));
}

// ============================================================================
// Função de Inicialização e Varredura do GitHub (StartGitHub)
// ============================================================================
function startGitHub(ctx: any): void {
  const collator = new Intl.Collator(GITHUB_DATE_LOCALE, { numeric: true, sensitivity: "base" });
  const panels = new WeakMap<Element, any>();
  // Preferences are owned by this userscript instance, not by a React hook.
  // React components receive the latest snapshot when the toolbar is rendered.
  let prefs = normalizeUserPreferences(null);
  const setPreferences = (next: GitHubPreferences): void => {
    prefs = next;
  };
  let preferencesChanged = false;
  // Hydrate asynchronously; never overwrite edits made while loading.
  void (async () => {
    try {
      let saved = await ctx.storage.get(PREFERENCES_STORAGE_KEY);
      if (saved === undefined) {
        // One-time migration from the older Tampermonkey key.
        const legacy = ctx.gm?.legacy?.getValue;
        if (typeof legacy === "function") {
          saved = await Promise.resolve(legacy(PREFERENCES_STORAGE_KEY, ""));
          if (saved !== "" && saved !== undefined) {
            await ctx.storage.set(PREFERENCES_STORAGE_KEY, normalizeUserPreferences(saved));
          }
        }
      }
      if (!ctx.signal.aborted && !preferencesChanged) {
        setPreferences(normalizeUserPreferences(saved));
        scheduleScan();
      }
    } catch (error) {
      console.warn("[GitHub File Tools] Falha ao carregar preferências:", error);
    }
  })();
  const mounts = new Map<HTMLElement, () => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastUrl = location.href;
  let restoreScrollAfterHistoryNavigation = false;

  // Keep GitHub's scroll position before the custom tree follows a file or folder.
  // The key is the source route, so Back restores that exact listing position.
  ctx.listen(
    document,
    "click",
    (event: Event) => {
      const path = event.composedPath();
      const inTree = path.some((node) => node instanceof Element && node.matches("[data-ghft-tree-host]"));
      if (!inTree) {
        return;
      }
      const anchor = path.find(
        (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement && node.matches("a[href]"),
      );
      if (!anchor) {
        return;
      }
      try {
        const target = new URL(anchor.href, location.href);
        if (target.origin !== location.origin || !/^\/(?:[^/]+\/){2}(?:tree|blob)\//.test(target.pathname)) {
          return;
        }
        sessionStorage.setItem(
          `ghft:scroll:${location.pathname}`,
          String(window.scrollY || document.documentElement.scrollTop || 0),
        );
      } catch {
        // Scroll restoration is an enhancement; storage may be blocked in private mode.
      }
    },
    true,
  );

  function savePrefs(changes: Partial<GitHubPreferences>) {
    preferencesChanged = true;
    const next = { ...prefs, ...changes };
    setPreferences(next);
    void ctx.storage.set(PREFERENCES_STORAGE_KEY, next).catch((error: unknown) => {
      console.warn("[GitHub File Tools] Falha ao salvar preferências:", error);
    });
    scheduleScan();
  }

  function sortDirectoryGroup(group: DirectoryGroup) {
    const items = group.items.filter((item) => item.row.parentElement === group.parent);
    if (!items.length) {
      return;
    }
    const direction = prefs.direction === DEFAULT_DIRECTION_MODE ? 1 : -1;
    const sorted = [...items].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      if (prefs.sort === MODIFIED_SORT_VALUE) {
        if (a.date === null && b.date !== null) {
          return 1;
        }
        if (b.date === null && a.date !== null) {
          return -1;
        }
        if (a.date !== null && b.date !== null && a.date !== b.date) {
          return (a.date - b.date) * direction;
        }
      }
      return collator.compare(a.name, b.name) * direction;
    });
    if (items.every((item, i) => item.row === sorted[i].row)) {
      return;
    }

    const original = [...group.parent.children].filter((el) => items.some((item) => item.row === el));
    const followingSibling = original.at(-1)?.nextSibling;
    for (const item of sorted) {
      group.parent.insertBefore(item.row, followingSibling || null);
    }
  }

  function attachGroupToolbar(group: DirectoryGroup, repo: RepositoryInfo, restoreScroll = false) {
    const previous = panels.get(group.parent);
    if (previous?.host.isConnected) {
      if (restoreScroll) {
        restoreGitHubTreeScroll();
      }
      return previous;
    }
    let listContainer = group.parent;
    if (listContainer.matches('tbody, [role="rowgroup"], .react-directory-list')) {
      listContainer = listContainer.closest('table, [role="table"]') || listContainer;
    }
    let info = { hint: "", title: "" };
    const infoListeners = new Set<() => void>();
    const subscribeInfo = (notify: () => void) => {
      infoListeners.add(notify);
      return () => {
        infoListeners.delete(notify);
      };
    };
    const copyFiles = (progress: (current: number, total: number) => void) => {
      const items =
        collectRepositoryDirectoryGroups(repo).find((entry) => entry.parent === group.parent)?.items || [];
      const files = items.filter((item) => item.type === "file");
      if (prefs.mode === DEFAULT_CONTENT_MODE && !files.length) {
        return Promise.reject(Error("Esta pasta só contém subpastas. Escolha Caminhos."));
      }
      if (
        prefs.mode === DEFAULT_CONTENT_MODE &&
        files.length > 100 &&
        !confirm(`Copiar ${files.length} arquivos?`)
      ) {
        return Promise.resolve();
      }
      return copyDirectoryItemsToClipboard(items, repo, prefs, progress);
    };
    function ToolbarView() {
      const currentInfo = useSyncExternalStore(subscribeInfo, () => info);
      return <FileToolbar preferences={prefs} info={currentInfo} save={savePrefs} copy={copyFiles} />;
    }
    const mount = mountReactPoint(ctx, listContainer.parentNode!, <ToolbarView />, {
      before: listContainer,
      shadow: true,
      styles: [css],
    });
    mount.host.dataset.ghftToolbar = "";
    mounts.set(mount.host, mount.dispose);
    const disposeTree = mountDirectoryTree(ctx, listContainer, repo, restoreScroll);
    mounts.set(listContainer as HTMLElement, disposeTree);
    const record = {
      host: mount.host,
      update(hint: string, title: string) {
        info = { hint, title };
        infoListeners.forEach((notify) => notify());
      },
    };
    panels.set(group.parent, record);
    return record;
  }

  const dashboard = mountGitHubDashboard(ctx);
  decorateGitHubFiles(ctx);
  const favoriteHosts = new WeakSet<Element>();
  const fitNavigation = fitGitHubNavigation(ctx);

  function scan() {
    fitNavigation();
    const restoreScroll = restoreScrollAfterHistoryNavigation;
    restoreScrollAfterHistoryNavigation = false;
    for (const [node, dispose] of mounts) {
      if (!node.isConnected) {
        dispose();
        mounts.delete(node);
      }
    }
    scanWorkflowSteps(ctx, mounts);

    const repo = extractRepositoryFromLocation();
    if (!repo) {
      document.querySelectorAll("[data-ghft-toolbar]").forEach((node) => node.remove());
      return;
    }
    const groups = collectRepositoryDirectoryGroups(repo);
    for (const group of groups) {
      for (const item of group.items) {
        if (favoriteHosts.has(item.row)) {
          continue;
        }
        favoriteHosts.add(item.row);
        const anchor =
          item.row.querySelector('a[href="' + CSS.escape(new URL(item.href).pathname) + '"]') ||
          item.row.querySelector("a[href]");
        if (!anchor) {
          continue;
        }
        const mount = mountReactPoint(
          ctx,
          anchor.parentNode!,
          <button
            type="button"
            className={styles.button}
            title={"Favoritar " + item.name}
            aria-label={"Favoritar " + item.name}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dashboard.toggleFile(item.name, item.href);
            }}
          >
            ☆
          </button>,
          { tag: "span", before: anchor, shadow: true, styles: [css] },
        );
        mounts.set(mount.host, mount.dispose);
        if (item.type === "file") {
          const path = formatDisplayPathForItem(item);
          const commitMount = mountReactPoint(
            ctx,
            item.row,
            <FileCommit ctx={ctx} owner={repo.owner} repo={repo.repo} path={path} href={item.href} />,
            { tag: "span", shadow: true, styles: [css] },
          );
          mounts.set(commitMount.host, commitMount.dispose);
        }
      }
      const toolbar = attachGroupToolbar(group, repo, restoreScroll);
      const missingDates = group.items.filter((item) => item.date === null).length;
      toolbar.update(
        prefs.sort === MODIFIED_SORT_VALUE && missingDates
          ? `${missingDates} sem data`
          : `${group.items.length} itens`,
        missingDates && prefs.sort === MODIFIED_SORT_VALUE
          ? "Itens sem data aparecem por último em cada grupo."
          : "",
      );
      sortDirectoryGroup(group);
    }
  }

  function scheduleScan() {
    clearTimeout(timer);
    timer = setTimeout(scan, SCHEDULE_SCAN_DEBOUNCE_MS);
  }

  let tokenDialog: ReactMount | undefined;
  let tokenRequest = 0;
  if (typeof GM_registerMenuCommand === "function") {
    const id = GM_registerMenuCommand("GitHub · Token para logs (Actions: read)", async () => {
      const request = ++tokenRequest;
      const token = await ctx.storage.get("actionsToken", "");
      if (ctx.signal.aborted || request !== tokenRequest) {
        return;
      }
      tokenDialog?.dispose();
      tokenDialog = mountReactPoint(
        ctx,
        document.body,
        <GitHubTokenSettings
          token={token}
          close={() => tokenDialog?.dispose()}
          save={async (next) => {
            await ctx.storage.set("actionsToken", next);
            tokenDialog?.dispose();
          }}
        />,
        { shadow: true, styles: [css] },
      );
    });
    ctx.onDispose(() => {
      tokenRequest++;
      tokenDialog?.dispose();
      if (typeof GM_unregisterMenuCommand === "function") {
        GM_unregisterMenuCommand(id);
      }
    });
  }

  const observer = new MutationObserver((records) => {
    if (
      records.every(
        (record) =>
          record.target.nodeType === 1 &&
          (record.target as Element).closest?.("[data-ghft-toolbar], [data-ghft-step-host], #ghft-toast"),
      )
    ) {
      return;
    }
    if (lastUrl !== location.href) {
      lastUrl = location.href;
    }
    scheduleScan();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["datetime", "data-time"],
  });

  for (const event of NAVIGATION_RETRY_EVENTS.filter((name) => name !== "popstate")) {
    ctx.listen(window, event, scheduleScan);
  }
  ctx.listen(window, "popstate", () => {
    restoreScrollAfterHistoryNavigation = true;
    scheduleScan();
  });
  const interval = setInterval(() => {
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      scheduleScan();
    }
  }, URL_POLL_INTERVAL_MS);
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
