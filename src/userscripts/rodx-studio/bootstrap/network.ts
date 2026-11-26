import { initializeOuterStudio, Studio } from "../core/studio-runtime.js";
import { connectStudioNetwork } from "../network/page-bridge.js";
import { createNetworkInspector } from "../network/inspector.tsx";

export function createStudioMenus(Studio) {
  let api;
  const panels = new Map();
  function library() {
    if (api) {
      return api;
    }
    const runtimeMenu = Studio.ctx?.menu;
    if (!runtimeMenu?.open) {
      throw new Error("ctx.menu indisponível: inicialize o RodX pelo runtime.");
    }
    api = runtimeMenu;
    api.configure({
      autoLoadDependencies: false,
      toasterErrors: false,
      defaultPresentation: "bottom-sheet",
      zIndex: 2147483500,
    });
    return api;
  }
  function close(id) {
    const handle = panels.get(id);
    handle?.close();
  }

  // Use the shared Radix dialog instead of the legacy hand-built overlay.
  // The workspace keeps its existing ShadowRoot and event handlers.
  function panel(id, title, node, onClose) {
    const existing = panels.get(id);
    if (existing) {
      return existing;
    }
    const previousParent = node.parentNode;
    const nextSibling = node.nextSibling;
    const previousStyle = node.getAttribute("style");
    const restore = () => {
      if (previousStyle === null) {
        node.removeAttribute("style");
      } else {
        node.setAttribute("style", previousStyle);
      }
      if (previousParent?.isConnected) {
        if (nextSibling?.parentNode === previousParent) {
          previousParent.insertBefore(node, nextSibling);
        } else {
          previousParent.appendChild(node);
        }
      }
    };
    let closed = false;
    const dialog = library().open({
      id: "rodx-" + id,
      title,
      presentation: "dialog",
      size: "xl",
      fields: [
        {
          name: "workspace",
          type: "custom",
          render: () => {
            node.style.setProperty("width", "100%", "important");
            node.style.setProperty("height", "min(80dvh, 900px)", "important");
            node.style.setProperty("position", "relative", "important");
            node.style.setProperty("inset", "auto", "important");
            return node;
          },
        },
      ],
      actions: [{ id: "close", label: "Fechar", role: "cancel" }],
    });
    const handle = {
      result: dialog.result,
      close: () => dialog.close(),
    };
    panels.set(id, handle);
    void dialog.result.finally(() => {
      if (closed) {
        return;
      }
      closed = true;
      panels.delete(id);
      restore();
      onClose?.();
    });
    return handle;
  }
  return {
    library,
    panel,
    close,
    mounted: (id) => panels.has(id),
    open(schema) {
      return library().open(schema);
    },
  };
}

export function initializeNetwork() {
    initializeOuterStudio();
  Studio.menu = createStudioMenus(Studio);

  try {
    sessionStorage.removeItem("rodx:feed:routes");
  } catch {}

  connectStudioNetwork(Studio);
  createNetworkInspector(Studio);
}
