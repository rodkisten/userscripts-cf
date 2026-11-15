export function createStudioMenus(Studio) {
  let api;
  const panels = new Map();
  function library() {
    if (api) return api;
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

  // The RodX workspace owns its ShadowRoot, delegated event handlers and CSS.
  // Never transplant it into the runtime menu's second ShadowRoot.
  function panel(id, title, node, onClose) {
    const existing = panels.get(id);
    if (existing) return existing;
    const backdrop = document.createElement("div");
    backdrop.setAttribute("data-rodx-panel-backdrop", id);
    Object.assign(backdrop.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483498",
      background: "rgba(0, 0, 0, .58)",
    });
    const previousStyle = node.getAttribute("style");
    const previousParent = node.parentNode;
    const nextSibling = node.nextSibling;
    node.style.setProperty("position", "fixed", "important");
    node.style.setProperty("inset", "auto 0 0", "important");
    node.style.setProperty("width", "100%", "important");
    node.style.setProperty("max-width", "100vw", "important");
    node.style.setProperty("max-height", "calc(100dvh - env(safe-area-inset-top, 0px))", "important");
    node.style.setProperty("overflow", "hidden", "important");
    node.style.setProperty("z-index", "2147483499", "important");
    document.body.append(backdrop, node);
    let resolve;
    const result = new Promise((done) => { resolve = done; });
    const handle = {
      result,
      close() {
        if (panels.get(id) !== handle) return;
        panels.delete(id);
        backdrop.remove();
        if (previousStyle === null) node.removeAttribute("style");
        else node.setAttribute("style", previousStyle);
        if (previousParent?.isConnected) {
          if (nextSibling?.parentNode === previousParent) previousParent.insertBefore(node, nextSibling);
          else previousParent.appendChild(node);
        } else document.body.append(node);
        resolve({ reason: "close" });
        onClose?.();
      },
    };
    panels.set(id, handle);
    backdrop.addEventListener("click", () => handle.close());
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
