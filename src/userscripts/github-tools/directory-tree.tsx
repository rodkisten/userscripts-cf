import { useState, useSyncExternalStore } from "react";
import { CopyPlus, File, FileCode, FileJson, Folder, FolderOpen } from "lucide-react";
import styles, { css } from "./GitHub.module.css";

type Entry = { path: string; type: "blob" | "tree"; sha?: string; size?: number };
type Node = { name: string; path: string; folder: boolean; children: Node[]; sha?: string; size?: number };
type CopyActions = { appendFile: (href: string, path: string) => Promise<void>; reset: () => void };
const kilobytes = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const compare = (a: Node, b: Node) =>
  Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true });
export function buildTree(entries: Entry[]): Node[] {
  const root: Node = { name: "", path: "", folder: true, children: [] };
  const known = new Map<string, Node>([["", root]]);
  for (const entry of entries) {
    if (!["blob", "tree"].includes(entry.type) || !entry.path || entry.path.startsWith("/")) {
      continue;
    }
    const parts = entry.path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      if (known.has(path)) {
        continue;
      }
      const parent = known.get(parts.slice(0, i - 1).join("/"));
      if (!parent) {
        break;
      }
      const node: Node = {
        name: parts[i - 1],
        path,
        folder: i < parts.length || entry.type === "tree",
        children: [],
        sha: i === parts.length ? entry.sha : undefined,
        size: i === parts.length ? entry.size : undefined,
      };
      parent.children.push(node);
      known.set(path, node);
    }
  }
  const sort = (nodes: Node[]) => {
    nodes.sort(compare);
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}
export function filterTree(nodes: Node[], term: string): Node[] {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) {
    return nodes;
  }
  const visit = (node: Node): Node | null => {
    if (node.name.toLocaleLowerCase().includes(needle)) {
      return node;
    }
    const children = node.children.map(visit).filter((value): value is Node => value !== null);
    return children.length ? { ...node, children } : null;
  };
  return nodes.map(visit).filter((value): value is Node => value !== null);
}
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
function selectedGitHubRef(): string {
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
function TreeRow(props: {
  node: Node;
  depth: number;
  base: string;
  branch: string;
  current: string;
  loadFolder: (node: Node) => Promise<Node[]>;
  copyFile: CopyActions["appendFile"];
}) {
  const [children, setChildren] = useState(props.node.children);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const toggle = async (retry = false) => {
    if (expanded && !retry) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!props.node.sha || children.length) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      setChildren(await props.loadFolder(props.node));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };
  const [expanded, setExpanded] = useState(
    props.current === props.node.path || props.current.startsWith(props.node.path + "/"),
  );
  const Icon = props.node.folder
    ? expanded
      ? FolderOpen
      : Folder
    : /\.json$/i.test(props.node.name)
      ? FileJson
      : /\.(tsx?|jsx?|css|ya?ml|py|sh|go|rs)$/i.test(props.node.name)
        ? FileCode
        : File;
  const url = () =>
    props.base +
    "/" +
    (props.node.folder ? "tree" : "blob") +
    "/" +
    props.branch.split("/").map(encodeURIComponent).join("/") +
    "/" +
    props.node.path.split("/").map(encodeURIComponent).join("/");
  return (
    <>
      <div
        className={styles.treeRow}
        role="treeitem"
        aria-level={props.depth + 1}
        aria-expanded={props.node.folder ? (expanded ? "true" : "false") : undefined}
        style={{ paddingLeft: 10 + props.depth * 17 }}
      >
        {props.node.folder ? (
          <button
            className={styles.treeChevron}
            aria-label={(expanded ? "Recolher " : "Expandir ") + props.node.name}
            onClick={() => void toggle()}
          >
            {expanded ? "⌄" : "›"}
          </button>
        ) : (
          <span className={styles.treeSpacer} />
        )}
        <Icon size={16} aria-hidden="true" />
        <a href={url()} title={props.node.path}>
          {props.node.name}
        </a>
        <span className={styles.treeCount}>
          {props.node.folder
            ? children.length || !props.node.sha
              ? `${children.filter((child) => !child.folder).length} arquivos`
              : "—"
            : typeof props.node.size === "number" && `${kilobytes.format(props.node.size / 1024)} KB`}
        </span>
        {!props.node.folder && (
          <button
            type="button"
            className={styles.button}
            title="Adicionar conteúdo ao clipboard"
            aria-label={`Adicionar ${props.node.name} ao clipboard`}
            onClick={() => {
              setCopyStatus("Copiando…");
              void props.copyFile(new URL(url(), location.origin).href, props.node.path).then(
                () => setCopyStatus("Adicionado ao clipboard"),
                (error: unknown) => setCopyStatus(String(error)),
              );
            }}
          >
            <CopyPlus size={16} aria-hidden="true" />
          </button>
        )}
        {copyStatus && (
          <span role="status" className={styles.treeCount}>
            {copyStatus}
          </span>
        )}
      </div>
      {props.node.folder && expanded && (
        <div role="group">
          {loading && (
            <>
              <div
                className={styles.treeSkeleton}
                role="status"
                aria-label="Carregando pasta"
                style={{ width: "55%" }}
              />
              <div className={styles.treeSkeleton} style={{ width: "35%" }} />
            </>
          )}
          {error && (
            <div className={styles.treeError}>
              {error}{" "}
              <button
                onClick={() => {
                  void toggle(true);
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {children.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={props.depth + 1}
              base={props.base}
              branch={props.branch}
              current={props.current}
              loadFolder={props.loadFolder}
              copyFile={props.copyFile}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function mountDirectoryTree(
  ctx: any,
  container: Element,
  repo: { owner: string; repo: string },
  restoreScroll: boolean,
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
    return buildTree((data.tree || []).map((entry: Entry) => ({ ...entry, path: entry.path })));
  };
  function DirectoryTreeView() {
    const { state, nodes, message, query, resolvedBranch, current } = useSyncExternalStore(
      subscribe,
      () => snapshot,
    );
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
        {state === "ready" && (
          <div role="tree">
            {filterTree(nodes, query).map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                depth={0}
                base={base}
                branch={resolvedBranch}
                current={current}
                loadFolder={loadFolder}
                copyFile={copy.appendFile}
              />
            ))}
          </div>
        )}
      </section>
    );
  }
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
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
