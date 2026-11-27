import { useState, useSyncExternalStore } from "react";
import { CopyPlus } from "lucide-react";
import {
  FileTree,
  buildTree,
  filterTree,
  type FileTreeEntry as Entry,
  type FileTreeNode as Node,
} from "../../runtime/react-ui/uai/file-tree";
import themeCss from "../../runtime/react-ui/theme.css?inline";
import styles, { css } from "./GitHub.module.css";

type CopyActions = { appendFile: (href: string, path: string) => Promise<void>; reset: () => void };
export { buildTree, filterTree };
export function splitTreeLocation(
  segments: string[],
  ref: string,
): { branch: string; current: string } | null {
  const refParts = ref.split("/");
  if (!ref || refParts.some((part, i) => segments[i] !== part)) {
    return null;
  }
  return { branch: ref, current: segments.slice(refParts.length).join("/") };
}
export function selectedGitHubRef(): string {
  const selectors = [
    "#branch-picker-repos-header-ref-selector",
    '[data-testid="branch-selector"]',
    'button[data-hotkey="w"]',
    ".ref-selector",
  ];
  for (const selector of selectors) {
    const label = document.querySelector(selector)?.textContent?.trim();
    if (label) {
      return label.replace(/^Branch:\s*/i, "").trim();
    }
  }
  return "";
}

const selectionStores = new Map<string, { paths: Set<string>; listeners: Set<() => void> }>();
const emptySelection = new Set<string>();
export function fileSelection(repo: { owner: string; repo: string }, branch: string) {
  const key = "ghft:selection:" + JSON.stringify([repo.owner, repo.repo, branch]);
  let store = selectionStores.get(key);
  if (!store) {
    let paths = new Set<string>();
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(key) || "[]");
      if (Array.isArray(saved)) {
        paths = new Set(saved.filter((path): path is string => typeof path === "string"));
      }
    } catch {
      // Selection remains available in memory.
    }
    store = { paths, listeners: new Set() };
    selectionStores.set(key, store);
  }
  const current = store;
  return {
    get: () => (branch ? current.paths : emptySelection),
    subscribe: (notify: () => void) => {
      current.listeners.add(notify);
      return () => {
        current.listeners.delete(notify);
      };
    },
    set: (update: (previous: Set<string>) => Set<string>) => {
      if (!branch) {
        return;
      }
      current.paths = update(current.paths);
      try {
        sessionStorage.setItem(key, JSON.stringify([...current.paths]));
      } catch {
        // Selection remains available in memory.
      }
      current.listeners.forEach((notify) => notify());
    },
  };
}

const treeCache = new Map<string, { expires: number; nodes: Node[] }>();
export function readTreeCache(key: string, now = Date.now()): Node[] | null {
  const entry = treeCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expires <= now) {
    treeCache.delete(key);
    return null;
  }
  treeCache.delete(key);
  treeCache.set(key, entry);
  return entry.nodes;
}
export function writeTreeCache(key: string, nodes: Node[], now = Date.now()) {
  treeCache.delete(key);
  treeCache.set(key, { nodes, expires: now + 300000 });
  while (treeCache.size > 12) {
    const oldest = treeCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    treeCache.delete(oldest);
  }
}

export function restoreGitHubTreeScroll(path = location.pathname): boolean {
  try {
    const key = `ghft:scroll:${path}`;
    const stored = sessionStorage.getItem(key);
    if (stored === null || !Number.isFinite(Number(stored))) {
      return false;
    }
    const top = Number(stored);
    sessionStorage.removeItem(key);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, top)));
    return true;
  } catch {
    // Keep the browser's default restoration when storage is unavailable.
    return false;
  }
}
function CopyFileAction({ node, href, copy }: { node: Node; href: string; copy: CopyActions["appendFile"] }) {
  const [status, setStatus] = useState("");
  if (node.folder) return null;
  return (
    <>
      <button
        type="button"
        className={styles.button}
        aria-label={`Adicionar ${node.name} ao clipboard`}
        onClick={() => {
          setStatus("Copiando…");
          void copy(new URL(href, location.origin).href, node.path).then(
            () => setStatus("Adicionado ao clipboard"),
            (error) => setStatus(String(error)),
          );
        }}
      >
        <CopyPlus size={16} />
      </button>
      {status && (
        <span role="status" className={styles.treeCount}>
          {status}
        </span>
      )}
    </>
  );
}
export function mountDirectoryTree(
  ctx: any,
  container: Element,
  repo: { owner: string; repo: string },
  restoreScroll = false,
  exportFiles: (
    paths: string[],
    branch: string,
    download: boolean,
    progress: (done: number, total: number) => void,
  ) => Promise<void>,
  copy: CopyActions,
) {
  type ViewState = {
    state: "loading" | "ready" | "error";
    nodes: Node[];
    message: string;
    query: string;
    resolvedBranch: string;
    current: string;
  };
  let snapshot: ViewState = {
    state: "loading",
    nodes: [],
    message: "",
    query: "",
    resolvedBranch: "",
    current: "",
  };
  const listeners = new Set<() => void>();
  const subscribe = (notify: () => void) => {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  };
  const update = (patch: Partial<ViewState>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((notify) => notify());
  };
  const setState = (state: ViewState["state"]) => update({ state });
  const setNodes = (nodes: Node[]) => update({ nodes });
  const setMessage = (message: string) => update({ message });
  const setQuery = (query: string) => update({ query });
  const setResolvedBranch = (resolvedBranch: string) => update({ resolvedBranch });
  const setCurrent = (current: string) => update({ current });
  const controller = new AbortController();
  const base = "/" + repo.owner + "/" + repo.repo;
  const path = location.pathname;
  const restorePageScroll = () => {
    if (restoreScroll) {
      restoreGitHubTreeScroll(path);
    }
  };
  const isTree = path.startsWith(base + "/tree/");
  const encoded = isTree
    ? path
        .slice((base + "/tree/").length)
        .split("/")
        .map(decodeURIComponent)
    : [];
  let headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const loadFolder = async (node: Node): Promise<Node[]> => {
    if (!node.sha) {
      return node.children;
    }
    const response = await fetch(
      "https://api.github.com/repos/" +
        repo.owner +
        "/" +
        repo.repo +
        "/git/trees/" +
        encodeURIComponent(node.sha),
      { headers, signal: controller.signal },
    );
    if (!response.ok) {
      throw Error("HTTP " + response.status);
    }
    const data = await response.json();
    return buildTree((data.tree || []).map((entry: Entry) => ({ ...entry, path: entry.path }))).map(
      function prefix(child: Node): Node {
        return { ...child, path: node.path + "/" + child.path, children: child.children.map(prefix) };
      },
    );
  };
  function DirectoryTreeView() {
    const { state, nodes, message, query, resolvedBranch, current } = useSyncExternalStore(
      subscribe,
      () => snapshot,
    );
    const selection = fileSelection(repo, resolvedBranch);
    const selected = useSyncExternalStore(selection.subscribe, selection.get);
    const setSelected = selection.set;
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const select = (path: string) =>
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });

    return (
      <section className={styles.directoryTree} aria-label="Árvore de arquivos" data-ghft-tree="">
        <div className={styles.treeHeader}>
          <span>Arquivos</span>
          <span className={styles.treeCount}>
            {state === "loading" ? "Carregando…" : nodes.length + " itens na raiz"}
          </span>
          <button type="button" className={styles.button} onClick={copy.reset}>
            Nova seleção de cópia
          </button>
        </div>
        {state === "ready" && (
          <label className={styles.treeSearch}>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="Filtrar arquivos e pastas"
              placeholder="Filtrar árvore…"
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
        )}
        {state === "loading" && (
          <div role="status" aria-label="Carregando árvore de arquivos">
            {Array.from({ length: 9 }, (_, i) => i).map((i) => (
              <div key={i} className={styles.treeSkeleton} style={{ width: 45 + ((i * 17) % 48) + "%" }} />
            ))}
          </div>
        )}
        {state === "error" && (
          <div className={styles.treeError}>
            {message} <button onClick={() => location.reload()}>Tentar novamente</button>
          </div>
        )}
        {state === "ready" && exportFiles && (
          <div className={styles.toolbar}>
            <span>{selected.size} selecionados</span>
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => {
                const paths: string[] = [];
                const visit = (entries: Node[]) =>
                  entries.forEach((node) => {
                    if (node.folder) {
                      visit(node.children);
                    } else {
                      paths.push(node.path);
                    }
                  });
                visit(filterTree(nodes, query));
                setSelected((previous) => new Set([...previous, ...paths]));
              }}
            >
              Selecionar carregados
            </button>
            <button
              className={styles.button}
              disabled={busy || !selected.size}
              onClick={() => setSelected(() => new Set())}
            >
              Limpar
            </button>
            {[false, true].map((download) => (
              <button
                key={String(download)}
                className={styles.button}
                disabled={busy || !selected.size}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await exportFiles([...selected], resolvedBranch, download, (done, total) =>
                      setStatus(`Lendo ${done}/${total}…`),
                    );
                    setStatus(download ? "Download solicitado" : "Copiado");
                  } catch (error) {
                    setStatus(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {download ? "Baixar TXT" : "Copiar"}
              </button>
            ))}
            <span role="status">{status}</span>
          </div>
        )}
        {state === "ready" && (
          <FileTree
            key={resolvedBranch}
            nodes={nodes}
            query={query}
            current={current}
            selected={selected}
            onSelect={select}
            loadFolder={loadFolder}
            href={(node) =>
              base +
              "/" +
              (node.folder ? "tree" : "blob") +
              "/" +
              resolvedBranch.split("/").map(encodeURIComponent).join("/") +
              "/" +
              node.path.split("/").map(encodeURIComponent).join("/")
            }
            renderActions={(node) => (
              <CopyFileAction
                node={node}
                href={
                  base +
                  "/blob/" +
                  resolvedBranch.split("/").map(encodeURIComponent).join("/") +
                  "/" +
                  node.path.split("/").map(encodeURIComponent).join("/")
                }
                copy={copy.appendFile}
              />
            )}
          />
        )}
      </section>
    );
  }
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = themeCss + "\n" + css;
  host.classList.add("rod-theme", "dark");
  shadow.append(style);
  container.parentNode!.insertBefore(host, container);
  const disposePortal = ctx.ui.mountReact(<DirectoryTreeView />, shadow);
  host.dataset.ghftTreeHost = "";
  const nativeList = container as HTMLElement;
  const originalDisplay = nativeList.style.display;
  nativeList.style.display = "none";
  const load = async () => {
    try {
      const token = await ctx.storage.get("actionsToken", "");
      headers = {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      };
      const info = await fetch("https://api.github.com/repos/" + repo.owner + "/" + repo.repo, {
        headers,
        signal: controller.signal,
      });
      if (!info.ok) {
        throw Error("GitHub API: " + info.status);
      }
      const details = await info.json();
      const apiBase = "https://api.github.com/repos/" + repo.owner + "/" + repo.repo + "/git/trees/";
      const candidates = isTree
        ? [
            ...[selectedGitHubRef(), details.default_branch]
              .map((ref) => splitTreeLocation(encoded, ref))
              .filter((value): value is { branch: string; current: string } => !!value),
            ...Array.from({ length: encoded.length }, (_, i) => ({
              branch: encoded.slice(0, encoded.length - i).join("/"),
              current: encoded.slice(encoded.length - i).join("/"),
            })),
          ]
        : [{ branch: details.default_branch as string, current: "" }];
      const cached = candidates.find(
        (candidate) => candidate.branch && readTreeCache(base + ":" + candidate.branch),
      );
      if (cached) {
        const nodes = readTreeCache(base + ":" + cached.branch);
        if (nodes && !controller.signal.aborted) {
          setResolvedBranch(cached.branch);
          setCurrent(cached.current);
          setNodes(nodes);
          setState("ready");
          restorePageScroll();
          return;
        }
      }
      const visited = new Set<string>();
      let response: Response | undefined;
      let match: { branch: string; current: string } | undefined;
      for (const candidate of candidates) {
        if (!candidate.branch || visited.has(candidate.branch)) {
          continue;
        }
        visited.add(candidate.branch);
        const attempt = await fetch(apiBase + encodeURIComponent(candidate.branch) + "?recursive=1", {
          headers,
          signal: controller.signal,
        });
        if (attempt.ok) {
          response = attempt;
          match = candidate;
          break;
        }
        if (attempt.status !== 404 && attempt.status !== 422) {
          throw Error("Árvore indisponível: HTTP " + attempt.status);
        }
      }
      if (!response || !match) {
        throw Error("Não foi possível resolver a branch da URL");
      }
      setResolvedBranch(match.branch);
      setCurrent(match.current);
      const data = await response.json();
      let entries: Entry[] = data.tree || [];
      if (data.truncated) {
        const root = await fetch(apiBase + encodeURIComponent(match.branch), {
          headers,
          signal: controller.signal,
        });
        if (!root.ok) {
          throw Error("Não foi possível carregar a raiz: HTTP " + root.status);
        }
        const rootData = await root.json();
        entries = rootData.tree || [];
      }
      const tree = buildTree(entries);
      writeTreeCache(base + ":" + match.branch, tree);
      if (controller.signal.aborted) {
        return;
      }
      setNodes(tree);
      setState("ready");
      restorePageScroll();
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setMessage(error instanceof Error ? error.message : String(error));
      setState("error");
      nativeList.style.display = originalDisplay;
    }
  };
  void load();
  return () => {
    controller.abort();
    nativeList.style.display = originalDisplay;
    disposePortal();
    host.remove();
  };
}
