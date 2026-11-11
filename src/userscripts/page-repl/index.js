import { cssDeclarations } from "../../core/css.js";
import inlineCSS1 from "../../styles/inline/userscripts-page-repl-index-1.css?inline";
import { CSS_SELECTORS } from "../../selectors.js";
import { createMarkup } from "./markup.js";
import css from "./style.css?inline";
import { compile } from "./compiler.js";
import { createStrategies, automaticCandidates } from "./strategies.js";
import { createRunner } from "./runner.js";
import { createStorage } from "./storage.js";

const probeCode =
  'return {title:document.title,href:location.href,readyState:document.readyState,userAgent:navigator.userAgent,hasDocument:typeof document!=="undefined",gm:typeof GM_getValue};';
const examples = {
  Página: "({ title: document.title, url: location.href, readyState: document.readyState })",
  Sessão: "let counter = 0;\nfunction increment() { return ++counter; }\nincrement()",
  Async:
    'const response = await fetch(location.href);\n({ status: response.status, type: response.headers.get("content-type") })',
  DOM: 'const items = $$("a[href]").slice(0, 10);\nconsole.table(items.map(item => ({ text: item.textContent.trim(), href: item.href })));\nitems.length',
  GraphQL:
    "// Inspecione as chamadas no painel REDE do RodX; este REPL não captura tráfego automaticamente.\nObject.keys(window).filter(key => /react|relay|webpack/i.test(key))",
};

export default {
  async init(ctx) {
    const persist = createStorage(ctx.storage, location.origin);
    const state = await persist.read();
    if (ctx.signal.aborted) return;
    state.history ||= [];
    const knownNames = new Set(),
      records = [],
      results = new Map();
    const strategies = createStrategies();
    let busy = false,
      abort,
      runner,
      historyCursor = state.history.length,
      syntaxTimer,
      completionRange;
    if (!document.documentElement)
      await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (document.documentElement) finish();
        });
        const finish = () => {
          observer.disconnect();
          ctx.signal.removeEventListener("abort", finish);
          resolve();
        };
        observer.observe(document, { childList: true });
        ctx.signal.addEventListener("abort", finish, { once: true });
        if (ctx.signal.aborted || document.documentElement) finish();
      });
    if (ctx.signal.aborted) return;
    const host = document.createElement("div");
    host.id = "rodx-page-repl";
    host.style.cssText = cssDeclarations(inlineCSS1);
    const shadow = host.attachShadow({ mode: "open" });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement("style");
      const nonce = document.querySelector(CSS_SELECTORS.nonceBearingElements)?.nonce;
      if (nonce) style.nonce = nonce;
      style.textContent = css;
      shadow.append(style);
    }
    const container = document.createElement("div");
    container.append(createMarkup(document));
    shadow.append(container);
    (document.body || document.documentElement).append(host);
    const $ = (selector) => shadow.querySelector(selector);
    const editor = $(CSS_SELECTORS.textareas),
      panel = $(CSS_SELECTORS.replPanel),
      launcher = $(CSS_SELECTORS.replLauncher),
      output = $(CSS_SELECTORS.replOutput);
    const rawLabel = document.createElement("label");
    const rawInput = document.createElement("input");
    rawInput.type = "checkbox";
    rawInput.dataset.raw = "";
    rawLabel.append(rawInput, document.createTextNode("Script global (sem wrapper)"));
    $(CSS_SELECTORS.replOptions).prepend(rawLabel);
    editor.value = state.code || "";
    $(CSS_SELECTORS.replTimeout).value = state.timeout || 3000;
    for (const strategy of strategies) {
      const option = document.createElement("option");
      option.value = strategy.id;
      option.textContent = strategy.label;
      $(CSS_SELECTORS.replMethod).append(option);
    }
    for (const name of Object.keys(examples)) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      $(CSS_SELECTORS.replExample).append(option);
    }
    function save() {
      state.code = editor.value;
      state.timeout = Number($(CSS_SELECTORS.replTimeout).value) || 3000;
      persist.save(state);
    }
    function print(kind, title, value) {
      const item = document.createElement("details");
      item.className = "record";
      item.dataset.kind = kind;
      const summary = document.createElement("summary");
      summary.textContent = title;
      const pre = document.createElement("pre");
      pre.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      item.append(summary, pre);
      output.append(item);
      records.push({ at: new Date().toISOString(), kind, title, value });
      while (records.length > 150) {
        records.shift();
        output.firstElementChild?.remove();
      }
      item.open = kind === "error" || kind === "result";
      item.scrollIntoView?.({ block: "nearest" });
    }
    function event(event) {
      if (event.type === "console" && event.value.method === "clear") {
        records.length = 0;
        output.replaceChildren();
        return;
      }
      if (event.type === "console")
        print(event.value.method === "error" ? "error" : "log", event.value.method, event.value.args);
      if (event.type === "finished") {
        results.set(event.result.method, event.result);
        if (!event.result.probe)
          print(
            event.result.status === "OK" ? "result" : "error",
            event.result.label + " · " + event.result.status,
            event.result.detail,
          );
        for (const name of event.result.detail?.names || []) knownNames.add(name);
        renderMethods();
      }
    }
    function freshRunner() {
      runner?.dispose();
      runner = createRunner({
        onEvent: event,
        timeout: Math.min(60000, Math.max(250, Number($(CSS_SELECTORS.replTimeout).value) || 3000)),
      });
    }
    freshRunner();
    function renderMethods() {
      const list = $(CSS_SELECTORS.replResults);
      list.replaceChildren();
      for (const method of strategies) {
        const result = results.get(method.id),
          row = document.createElement("div");
        row.className = "result";
        row.dataset.status = result?.status || "";
        const title = document.createElement("strong");
        title.textContent = method.label + " · " + (result?.status || "NÃO TESTADO");
        const detail = document.createElement("details"),
          summary = document.createElement("summary"),
          pre = document.createElement("pre");
        summary.textContent = method.world + (result ? " · " + result.elapsedMs + " ms" : "");
        pre.textContent = JSON.stringify(result || { expectedWorld: method.world }, null, 2);
        detail.append(summary, pre);
        const button = document.createElement("button");
        button.textContent = "Usar no console";
        button.onclick = () => {
          $(CSS_SELECTORS.replMethod).value = method.id;
          tab("console");
        };
        row.append(title, detail, button);
        list.append(row);
      }
    }
    function renderHistory() {
      const list = $(CSS_SELECTORS.replHistory);
      list.replaceChildren();
      for (const item of [...state.history].reverse()) {
        const row = document.createElement("div");
        row.className = "history-item";
        const pre = document.createElement("pre");
        pre.textContent = item.code.slice(0, 300);
        const load = document.createElement("button");
        load.textContent = "Carregar";
        load.onclick = () => {
          editor.value = item.code;
          save();
          tab("console");
        };
        const stamp = document.createElement("small");
        stamp.textContent = item.at;
        row.append(stamp, pre, load);
        list.append(row);
      }
    }
    function tab(name) {
      for (const view of shadow.querySelectorAll(CSS_SELECTORS.replView))
        view.hidden = view.dataset.view !== name;
      for (const button of shadow.querySelectorAll(CSS_SELECTORS.replTab))
        button.setAttribute("aria-selected", String(button.dataset.tab === name));
      if (name === "history") renderHistory();
    }
    function enabledMethods() {
      return strategies.filter((method) => !method.advanced || $(CSS_SELECTORS.replAdvanced).checked);
    }
    async function probe() {
      for (const method of enabledMethods()) {
        if (abort.signal.aborted) break;
        $(CSS_SELECTORS.replStatus).textContent = "Testando " + method.label;
        await runner.run(method, probeCode, { signal: abort.signal, probe: true });
      }
    }
    async function execute(all = false) {
      const text = editor.value;
      if (text.length > 2000000) throw Error("Código maior que 2 MB.");
      const raw = $(CSS_SELECTORS.replRawMode).checked;
      const compiled = raw
        ? { code: text, names: [] }
        : compile(text, { persist: $(CSS_SELECTORS.replPersist).checked, knownNames: [...knownNames] });
      if (!state.history.length || state.history.at(-1).code !== text)
        state.history.push({ code: text, at: new Date().toISOString() });
      let bytes = state.history.reduce((sum, item) => sum + item.code.length, 0);
      while (state.history.length > 50 || bytes > 2000000) {
        bytes -= state.history.shift().code.length;
      }
      historyCursor = state.history.length;
      save();
      if (all) {
        for (const method of enabledMethods()) {
          if (abort.signal.aborted) break;
          await runner.run(method, compiled.code, { signal: abort.signal, raw });
        }
        return;
      }
      let method = strategies.find((item) => item.id === $(CSS_SELECTORS.replMethod).value);
      if (!method) {
        for (const candidate of automaticCandidates(enabledMethods())) {
          if (abort.signal.aborted) return;
          const id = candidate.id;
          let result = results.get(id);
          if (!result || !result.probe)
            result = await runner.run(candidate, probeCode, { signal: abort.signal, probe: true });
          if (result.status === "OK") {
            method = candidate;
            break;
          }
        }
        if (!method)
          throw Error(
            "Nenhum método de página confirmou execução. Selecione um método manualmente, incluindo sandbox, ou veja Métodos.",
          );
      }
      if (!abort.signal.aborted) await runner.run(method, compiled.code, { signal: abort.signal, raw });
    }
    async function locked(action) {
      if (busy) return;
      busy = true;
      runner.configure($(CSS_SELECTORS.replTimeout).value);
      abort = new AbortController();
      for (const b of shadow.querySelectorAll(CSS_SELECTORS.replExecutionActions)) b.disabled = true;
      try {
        await action();
      } catch (error) {
        print("error", error.name, error.message);
      } finally {
        busy = false;
        for (const b of shadow.querySelectorAll(CSS_SELECTORS.replExecutionActions)) b.disabled = false;
        $(CSS_SELECTORS.replStatus).textContent = "Pronto · " + results.size + " métodos observados";
      }
    }
    async function copy(text) {
      if (typeof GM_setClipboard === "function") {
        await GM_setClipboard(text, "text");
        return;
      }
      await navigator.clipboard.writeText(text);
    }
    const report = () => ({
      schema: 1,
      scriptVersion: typeof GM_info !== "undefined" ? GM_info.script?.version : "indisponível",
      handlerVersion: typeof GM_info !== "undefined" ? GM_info.version : "indisponível",
      at: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      handler: typeof GM_info !== "undefined" ? GM_info.scriptHandler : "indisponível",
      methods: [...results.values()],
      output: records,
    });
    function download(value) {
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = "page-repl-" + Date.now() + ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function fetchURL() {
      const url = new URL($(CSS_SELECTORS.replUrl).value);
      if (!/^https?:$/.test(url.protocol)) throw Error("Use uma URL HTTP/HTTPS.");
      if (typeof GM_xmlhttpRequest !== "function") throw Error("GM_xmlhttpRequest indisponível.");
      const text = await new Promise((resolve, reject) =>
        GM_xmlhttpRequest({
          method: "GET",
          url: url.href,
          timeout: 20000,
          onload: (response) =>
            response.status >= 200 && response.status < 300
              ? resolve(response.responseText)
              : reject(Error("HTTP " + response.status)),
          onerror: () => reject(Error("Falha no download GM")),
          ontimeout: () => reject(Error("Timeout do download GM")),
        }),
      );
      if (text.length > 2000000) throw Error("Script remoto maior que 2 MB.");
      editor.value = text;
      save();
      print("log", "URL carregada no editor", "Código não executado.");
    }
    function external() {
      const url = new URL($(CSS_SELECTORS.replUrl).value);
      if (!/^https?:$/.test(url.protocol)) throw Error("Use HTTP/HTTPS.");
      const script = document.createElement("script");
      if ($(CSS_SELECTORS.replModule).checked) script.type = "module";
      script.src = url.href;
      script.onload = () => {
        print(
          "log",
          "Script externo carregado",
          "Evento load recebido; efeitos/resultado do código remoto não foram instrumentados.",
        );
        script.remove();
      };
      script.onerror = () => {
        print("error", "Script externo", "Falha de carregamento, CSP ou CORS.");
        script.remove();
      };
      (document.head || document.documentElement).append(script);
      ctx.onDispose(() => script.remove());
    }
    function completions() {
      const end = editor.selectionStart,
        prefix = editor.value.slice(0, end).match(/[A-Za-z_$][\w$]*$/)?.[0] || "";
      completionRange = { start: end - prefix.length, end };
      const property = editor.value
        .slice(0, end)
        .match(/(window|document|navigator|location|console|ctx\.vars)\.([\w$]*)$/);
      let propertyNames;
      if (property) {
        const objects = { window, document, navigator, location, console };
        propertyNames = [];
        if (property[1] === "ctx.vars") propertyNames = [...knownNames];
        else {
          let object = objects[property[1]];
          for (let depth = 0; object && depth < 4; depth++, object = Object.getPrototypeOf(object))
            propertyNames.push(...Object.getOwnPropertyNames(object));
        }
        completionRange = { start: end - property[2].length, end };
      }
      const names = new Set(
        propertyNames || [
          "ctx",
          "console",
          "document",
          "window",
          "location",
          "fetch",
          "Promise",
          "$",
          "$$",
          "$0",
          "_",
          ...knownNames,
          ...Object.getOwnPropertyNames(window),
        ],
      );
      const list = $(CSS_SELECTORS.replCompletions);
      list.replaceChildren();
      for (const name of [...names]
        .filter(
          (name) =>
            name.startsWith(property ? property[2] : prefix) && name !== (property ? property[2] : prefix),
        )
        .sort()
        .slice(0, 16)) {
        const button = document.createElement("button");
        button.textContent = name;
        button.onclick = () => {
          editor.setRangeText(name, completionRange.start, completionRange.end, "end");
          list.hidden = true;
          editor.focus();
          save();
        };
        list.append(button);
      }
      list.hidden = !list.children.length;
    }
    const actions = {
      run: () => locked(() => execute()),
      "run-all": () => locked(() => execute(true)),
      probe: () => locked(probe),
      stop: () => {
        abort?.abort();
        runner.cancel();
      },
      close: () => (panel.hidden = true),
      clear: () => {
        records.length = 0;
        output.replaceChildren();
      },
      reset: () => {
        if (busy) return;
        freshRunner();
        knownNames.clear();
        print(
          "log",
          "Nova sessão",
          "Variáveis de sessão reiniciadas. Efeitos anteriores na página não são desfeitos.",
        );
      },
      complete: completions,
      "copy-report": async () => {
        await copy(JSON.stringify(report(), null, 2));
        $(CSS_SELECTORS.replStatus).textContent = "Relatório copiado";
      },
      export: () => download({ schema: 1, history: state.history, report: report() }),
      import: () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = async () => {
          try {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 4000000) throw Error("Arquivo maior que 4 MB.");
            const value = JSON.parse(await file.text());
            const history = (value.history || [])
              .filter((item) => typeof item.code === "string" && item.code.length <= 2000000)
              .slice(-50);
            state.history = history;
            save();
            renderHistory();
          } catch (error) {
            print("error", "Importação", error.message);
          }
        };
        input.click();
      },
      "clear-history": () => {
        state.history = [];
        save();
        renderHistory();
      },
      "fetch-url": () => locked(fetchURL),
      external: () => locked(external),
    };
    ctx.listen(shadow, "click", (event) => {
      const button = event.target.closest(CSS_SELECTORS.replActionsAndTabs);
      if (!button) return;
      if (button.dataset.tab) {
        tab(button.dataset.tab);
        return;
      }
      Promise.resolve()
        .then(() => actions[button.dataset.action]?.())
        .catch((error) => print("error", error.name, error.message));
    });
    ctx.listen(editor, "input", () => {
      save();
      clearTimeout(syntaxTimer);
      syntaxTimer = setTimeout(() => {
        try {
          compile(editor.value, {
            persist: $(CSS_SELECTORS.replPersist).checked,
            knownNames: [...knownNames],
          });
          $(CSS_SELECTORS.replSyntax).textContent =
            "Sintaxe válida · Ctrl/Cmd+Enter executa · histórico com Alt+↑/↓ · ctx.vars persiste na sessão";
        } catch (error) {
          $(CSS_SELECTORS.replSyntax).textContent = error.message;
        }
      }, 300);
    });
    ctx.listen(editor, "keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void locked(() => execute());
      }
      if (event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        completions();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
        save();
      }
      if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        historyCursor = Math.max(
          0,
          Math.min(state.history.length, historyCursor + (event.key === "ArrowUp" ? -1 : 1)),
        );
        editor.value = state.history[historyCursor]?.code || "";
      }
    });
    ctx.listen($(CSS_SELECTORS.replExample), "change", (event) => {
      if (examples[event.target.value]) {
        editor.value = examples[event.target.value];
        save();
      }
    });
    function viewport() {
      panel.style.setProperty(
        "--repl-height",
        Math.max(180, (window.visualViewport?.height || innerHeight) - 12) + "px",
      );
    }
    viewport();
    if (window.visualViewport) ctx.listen(window.visualViewport, "resize", viewport);
    function place() {
      launcher.style.right = Math.max(4, Math.min(innerWidth - 50, state.position?.x || 12)) + "px";
      launcher.style.bottom = Math.max(4, Math.min(innerHeight - 50, state.position?.y || 90)) + "px";
    }
    place();
    ctx.listen(window, "resize", () => {
      place();
      viewport();
    });
    let drag;
    ctx.listen(launcher, "pointerdown", (event) => {
      drag = {
        x: event.clientX,
        y: event.clientY,
        startX: parseFloat(launcher.style.right),
        startY: parseFloat(launcher.style.bottom),
        moved: false,
      };
      launcher.setPointerCapture?.(event.pointerId);
    });
    ctx.listen(launcher, "pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) {
        state.position = {
          x: Math.max(4, Math.min(innerWidth - 50, drag.startX - dx)),
          y: Math.max(4, Math.min(innerHeight - 50, drag.startY - dy)),
        };
        place();
      }
    });
    ctx.listen(launcher, "pointerup", () => {
      if (!drag) return;
      if (drag.moved) save();
      else {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) editor.focus();
      }
      drag = null;
    });
    ctx.listen(launcher, "pointercancel", () => (drag = null));
    ctx.listen(launcher, "click", (event) => {
      if (event.detail === 0) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) editor.focus();
      }
    });
    if (typeof GM_registerMenuCommand === "function")
      GM_registerMenuCommand("Abrir REPL JavaScript", () => (panel.hidden = false));
    renderMethods();
    ctx.onDispose(() => {
      abort?.abort();
      runner.dispose();
      clearTimeout(syntaxTimer);
      persist.dispose();
      host.remove();
    });
  },
};
