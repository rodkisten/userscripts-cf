import postcss from "postcss";

/**
 * Merge only adjacent rules with identical declaration bodies and the same
 * at-rule ancestry. Selector identities remain intact: JS event handlers,
 * classList checks, delegated events and external integrations stay valid.
 *
 * Never merge across an intervening rule: the CSS cascade can depend on order.
 */
export function deduplicateCSS(css) {
  const root = postcss.parse(css);
  let merged = 0;
  function visit(container) {
    for (const node of [...container.nodes]) {
      if (node.parent !== container) continue;
      if (node.type === "atrule" && node.nodes && !/keyframes$/i.test(node.name)) {
        visit(node);
        continue;
      }
      if (node.type !== "rule" || !node.parent) continue;
      const previous = node.prev();
      if (!previous || previous.type !== "rule") continue;
      if (previous.nodes.length !== node.nodes.length) continue;
      if (node.nodes.some((child) => child.type !== "decl")) continue;
      const signature = (rule) =>
        rule.nodes.map((decl) => [decl.prop, decl.value, decl.important]).map(JSON.stringify).join(";");
      if (signature(previous) !== signature(node)) continue;
      // Keep both selectors: they can carry independent JS behavior.
      previous.selector += "," + node.selector;
      node.remove();
      merged++;
    }
  }
  visit(root);
  return { css: root.toString(), merged };
}
