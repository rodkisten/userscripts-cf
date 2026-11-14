import { createSignal, For, Show, createEffect } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import { materialIcon } from "./material-icons.ts";
import styles from "./GitHub.module.css";

type Entry = { path: string; type: "blob" | "tree"; sha?: string };
type Node = { name: string; path: string; folder: boolean; children: Node[]; sha?: string };
const compare = (a: Node, b: Node) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true });
export function buildTree(entries: Entry[]): Node[] {
  const root: Node = { name: "", path: "", folder: true, children: [] };
  const known = new Map<string, Node>([["", root]]);
  for (const entry of entries) {
    if (!["blob", "tree"].includes(entry.type) || !entry.path || entry.path.startsWith("/")) continue;
    const parts = entry.path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      if (known.has(path)) continue;
      const parent = known.get(parts.slice(0, i - 1).join("/"));
      if (!parent) break;
      const node: Node = { name: parts[i - 1], path, folder: i < parts.length || entry.type === "tree", children: [], sha: i === parts.length ? entry.sha : undefined };
      parent.children.push(node);
      known.set(path, node);
    }
  }
  const sort = (nodes: Node[]) => { nodes.sort(compare); nodes.forEach(node => sort(node.children)); };
  sort(root.children);
  return root.children;
}
export function filterTree(nodes: Node[], term: string): Node[] {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) return nodes;
  const visit = (node: Node): Node | null => {
    if (node.name.toLocaleLowerCase().includes(needle)) return node;
    const children = node.children.map(visit).filter((value): value is Node => value !== null);
    return children.length ? { ...node, children } : null;
  };
  return nodes.map(visit).filter((value): value is Node => value !== null);
}
export function splitTreeLocation(segments: string[], ref: string): { branch: string; current: string } | null {
  const refParts = ref.split("/");
  if (!ref || refParts.some((part, i) => segments[i] !== part)) return null;
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
    if (label) return label.replace(/^Branch:\s*/i, "").trim();
  }
  return "";
}
const treeCache = new Map<string, { expires: number; nodes: Node[] }>();
export function readTreeCache(key: string, now = Date.now()): Node[] | null {
  const entry = treeCache.get(key);
  if (!entry) return null;
  if (entry.expires <= now) { treeCache.delete(key); return null; }
  treeCache.delete(key);
  treeCache.set(key, entry);
  return entry.nodes;
}
export function writeTreeCache(key: string, nodes: Node[], now = Date.now()) {
  treeCache.delete(key);
  treeCache.set(key, { nodes, expires: now + 300000 });
  while (treeCache.size > 12) {
    const oldest = treeCache.keys().next().value;
    if (oldest === undefined) break;
    treeCache.delete(oldest);
  }
}
function TreeRow(props: { node: Node; depth: number; base: string; branch: string; current: string; loadFolder: (node: Node) => Promise<Node[]> }) {
  const [children, setChildren] = createSignal(props.node.children);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const toggle = async () => {
    if (expanded()) { setExpanded(false); return; }
    setExpanded(true);
    if (!props.node.sha || children().length) return;
    setLoading(true);
    setError("");
    try { setChildren(await props.loadFolder(props.node)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };
  const [expanded, setExpanded] = createSignal(props.current === props.node.path || props.current.startsWith(props.node.path + "/"));
  createEffect(() => {
    if (props.current === props.node.path || props.current.startsWith(props.node.path + "/")) setExpanded(true);
  }, undefined);
  const url = () => props.base + "/" + (props.node.folder ? "tree" : "blob") + "/" + props.branch.split("/").map(encodeURIComponent).join("/") + "/" + props.node.path.split("/").map(encodeURIComponent).join("/");
  return <>
    <div class={styles.treeRow} role="treeitem" aria-level={props.depth + 1} aria-expanded={props.node.folder ? (expanded() ? "true" : "false") : undefined} style={{ "padding-left": 10 + props.depth * 17 + "px" }}>
      <Show when={props.node.folder} fallback={<span class={styles.treeSpacer}/>}>
        <button class={styles.treeChevron} aria-label={(expanded() ? "Recolher " : "Expandir ") + props.node.name} onClick={() => void toggle()}>{expanded() ? "⌄" : "›"}</button>
      </Show>
      <img src={materialIcon(props.node.name, props.node.folder)} width="16" height="16" alt="" />
      <a href={url()} title={props.node.path}>{props.node.name}</a>
    </div>
    <Show when={props.node.folder && expanded()}>
      <div role="group"><Show when={loading()}><div class={styles.treeSkeleton} role="status" aria-label="Carregando pasta" style={{ width: "55%" }}/><div class={styles.treeSkeleton} style={{ width: "35%" }}/></Show>
      <Show when={error()}><div class={styles.treeError}>{error()} <button onClick={() => { setExpanded(false); void toggle(); }}>Tentar novamente</button></div></Show>
      <For each={children()}>{node => <TreeRow node={node} depth={props.depth + 1} base={props.base} branch={props.branch} current={props.current} loadFolder={props.loadFolder}/>}</For></div>
    </Show>
  </>;
}
export function mountDirectoryTree(ctx: any, container: Element, repo: { owner: string; repo: string }) {
  const [state, setState] = createSignal<"loading" | "ready" | "error">("loading");
  const [nodes, setNodes] = createSignal<Node[]>([]);

  const [message, setMessage] = createSignal("");
  const [query, setQuery] = createSignal("");
  const controller = new AbortController();
  const base = "/" + repo.owner + "/" + repo.repo;
  const path = location.pathname;
  const isTree = path.startsWith(base + "/tree/");
  const encoded = isTree ? path.slice((base + "/tree/").length).split("/").map(decodeURIComponent) : [];
  const [resolvedBranch, setResolvedBranch] = createSignal("");
  const [current, setCurrent] = createSignal("");
  let headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const loadFolder = async (node: Node): Promise<Node[]> => {
    if (!node.sha) return node.children;
    const response = await fetch("https://api.github.com/repos/" + repo.owner + "/" + repo.repo + "/git/trees/" + encodeURIComponent(node.sha), { headers, signal: controller.signal });
    if (!response.ok) throw Error("HTTP " + response.status);
    const data = await response.json();
    return buildTree((data.tree || []).map((entry: Entry) => ({ ...entry, path: entry.path })));
  };
  const mount = mountPoint(container.parentNode!, () => (
    <section class={styles.directoryTree} aria-label="Árvore de arquivos" data-ghft-tree="">
      <div class={styles.treeHeader}><span>Arquivos</span><span class={styles.treeCount}>{state() === "loading" ? "Carregando…" : nodes().length + " itens na raiz"}</span></div>
      <Show when={state() === "ready"}><label class={styles.treeSearch}><span aria-hidden="true">⌕</span><input type="search" aria-label="Filtrar arquivos e pastas" placeholder="Filtrar árvore…" value={query()} onInput={event => setQuery(event.currentTarget.value)} /></label></Show>
      <Show when={state() === "loading"}>
        <div role="status" aria-label="Carregando árvore de arquivos">
          <For each={Array.from({ length: 9 }, (_, i) => i)}>{i => <div class={styles.treeSkeleton} style={{ width: 45 + (i * 17) % 48 + "%" }}/>}</For>
        </div>
      </Show>
      <Show when={state() === "error"}><div class={styles.treeError}>{message()} <button onClick={() => location.reload()}>Tentar novamente</button></div></Show>
      <Show when={state() === "ready"}><div role="tree"><For each={filterTree(nodes(), query())}>{node => <TreeRow node={node} depth={0} base={base} branch={resolvedBranch()} current={current()} loadFolder={loadFolder}/>}</For></div></Show>
    </section>
  ), { before: container });
  mount.host.dataset.ghftTreeHost = "";
  let originalDisplay = (container as HTMLElement).style.display;
  const load = async () => {
    try {
      const token = await ctx.storage.get("actionsToken", "");
      headers = { Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}) };
      const info = await fetch("https://api.github.com/repos/" + repo.owner + "/" + repo.repo, { headers, signal: controller.signal });
      if (!info.ok) throw Error("GitHub API: " + info.status);
      const details = await info.json();
      const apiBase = "https://api.github.com/repos/" + repo.owner + "/" + repo.repo + "/git/trees/";
      const candidates = isTree
        ? [
            ...[selectedGitHubRef(), details.default_branch].map(ref => splitTreeLocation(encoded, ref)).filter((value): value is { branch: string; current: string } => !!value),
            ...Array.from({ length: encoded.length }, (_, i) => ({
              branch: encoded.slice(0, encoded.length - i).join("/"),
              current: encoded.slice(encoded.length - i).join("/"),
            })),
          ]
        : [{ branch: details.default_branch as string, current: "" }];
      const cached = candidates.find(candidate => candidate.branch && readTreeCache(base + ":" + candidate.branch));
      if (cached) {
        const nodes = readTreeCache(base + ":" + cached.branch);
        if (nodes && !controller.signal.aborted) {
          setResolvedBranch(cached.branch);
          setCurrent(cached.current);
          setNodes(nodes);
          setState("ready");
          (container as HTMLElement).style.display = "none";
          return;
        }
      }
      const visited = new Set<string>();
      let response: Response | undefined;
      let match: { branch: string; current: string } | undefined;
      for (const candidate of candidates) {
        if (!candidate.branch || visited.has(candidate.branch)) continue;
        visited.add(candidate.branch);
        const attempt = await fetch(apiBase + encodeURIComponent(candidate.branch) + "?recursive=1", { headers, signal: controller.signal });
        if (attempt.ok) { response = attempt; match = candidate; break; }
        if (attempt.status !== 404 && attempt.status !== 422) throw Error("Árvore indisponível: HTTP " + attempt.status);
      }
      if (!response || !match) throw Error("Não foi possível resolver a branch da URL");
      setResolvedBranch(match.branch);
      setCurrent(match.current);
      const data = await response.json();
      let entries: Entry[] = data.tree || [];
      if (data.truncated) {
        const root = await fetch(apiBase + encodeURIComponent(match.branch), { headers, signal: controller.signal });
        if (!root.ok) throw Error("Não foi possível carregar a raiz: HTTP " + root.status);
        const rootData = await root.json();
        entries = rootData.tree || [];
      }
      const tree = buildTree(entries);
      writeTreeCache(base + ':' + match.branch, tree);
      if (controller.signal.aborted) return;
      setNodes(tree); setState("ready");
      (container as HTMLElement).style.display = "none";
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : String(error)); setState("error");
    }
  };
  void load();
  return () => { controller.abort(); (container as HTMLElement).style.display = originalDisplay; mount.dispose(); };
}
