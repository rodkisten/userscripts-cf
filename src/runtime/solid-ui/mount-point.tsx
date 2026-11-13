import { render } from "@solidjs/web";
import { flush, type Element } from "solid-js";

/** The single imperative boundary between a third-party document and Solid.
 * Components own everything inside this host; adapters only choose its location.
 */
export function mountPoint(
  target: Node,
  component: () => Element,
  options: { before?: Node | null; id?: string; tag?: string; shadow?: boolean } = {},
) {
  const host = document.createElement(options.tag || "div");
  host.dataset.solidMount = "";
  if (options.id) host.id = options.id;
  target.insertBefore(host, options.before || null);
  let dispose: () => void;
  try {
    dispose = render(component, options.shadow ? host.attachShadow({ mode: "open" }) : host);
    flush();
  } catch (error) {
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
      host.remove();
    },
  };
}
