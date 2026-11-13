import { applyComponentStyle } from "../../core/css.js";
import { RUNTIME_LIMITS } from "../../config/runtime.js";
import { DEFAULT_SETTINGS } from "../../config/defaults.js";
import { RODX_SELECTORS } from "../../selectors.js";
import { mountPanel } from "./Panel.tsx";
import { createEditor } from "./editor.ts";
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
      historyCursor = state.history.length;
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
    const shadow = ctx.ui.root;
    const host = ctx.ui.host;
    host.id = "rodx-page-repl";
    applyComponentStyle(host, "rx-repl-host");
    ctx.ui.registerStyles(css);
    const container = document.createElement("div");
    const ui = mountPanel(container);
    ctx.ui.mount(container);
    const $ = (selector) => shadow.querySelector(selector);
    const panel = $(RODX_SELECTORS.replPanel),
      launcher = $(RODX_SELECTORS.replLauncher);
    const editor = createEditor($(RODX_SELECTORS.replCodeEditor), {
      value: state.code || "",
      page: () => (typeof unsafeWindow !== "undefined" ? unsafeWindow : window),
      names: () => knownNames,
      validate: (source) =>
        compile(source, { persist: $(RODX_SELECTORS.replPersist).checked, knownNames: [...knownNames] }),
      onChange: save,
      onValidation: (message) => {
        $(RODX_SELECTORS.replSyntax).textContent = message;
      },
      execute: () => void locked(() => execute()),
      history: (direction) => {
        historyCursor = Math.max(0, Math.min(state.history.length, historyCursor + direction));
        editor.value = state.history[historyCursor]?.code || "";
      },
    });
    $(RODX_SELECTORS.replTimeout).value = state.timeout || DEFAULT_SETTINGS.replWorkspace.timeout;
    for (const strategy of strategies) {
      const option = document.createElement("option");
      option.value = strategy.id;
      option.textContent = strategy.label;
      $(RODX_SELECTORS.replMethod).append(option);
    }
    for (const name of Object.keys(examples)) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      $(RODX_SELECTORS.replExample).append(option);
    }
    function save() {
      state.code = editor.value;
      state.timeout = Number($(RODX_SELECTORS.replTimeout).value) || DEFAULT_SETTINGS.replWorkspace.timeout;
      persist.save(state);
    }
    function print(kind, title, value) {
      records.push({ at: new Date().toISOString(), kind, title, value });
      if (records.length > 150) records.shift();
      ui.setRecords([...records]);
    }
    function event(event) {
      if (event.type === "console" && event.value.method === "clear") {
        records.length = 0;
        ui.setRecords([]);
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
        timeout: Math.min(
          60000,
          Math.max(
            250,
            Number($(RODX_SELECTORS.replTimeout).value) || DEFAULT_SETTINGS.replWorkspace.timeout,
          ),
        ),
      });
    }
    freshRunner();
    function renderMethods() {
      ui.setMethods(strategies.map((method) => ({ ...method, result: results.get(method.id) })));
    }
    function renderHistory() {
      ui.setHistory([...state.history].reverse());
    }
    ui.callbacks.method = (id) => {
      $(RODX_SELECTORS.replMethod).value = id;
      tab("console");
    };
    ui.callbacks.history = (code) => {
      editor.value = code;
      save();
      tab("console");
    };
    function tab(name) {
      for (const view of shadow.querySelectorAll(RODX_SELECTORS.replView))
        view.hidden = view.dataset.view !== name;
      for (const button of shadow.querySelectorAll(RODX_SELECTORS.replTab))
        button.setAttribute("aria-selected", String(button.dataset.tab === name));
      if (name === "history") renderHistory();
    }
    function enabledMethods() {
      return strategies.filter((method) => !method.advanced || $(RODX_SELECTORS.replAdvanced).checked);
    }
    async function probe() {
      for (const method of enabledMethods()) {
        if (abort.signal.aborted) break;
        $(RODX_SELECTORS.replStatus).textContent = "Testando " + method.label;
        await runner.run(method, probeCode, { signal: abort.signal, probe: true });
      }
    }
    async function execute(all = false) {
      const text = editor.value;
      if (text.length > 2000000) throw Error("Código maior que 2 MB.");
      const raw = $(RODX_SELECTORS.replRawMode).checked;
      const compiled = raw
        ? { code: text, names: [] }
        : compile(text, { persist: $(RODX_SELECTORS.replPersist).checked, knownNames: [...knownNames] });
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
      let method = strategies.find((item) => item.id === $(RODX_SELECTORS.replMethod).value);
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
      runner.configure($(RODX_SELECTORS.replTimeout).value);
      abort = new AbortController();
      for (const b of shadow.querySelectorAll(RODX_SELECTORS.replExecutionActions)) b.disabled = true;
      try {
        await action();
      } catch (error) {
        print("error", error.name, error.message);
      } finally {
        busy = false;
        for (const b of shadow.querySelectorAll(RODX_SELECTORS.replExecutionActions)) b.disabled = false;
        $(RODX_SELECTORS.replStatus).textContent = "Pronto · " + results.size + " métodos observados";
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
      setTimeout(() => URL.revokeObjectURL(url), RUNTIME_LIMITS.pageReplIndex.downloadDelayMs);
    }
    async function fetchURL() {
      const url = new URL($(RODX_SELECTORS.replUrl).value);
      if (!/^https?:$/.test(url.protocol)) throw Error("Use uma URL HTTP/HTTPS.");
      if (typeof GM_xmlhttpRequest !== "function") throw Error("GM_xmlhttpRequest indisponível.");
      const text = await new Promise((resolve, reject) =>
        GM_xmlhttpRequest({
          method: "GET",
          url: url.href,
          timeout: RUNTIME_LIMITS.pageReplIndex.fetchURLTimeout,
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
      const url = new URL($(RODX_SELECTORS.replUrl).value);
      if (!/^https?:$/.test(url.protocol)) throw Error("Use HTTP/HTTPS.");
      const script = document.createElement("script");
      if ($(RODX_SELECTORS.replModule).checked) script.type = "module";
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
      editor.complete();
    }
    const actions = {
      "select-all": () => editor.selectAll(),
      "copy-code": async () => {
        await copy(editor.selected());
        $(RODX_SELECTORS.replStatus).textContent = "Código copiado";
      },
      "paste-code": async () => {
        try {
          editor.insert(await navigator.clipboard.readText());
        } catch {
          $(RODX_SELECTORS.replStatus).textContent =
            "Toque no editor e use Colar no menu do iOS ou Ctrl/Cmd+V.";
          editor.focus();
        }
      },
      validate: () => editor.validate(),
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
        ui.setRecords([]);
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
        $(RODX_SELECTORS.replStatus).textContent = "Relatório copiado";
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
      const button = event.target.closest(RODX_SELECTORS.replActionsAndTabs);
      if (!button) return;
      if (button.dataset.tab) {
        tab(button.dataset.tab);
        return;
      }
      Promise.resolve()
        .then(() => actions[button.dataset.action]?.())
        .catch((error) => print("error", error.name, error.message));
    });
    ctx.listen($(RODX_SELECTORS.replExample), "change", (event) => {
      if (examples[event.target.value]) {
        editor.value = examples[event.target.value];
        save();
      }
    });
    function viewport() {
      const visual = window.visualViewport;
      const height = visual?.height || innerHeight;
      const bottom = Math.max(0, innerHeight - height - (visual?.offsetTop || 0));
      panel.style.setProperty("--repl-height", Math.max(0, height - 12) + "px", "important");
      panel.style.setProperty("--repl-bottom", bottom + 6 + "px", "important");
    }
    viewport();
    if (window.visualViewport) {
      ctx.listen(window.visualViewport, "resize", viewport);
      ctx.listen(window.visualViewport, "scroll", viewport);
    }
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
        if (!panel.hidden) {
          editor.refresh();
          editor.focus();
        }
      }
      drag = null;
    });
    ctx.listen(launcher, "pointercancel", () => (drag = null));
    ctx.listen(launcher, "click", (event) => {
      if (event.detail === 0) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          editor.refresh();
          editor.focus();
        }
      }
    });
    if (typeof GM_registerMenuCommand === "function")
      GM_registerMenuCommand("Abrir REPL JavaScript", () => (panel.hidden = false));
    ctx.dock?.register([{ id: "open", label: "Abrir REPL", run: () => { panel.hidden = false; editor.refresh(); editor.focus(); } }]);
    renderMethods();
    ctx.onDispose(() => {
      abort?.abort();
      runner.dispose();
      editor.destroy();
      ui.dispose();
      persist.dispose();
    });
  },
};
