/** Framework-neutral stylesheet ownership for isolated userscript ShadowRoots. */
export type ShadowStyle = string | { css: string };
const sheets = new WeakMap<ShadowRoot, Map<string, { node: HTMLStyleElement; refs: number }>>();

export function registerShadowStyles(root: ShadowRoot, styles: readonly ShadowStyle[]) {
  let entries = sheets.get(root);
  if (!entries) {
    entries = new Map();
    sheets.set(root, entries);
  }
  const keys: string[] = [];
  for (const style of styles) {
    const css = typeof style === "string" ? style : style.css;
    if (!css) continue;
    let entry = entries.get(css);
    if (entry && !entry.node.isConnected) {
      // A host may replace its ShadowRoot contents without disposing style owners.
      // Reattach the existing node instead of creating a duplicate registration.
      root.prepend(entry.node);
    }
    if (!entry) {
      const node = root.ownerDocument.createElement("style");
      node.textContent = css;
      root.prepend(node);
      entry = { node, refs: 0 };
      entries.set(css, entry);
    }
    entry.refs++;
    keys.push(css);
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const key of keys) {
      const entry = entries!.get(key);
      if (entry && --entry.refs === 0) {
        entry.node.remove();
        entries!.delete(key);
      }
    }
  };
}
