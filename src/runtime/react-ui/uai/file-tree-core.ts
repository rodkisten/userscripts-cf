export type FileTreeEntry = { path: string; type: "blob" | "tree"; sha?: string; size?: number };
export type FileTreeNode = {
  name: string;
  path: string;
  folder: boolean;
  children: FileTreeNode[];
  sha?: string;
  size?: number;
};
const compare = (a: FileTreeNode, b: FileTreeNode) =>
  Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true });
export function buildTree(entries: FileTreeEntry[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", folder: true, children: [] };
  const known = new Map<string, FileTreeNode>([["", root]]);
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
      const node: FileTreeNode = {
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
  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort(compare);
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}
export function filterTree(nodes: FileTreeNode[], term: string): FileTreeNode[] {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) {
    return nodes;
  }
  const visit = (node: FileTreeNode): FileTreeNode | null => {
    if (node.name.toLocaleLowerCase().includes(needle)) {
      return node;
    }
    const children = node.children.map(visit).filter((value): value is FileTreeNode => value !== null);
    return children.length ? { ...node, children } : null;
  };
  return nodes.map(visit).filter((value): value is FileTreeNode => value !== null);
}
