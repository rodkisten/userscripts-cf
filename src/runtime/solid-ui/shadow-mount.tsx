import { render } from "solid-js/web";
import type { JSX } from "solid-js";

export type ShadowStyle = string | { css: string };
export interface ShadowMountOptions {
  target?: HTMLElement | ShadowRoot;
  styles?: readonly ShadowStyle[];
  id?: string;
}
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

export function mountSolidShadow(component: () => JSX.Element, options: ShadowMountOptions = {}) {
  const target = options.target ?? document.body;
  const owner = target instanceof ShadowRoot ? target : target.attachShadow
    ? target.shadowRoot ?? target.attachShadow({ mode: "open" }) : null;
  if (!owner) throw new Error("A ShadowRoot is required to mount Solid UI");
  const releaseStyles = registerShadowStyles(owner, options.styles ?? []);
  const container = owner.ownerDocument.createElement("div");
  if (options.id) container.dataset.solidUi = options.id;
  owner.append(container);
  let dispose: (() => void) | undefined;
  try {
    dispose = render(component, container);
  } catch (error) {
    container.remove();
    releaseStyles();
    throw error;
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    dispose?.();
    container.remove();
    releaseStyles();
  };
}
