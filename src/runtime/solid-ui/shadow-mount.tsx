import { render } from "@solidjs/web";
import type { JSX } from "@solidjs/web";

export type ShadowStyle = string | { css: string };
export interface ShadowMountOptions {
  target?: HTMLElement | ShadowRoot;
  styles?: readonly ShadowStyle[];
  id?: string;
  onError?: (error: unknown) => void;
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
  const host = options.target ? undefined : document.createElement("div");
  if (host) {
    host.dataset.userscriptsCfShadow = options.id ?? "";
    // A fixed host must participate in the top-level stacking context. Styles
    // inside its ShadowRoot cannot reliably raise the host above page overlays.
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("inset", "0", "important");
    host.style.setProperty("width", "0", "important");
    host.style.setProperty("height", "0", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("pointer-events", "none", "important");
    host.style.setProperty("visibility", "visible", "important");
    document.body.append(host);
  }
  const target = options.target ?? host!;
  const owner =
    typeof ShadowRoot !== "undefined" && target instanceof ShadowRoot
      ? target
      : target instanceof HTMLElement
        ? (target.shadowRoot ?? target.attachShadow({ mode: "open" }))
        : null;
  if (!owner) throw new Error("A ShadowRoot is required to mount Solid UI");
  const releaseStyles = registerShadowStyles(owner, options.styles ?? []);
  const container = owner.ownerDocument.createElement("div");
  if (options.id) container.dataset.solidUi = options.id;
  owner.append(container);
  let dispose: (() => void) | undefined;
  try {
    dispose = render(
      () => component(),
      container,
      options.onError
        ? {
            // Solid 2 reports errors from reactive descendants, including async
            // reads handled by a boundary. A render-time try/catch cannot do this.
            onError: (error: unknown) => options.onError?.(error),
          }
        : undefined,
    );
  } catch (error) {
    container.remove();
    releaseStyles();
    host?.remove();
    throw error;
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    dispose?.();
    container.remove();
    releaseStyles();
    host?.remove();
  };
}
