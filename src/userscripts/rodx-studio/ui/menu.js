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
