import { render } from "@solidjs/web";
import { flush, type Element } from "solid-js";
import { registerShadowStyles } from "./shadow-mount.tsx";

/** The single imperative boundary between a third-party document and Solid.
 * Components own everything inside this host; adapters only choose its location.
 */
export function mountPoint(
  target: Node,
  component: () => Element,
  options: { before?: Node | null; id?: string; tag?: string; shadow?: boolean; styles?: readonly string[] } = {},
) {
  const host = document.createElement(options.tag || "div");
  host.dataset.solidMount = "";
  if (options.id) host.id = options.id;
  target.insertBefore(host, options.before || null);
  const root = options.shadow ? host.attachShadow({ mode: "open" }) : null;
  const releaseStyles = root ? registerShadowStyles(root, options.styles ?? []) : () => {};
  let dispose: () => void;
  try {
    dispose = render(component, root ?? host);
    flush();
  } catch (error) {
    releaseStyles();
    host.remove();
    throw error;
  }
  let closed = false;
  return {
    host,
    dispose() {
      if (closed) return;
      closed = true;
      dispose();
      releaseStyles();
      host.remove();
    },
  };
}
