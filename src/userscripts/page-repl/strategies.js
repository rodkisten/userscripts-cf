import { CSS_SELECTORS } from "../../selectors.js";
export class Unavailable extends Error {
  constructor(message) {
    super(message);
    this.code = "unavailable";
  }
}

export function createStrategies(host = window) {
  let trustedPolicy;
  const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : null;
  const parent = () => host.document.head || host.document.documentElement;
  const nonce = () => host.document.querySelector(CSS_SELECTORS.s024)?.nonce || "";
  const requirePage = () => {
    if (!page) throw new Unavailable("unsafeWindow não disponível");
    return page;
  };
  function script(
    source,
    { type = "", withNonce = false, write = "textContent", url = false, gm = null, trusted = false } = {},
  ) {
    const attrs = {};
    if (type) attrs.type = type;
    if (withNonce) {
      if (!nonce()) throw new Unavailable("Nenhum nonce observável na página");
      attrs.nonce = nonce();
    }
    let objectURL,
      content = source;
    if (url === "blob") {
      objectURL = host.URL.createObjectURL(new host.Blob([source], { type: "application/javascript" }));
      attrs.src = objectURL;
    }
    if (url === "data") attrs.src = "data:text/javascript;charset=utf-8," + encodeURIComponent(source);
    if (trusted) {
      const tt = page?.trustedTypes || host.trustedTypes;
      if (!tt) throw new Unavailable("Trusted Types não disponível");
      const policy = (trustedPolicy ||= tt.createPolicy("rodx-repl-" + crypto.randomUUID(), {
        createScript: (value) => value,
      }));
      content = policy.createScript(source);
    }
    if (!url) attrs[write] = content;
    let node;
    const dispose = () => {
      node?.remove?.();
      if (objectURL) host.URL.revokeObjectURL(objectURL);
    };
    try {
      if (gm) {
        const value = gm(parent(), "script", attrs);
        if (value?.then)
          return value.then(
            (result) => {
              node = result;
              return dispose;
            },
            (error) => {
              dispose();
              throw error;
            },
          );
        node = value;
      } else {
        node = host.document.createElement("script");
        for (const [key, value] of Object.entries(attrs)) {
          if (key === "appendText") node.append(host.document.createTextNode(value));
          else node[key] = value;
        }
        parent().append(node);
      }
      return dispose;
    } catch (error) {
      dispose();
      throw error;
    }
  }
  const classic = (name, options = {}) => ({
    id: name,
    label: name,
    world: "página",
    run: (source) => script(source, options),
  });
  return [
    {
      id: "sandbox-eval-direct",
      label: "Sandbox · eval direto",
      world: "sandbox",
      run(source) {
        eval(source);
      },
    },
    {
      id: "sandbox-eval-global",
      label: "Sandbox · eval indireto",
      world: "sandbox",
      run: (source) => (0, eval)(source),
    },
    {
      id: "sandbox-function",
      label: "Sandbox · Function",
      world: "sandbox",
      run: (source) => host.Function(source)(),
    },
    {
      id: "page-eval",
      label: "unsafeWindow.eval",
      world: "página esperada",
      run: (source) => requirePage().eval(source),
    },
    {
      id: "page-function",
      label: "unsafeWindow.Function",
      world: "página esperada",
      run: (source) => requirePage().Function(source)(),
    },
    {
      id: "page-timer",
      label: "unsafeWindow.setTimeout(string)",
      world: "página esperada",
      run(source) {
        const p = requirePage();
        const id = p.setTimeout(source, 0);
        return () => p.clearTimeout(id);
      },
    },
    {
      id: "wrapped-eval",
      label: "wrappedJSObject.eval · Firefox",
      world: "página esperada",
      run(source) {
        const p = page?.wrappedJSObject || host.wrappedJSObject;
        if (!p) throw new Unavailable("wrappedJSObject não disponível");
        p.eval(source);
      },
    },
    {
      id: "exec-script",
      label: "execScript · legado",
      world: "página esperada",
      run(source) {
        const p = requirePage();
        if (typeof p.execScript !== "function") throw new Unavailable("execScript não disponível");
        p.execScript(source);
      },
    },
    classic("script-textContent"),
    classic("script-text", { write: "text" }),
    classic("script-text-node", { write: "appendText" }),
    classic("script-innerHTML", { write: "innerHTML" }),
    classic("script-nonce", { withNonce: true }),
    classic("script-trusted-types", { trusted: true }),
    {
      id: "gm-script",
      label: "GM_addElement · script",
      world: "página",
      run(source) {
        if (typeof GM_addElement !== "function") throw new Unavailable("GM_addElement não disponível");
        return script(source, { gm: GM_addElement });
      },
    },
    {
      id: "gm-modern-script",
      label: "GM.addElement · script",
      world: "página",
      run(source) {
        if (typeof GM === "undefined" || typeof GM.addElement !== "function")
          throw new Unavailable("GM.addElement não disponível");
        return script(source, { gm: GM.addElement.bind(GM) });
      },
    },
    classic("blob-classic", { url: "blob" }),
    classic("data-classic", { url: "data" }),
    classic("module-inline", { type: "module" }),
    classic("module-nonce", { type: "module", withNonce: true }),
    classic("blob-module", { type: "module", url: "blob" }),
    classic("data-module", { type: "module", url: "data" }),
    {
      id: "import-blob",
      label: "import(Blob) · sandbox",
      world: "realm do importador",
      async run(source) {
        if (!host.URL.createObjectURL) throw new Unavailable("Blob URL não disponível");
        const url = host.URL.createObjectURL(new host.Blob([source], { type: "application/javascript" }));
        try {
          await import(/* @vite-ignore */ url);
        } finally {
          host.URL.revokeObjectURL(url);
        }
      },
    },
    {
      id: "import-data",
      label: "import(data:) · sandbox",
      world: "realm do importador",
      run: (source) =>
        import(/* @vite-ignore */ "data:text/javascript;charset=utf-8," + encodeURIComponent(source)),
    },
    {
      id: "page-import-blob",
      label: "unsafeWindow · import(Blob)",
      world: "realm do importador esperado",
      async run(source) {
        const p = requirePage();
        const url = p.URL.createObjectURL(new p.Blob([source], { type: "application/javascript" }));
        try {
          await p.Function("url", "return import(url)")(url);
        } finally {
          p.URL.revokeObjectURL(url);
        }
      },
    },
    {
      id: "event-handler",
      label: "Atributo onclick",
      world: "página",
      run(source) {
        const node = host.document.createElement("button");
        node.hidden = true;
        node.setAttribute("onclick", source);
        parent().append(node);
        node.click();
        return () => node.remove();
      },
    },
    {
      id: "javascript-url",
      label: "URL javascript: · opcional",
      world: "página",
      advanced: true,
      run(source) {
        const node = host.document.createElement("a");
        node.href = "javascript:" + source + ";void 0";
        node.hidden = true;
        parent().append(node);
        node.click();
        return () => node.remove();
      },
    },
  ];
}

export function automaticCandidates(methods) {
  const preferred = [
    "gm-script",
    "gm-modern-script",
    "script-nonce",
    "script-textContent",
    "script-trusted-types",
    "page-eval",
    "page-function",
    "blob-classic",
    "data-classic",
    "module-inline",
  ];
  const pageMethods = methods.filter(
    (method) => method.world.includes("página") || method.id === "page-import-blob",
  );
  return pageMethods.sort((a, b) => {
    const rank = (id) => (preferred.includes(id) ? preferred.indexOf(id) : preferred.length);
    return rank(a.id) - rank(b.id);
  });
}
