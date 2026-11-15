import { createEffect, onCleanup } from "solid-js";
import "./rod-object-inspector";

interface InspectorRuntime {
  render(value: unknown, documentRef?: Document): Node;
  ensureStyle(target: ShadowRoot | Document): unknown;
  destroy(): void;
}
interface InspectorApi {
  create(options?: Record<string, unknown>): InspectorRuntime;
}
export function ObjectInspector(props: { value: unknown }) {
  let host!: HTMLDivElement;
  let runtime: InspectorRuntime | undefined;
  createEffect(() => {
    const value = props.value;
    if (!host) return;
    const api = (window as Window & { RodObjectInspector?: InspectorApi }).RodObjectInspector;
    if (!api) {
      host.textContent = "RodObjectInspector indisponível";
      return;
    }
    runtime?.destroy();
    runtime = api.create({ options: { theme: "dark", expandDepth: 1, virtualize: true } });
    const root = host.getRootNode();
    if (root instanceof ShadowRoot) runtime.ensureStyle(root);
    host.replaceChildren(runtime.render(value, host.ownerDocument));
  });
  onCleanup(() => {
    runtime?.destroy();
    host?.replaceChildren();
  });
  return <div ref={host} class="rodx-object-inspector" />;
}
