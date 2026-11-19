import { useState } from "react";
import type { ReactElement } from "react";

type RecordItem = { kind: string; title: string; value: unknown };
type MethodItem = { id: string; label: string; world: string; result?: any };
type HistoryItem = { code: string; at: string };
const pretty = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
};

export function mountPanel(
  container: HTMLElement,
  mountSharedReact: (component: ReactElement, container: HTMLElement) => () => void,
) {
  let updateRecords: (items: RecordItem[]) => void = () => {};
  let updateMethods: (items: MethodItem[]) => void = () => {};
  let updateHistory: (items: HistoryItem[]) => void = () => {};

  const callbacks = {
    options: (_trigger: HTMLElement) => {},
    method: (_id: string) => {},
    history: (_code: string) => {},
  };
  function Panel() {
    const [records, setRecords] = useState<RecordItem[]>([]);
    const [methods, setMethods] = useState<MethodItem[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    updateRecords = (items) => flushSync(() => setRecords(items));
    updateMethods = (items) => flushSync(() => setMethods(items));
    updateHistory = (items) => flushSync(() => setHistory(items));
    return (
      <div className="repl-root">
        <button className="launcher" aria-label="Abrir REPL JavaScript" hidden>
          {">_"}
        </button>
        <section className="panel" aria-label="REPL JavaScript" hidden={true}>
          <header>
            <strong>{"REPL · JavaScript"}</strong>
            <button data-action="run" className="primary" title="Executar código">
              {"▶ Executar"}
            </button>
            <button
              aria-label="Opções do REPL"
              aria-haspopup="menu"
              onClick={(event) => callbacks.options(event.currentTarget)}
            >
              {"⋯"}
            </button>
            <button data-action="close" aria-label="Fechar">
              {"×"}
            </button>
          </header>
          <div className="repl-menu" hidden role="group" aria-label="Opções avançadas do REPL">
            <nav className="tabs">
              <button data-tab="console" aria-selected="true">
                {"Console"}
              </button>
              <button data-tab="methods">{"Métodos"}</button>
              <button data-tab="history">{"Histórico"}</button>
            </nav>
            <div className="repl-menu-content">
              {" "}
              <div className="toolbar execution-toolbar">
                <select aria-label="Método" data-method="">
                  <option value="auto">{"Automático · testa antes, executa uma vez"}</option>
                </select>
                <button className="primary" data-action="run">
                  {"Executar"}
                </button>
                <button data-action="stop">{"Parar espera"}</button>
              </div>
              <div className="editor-actions repl-settings" role="toolbar" aria-label="Edição">
                <button data-action="select-all">Selecionar tudo</button>
                <button data-action="copy-code">Copiar</button>
                <button data-action="paste-code">Colar</button>
                <button data-action="validate">Validar</button>
              </div>
              <div className="options repl-settings">
                <label>
                  <input type="checkbox" data-raw="" />
                  Script global (sem wrapper)
                </label>
                <label>
                  <input data-persist="" type="checkbox" checked={true} />
                  {"Persistir variáveis"}
                </label>
                <label>
                  {"Timeout "}
                  <input data-timeout="" type="number" min="250" max="60000" step="250" />
                  {"ms"}
                </label>
                <button data-action="complete">{"Completar"}</button>
                <select aria-label="Exemplos" data-example="">
                  <option value="">{"Exemplos…"}</option>
                </select>
              </div>
              <p className="hint repl-settings" data-syntax="">
                {
                  "Await e última expressão retornam resultado. Use _, $, $, $0 e ctx.vars. Declarações de topo persistidas viram propriedades mutáveis, inclusive const. Console capturado enquanto a execução aguarda o resultado."
                }
              </p>
              <div className="row repl-settings">
                <input
                  data-url=""
                  type="url"
                  placeholder="https://site.com/script.js"
                  aria-label="URL do JavaScript"
                />
                <button data-action="fetch-url">{"URL → editor"}</button>
                <button data-action="external">{"Script src"}</button>
                <label>
                  <input data-module="" type="checkbox" />
                  {"Módulo"}
                </label>
              </div>
              <p className="hint warning repl-settings">
                {
                  "Parar/timeout cancelam a espera, não interrompem loops síncronos nem desfazem efeitos. “Executar em todos” repete seu código."
                }
              </p>
              <div className="toolbar repl-settings">
                <button data-action="probe">{"Testar compatibilidade"}</button>
                <button data-action="run-all">{"Executar em todos"}</button>
                <button data-action="clear">{"Limpar saída"}</button>
                <button data-action="reset">{"Nova sessão"}</button>
              </div>
            </div>
          </div>
          <div className="view" data-view="console">
            <div className="editor-wrap">
              <div data-code-editor="" />
            </div>
            <div className="output">
              {records.map((item) => (
                <details
                  className="record"
                  data-kind={item.kind}
                  open={item.kind === "error" || item.kind === "result"}
                >
                  <summary>{item.title}</summary>
                  <pre>{pretty(item.value)}</pre>
                </details>
              ))}
            </div>
          </div>
          <div className="view" data-view="methods" hidden={true}>
            <p className="hint">
              {
                "OK confirma retorno pelo transporte, não equivalência entre todos os contextos. “Página esperada” indica o alvo do método; evidências aparecem nos detalhes. CSP e o gerenciador podem alterar o resultado. @sandbox raw/JavaScript/DOM exigem reinstalação; APIs chrome.scripting/userScripts precisam de uma extensão e não são concedidas por este userscript."
              }
            </p>
            <div className="options">
              <label>
                <input data-advanced="" type="checkbox" />
                {"Incluir javascript: (opcional)"}
              </label>
              <button data-action="probe">{"Testar 27 estratégias"}</button>
            </div>
            <div className="results">
              {methods.map((item) => (
                <div className="result" data-status={item.result?.status || ""}>
                  <strong>{item.label + " · " + (item.result?.status || "NÃO TESTADO")}</strong>
                  <details>
                    <summary>
                      {item.world + (item.result ? " · " + item.result.elapsedMs + " ms" : "")}
                    </summary>
                    <pre>{pretty(item.result || { expectedWorld: item.world })}</pre>
                  </details>
                  <button onClick={() => callbacks.method(item.id)}>Usar no console</button>
                </div>
              ))}
            </div>
          </div>
          <div className="view" data-view="history" hidden={true}>
            <p className="hint">
              {"Código armazenado localmente por site. Nada é executado ao abrir o histórico."}
            </p>
            <div data-history="">
              {history.map((item) => (
                <div className="history-item">
                  <small>{item.at}</small>
                  <pre>{item.code.slice(0, 300)}</pre>
                  <button onClick={() => callbacks.history(item.code)}>Carregar</button>
                </div>
              ))}
            </div>
            <div className="toolbar">
              <button data-action="export">{"Exportar JSON"}</button>
              <button data-action="import">{"Importar JSON"}</button>
              <button data-action="clear-history">{"Apagar histórico"}</button>
            </div>
          </div>
          <footer>
            <span className="status">{"Pronto."}</span>
            <small>{"Sem execução automática ao abrir"}</small>
          </footer>
        </section>
      </div>
    );
  }
  const dispose = mountSharedReact(<Panel />, container);
  return {
    setRecords: (items: RecordItem[]) => updateRecords(items),
    setMethods: (items: MethodItem[]) => updateMethods(items),
    setHistory: (items: HistoryItem[]) => updateHistory(items),
    callbacks,
    dispose,
  };
}
