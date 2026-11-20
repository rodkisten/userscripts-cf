import { analyzeImportGraph } from "./css-import-graph.mjs";

/**
 * Require every statically detected consumer to reach the host token stylesheet.
 * This is a conservative static check, not runtime proof of registration.
 */
export function validateTokenReachability(sources, group, ownership) {
  const graph = analyzeImportGraph(sources);
  const tokenOwners = group.filter((name) => {
    const css = sources[name] || "";
    return /(^|[,\s]):host\s*\{/m.test(css);
  });
  const diagnostics = [...graph.diagnostics.filter((item) => group.includes(item.file))];
  if (tokenOwners.length !== 1) {
    diagnostics.push({ code: "token-owner-count", expected: 1, actual: tokenOwners.length });
    return { safe: false, diagnostics };
  }
  const host = tokenOwners[0];
  const edges = graph.edges;
  const reachable = (start, target) => {
    const visited = new Set();
    const queue = [start];
    while (queue.length) {
      const file = queue.shift();
      if (file === target) return true;
      if (visited.has(file)) continue;
      visited.add(file);
      for (const edge of edges[file] || []) queue.push(edge.target);
    }
    return false;
  };
  const owners = new Set(group.flatMap((file) => ownership[file]?.owners || []));
  if (!owners.size) diagnostics.push({ code: "no-static-consumers" });
  for (const owner of owners) {
    if (!reachable(owner, host)) diagnostics.push({ code: "host-not-reachable", owner, host });
    for (const file of group) {
      if (!reachable(owner, file)) diagnostics.push({ code: "group-file-not-reachable", owner, file });
    }
  }
  return { safe: diagnostics.length === 0, diagnostics, host, owners: [...owners].sort() };
}
