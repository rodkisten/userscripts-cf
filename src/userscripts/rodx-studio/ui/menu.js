export function createStudioMenus(Studio) {
  let api;
  const panels = new Map();
  function library() {
    if (api) return api;
    const external = typeof RodMenu !== "undefined" ? RodMenu : globalThis.RodMenu;
    if (!external || typeof external.open !== "function" || typeof external.configure !== "function") {
      throw new Error(
        "RodMenu indisponível. Verifique o carregamento do @require no gerenciador de userscripts.",
      );
    }
    api = external;
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
    if (handle) {
      panels.delete(id);
      handle.close();
    }
  }
  function panel(id, title, node, onClose) {
    if (panels.has(id)) return panels.get(id);
    const handle = library().open({
      id: "rodx-" + id,
      title,
      presentation: "bottom-sheet",
      size: "lg",
      store: {
        persist: false,
      },
      fields: [
        {
          type: "custom",
          name: "workspace",
          chrome: "bare",
          render() {
            return node;
          },
        },
      ],
      actions: [
        {
          id: "close",
          label: "Fechar",
          role: "cancel",
        },
      ],
    });
    panels.set(id, handle);
    handle.result.finally(() => {
      if (panels.get(id) === handle) panels.delete(id);
      document.body.append(node);
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
