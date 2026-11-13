import { createSignal, For, Show } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import { materialIcon } from "./material-icons.ts";
import styles from "./GitHub.module.css";

type Entry = { path: string; type: "blob" | "tree" };
type Node = { name: string; path: string; folder: boolean; children: Node[] };
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
      const node: Node = { name: parts[i - 1], path, folder: i < parts.length || entry.type === "tree", children: [] };
      parent.children.push(node);
      known.set(path, node);
    }
  }
  const sort = (nodes: Node[]) => { nodes.sort(compare); nodes.forEach(node => sort(node.children)); };
  sort(root.children);
  return root.children;
}
function TreeRow(props: { node: Node; depth: number; base: string; branch: string; current: string }) {
  const [expanded, setExpanded] = createSignal(props.current === props.node.path || props.current.startsWith(props.node.path + "/"));
  const url = () => props.base + "/" + (props.node.folder ? "tree" : "blob") + "/" + props.branch.split("/").map(encodeURIComponent).join("/") + "/" + props.node.path.split("/").map(encodeURIComponent).join("/");
  return <>
    <div class={styles.treeRow} role="treeitem" aria-level={props.depth + 1} aria-expanded={props.node.folder ? (expanded() ? "true" : "false") : undefined} style={{ "padding-left": 10 + props.depth * 17 + "px" }}>
      <Show when={props.node.folder} fallback={<span class={styles.treeSpacer}/>}>
        <button class={styles.treeChevron} aria-label={(expanded() ? "Recolher " : "Expandir ") + props.node.name} onClick={() => setExpanded(!expanded())}>{expanded() ? "⌄" : "›"}</button>
      </Show>
      <img src={materialIcon(props.node.name, props.node.folder)} width="16" height="16" alt="" />
      <a href={url()} title={props.node.path}>{props.node.name}</a>
    </div>
    <Show when={props.node.folder && expanded()}>
      <div role="group"><For each={props.node.children}>{node => <TreeRow node={node} depth={props.depth + 1} base={props.base} branch={props.branch} current={props.current}/>}</For></div>
    </Show>
  </>;
}
export function mountDirectoryTree(ctx: any, container: Element, repo: { owner: string; repo: string }) {
  const [state, setState] = createSignal<"loading" | "ready" | "error">("loading");
  const [nodes, setNodes] = createSignal<Node[]>([]);

  const [message, setMessage] = createSignal("");
  const controller = new AbortController();
  const base = "/" + repo.owner + "/" + repo.repo;
  const path = location.pathname;
  const isTree = path.startsWith(base + "/tree/");
  const encoded = isTree ? path.slice((base + "/tree/").length).split("/").map(decodeURIComponent) : [];
  const branch = isTree ? encoded[0] : "";
  const [resolvedBranch, setResolvedBranch] = createSignal(branch || "main");
  const current = isTree ? encoded.slice(1).join("/") : "";
  const mount = mountPoint(container.parentNode!, () => (
    <section class={styles.directoryTree} aria-label="Árvore de arquivos" data-ghft-tree="">
      <div class={styles.treeHeader}><span>Arquivos</span><span class={styles.treeCount}>{state() === "loading" ? "Carregando…" : nodes().length + " itens na raiz"}</span></div>
      <Show when={state() === "loading"}>
        <div role="status" aria-label="Carregando árvore de arquivos">
          <For each={Array.from({ length: 9 }, (_, i) => i)}>{i => <div class={styles.treeSkeleton} style={{ width: 45 + (i * 17) % 48 + "%" }}/>}</For>
        </div>
      </Show>
      <Show when={state() === "error"}><div class={styles.treeError}>{message()} <button onClick={() => location.reload()}>Tentar novamente</button></div></Show>
      <Show when={state() === "ready"}><div role="tree"><For each={nodes()}>{node => <TreeRow node={node} depth={0} base={base} branch={resolvedBranch()} current={current}/>}</For></div></Show>
    </section>
  ), { before: container });
  mount.host.dataset.ghftTreeHost = "";
  let originalDisplay = (container as HTMLElement).style.display;
  const load = async () => {
    try {
      const token = await ctx.storage.get("actionsToken", "");
      const headers = { Accept: "application/vnd.github+json", ...(token ? { Authorization: "Bearer " + token } : {}) };
      const info = await fetch("https://api.github.com/repos/" + repo.owner + "/" + repo.repo, { headers, signal: controller.signal });
      if (!info.ok) throw Error("GitHub API: " + info.status);
      const details = await info.json();
      const ref = branch || details.default_branch;
      setResolvedBranch(ref);
      const response = await fetch("https://api.github.com/repos/" + repo.owner + "/" + repo.repo + "/git/trees/" + encodeURIComponent(ref) + "?recursive=1", { headers, signal: controller.signal });
      if (!response.ok) throw Error("Árvore indisponível: HTTP " + response.status);
      const data = await response.json();
      if (data.truncated) throw Error("Repositório muito grande para carregar a árvore completa");
      const tree = buildTree(data.tree || []);
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
