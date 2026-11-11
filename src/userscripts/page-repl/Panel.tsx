import { createSignal, For } from "solid-js";
import { render } from "@solidjs/web";

type RecordItem = { kind: string; title: string; value: unknown };
type MethodItem = { id: string; label: string; world: string; result?: any };
type HistoryItem = { code: string; at: string };
const pretty = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));

export function mountPanel(container: HTMLElement) {
  const [records, setRecords] = createSignal<RecordItem[]>([]);
  const [methods, setMethods] = createSignal<MethodItem[]>([]);
  const [history, setHistory] = createSignal<HistoryItem[]>([]);
  const callbacks = { method: (_id: string) => {}, history: (_code: string) => {} };
  const dispose = render(
    () => (
      <div class="repl-root">
        <button class="launcher" aria-label="Abrir REPL JavaScript">
          {">_"}
        </button>
        <section class="panel" aria-label="REPL JavaScript" hidden={true}>
          <header>
            <strong>{"REPL · JavaScript"}</strong>
            <button data-action="copy-report">{"Relatório"}</button>
            <button data-action="close" aria-label="Fechar">
              {"×"}
            </button>
          </header>
          <nav class="tabs">
            <button data-tab="console" aria-selected="true">
              {"Console"}
            </button>
            <button data-tab="methods">{"Métodos"}</button>
            <button data-tab="history">{"Histórico"}</button>
          </nav>
          <div class="view" data-view="console">
            <div class="toolbar execution-toolbar">
              <select aria-label="Método" data-method="">
                <option value="auto">{"Automático · testa antes, executa uma vez"}</option>
              </select>
              <button class="primary" data-action="run">
                {"Executar"}
              </button>
              <button data-action="stop">{"Parar espera"}</button>
            </div>
            <div class="editor-actions" role="toolbar" aria-label="Edição">
              <button data-action="select-all">Selecionar tudo</button>
              <button data-action="copy-code">Copiar</button>
              <button data-action="paste-code">Colar</button>
              <button data-action="validate">Validar</button>
            </div>
            <div class="editor-wrap">
              <div data-code-editor="" />
            </div>
            <div class="options">
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
            <p class="hint" data-syntax="">
              {
                "Await e última expressão retornam resultado. Use _, $, $$, $0 e ctx.vars. Declarações de topo persistidas viram propriedades mutáveis, inclusive const. Console capturado enquanto a execução aguarda o resultado."
              }
            </p>
            <div class="row">
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
            <p class="hint warning">
              {
                "Parar/timeout cancelam a espera, não interrompem loops síncronos nem desfazem efeitos. “Executar em todos” repete seu código."
              }
            </p>
            <div class="toolbar">
              <button data-action="probe">{"Testar compatibilidade"}</button>
              <button data-action="run-all">{"Executar em todos"}</button>
              <button data-action="clear">{"Limpar saída"}</button>
              <button data-action="reset">{"Nova sessão"}</button>
            </div>
            <div class="output">
              <For each={records()}>
                {(item) => (
                  <details
                    class="record"
                    data-kind={item.kind}
                    open={item.kind === "error" || item.kind === "result"}
                  >
                    <summary>{item.title}</summary>
                    <pre>{pretty(item.value)}</pre>
                  </details>
                )}
              </For>
            </div>
          </div>
          <div class="view" data-view="methods" hidden={true}>
            <p class="hint">
              {
                "OK confirma retorno pelo transporte, não equivalência entre todos os contextos. “Página esperada” indica o alvo do método; evidências aparecem nos detalhes. CSP e o gerenciador podem alterar o resultado. @sandbox raw/JavaScript/DOM exigem reinstalação; APIs chrome.scripting/userScripts precisam de uma extensão e não são concedidas por este userscript."
              }
            </p>
            <div class="options">
              <label>
                <input data-advanced="" type="checkbox" />
                {"Incluir javascript: (opcional)"}
              </label>
              <button data-action="probe">{"Testar 27 estratégias"}</button>
            </div>
            <div class="results">
              <For each={methods()}>
                {(item) => (
                  <div class="result" data-status={item.result?.status || ""}>
                    <strong>{item.label + " · " + (item.result?.status || "NÃO TESTADO")}</strong>
                    <details>
                      <summary>
                        {item.world + (item.result ? " · " + item.result.elapsedMs + " ms" : "")}
                      </summary>
                      <pre>{pretty(item.result || { expectedWorld: item.world })}</pre>
                    </details>
                    <button onClick={() => callbacks.method(item.id)}>Usar no console</button>
                  </div>
                )}
              </For>
            </div>
          </div>
          <div class="view" data-view="history" hidden={true}>
            <p class="hint">
              {"Código armazenado localmente por site. Nada é executado ao abrir o histórico."}
            </p>
            <div data-history="">
              <For each={history()}>
                {(item) => (
                  <div class="history-item">
                    <small>{item.at}</small>
                    <pre>{item.code.slice(0, 300)}</pre>
                    <button onClick={() => callbacks.history(item.code)}>Carregar</button>
                  </div>
                )}
              </For>
            </div>
            <div class="toolbar">
              <button data-action="export">{"Exportar JSON"}</button>
              <button data-action="import">{"Importar JSON"}</button>
              <button data-action="clear-history">{"Apagar histórico"}</button>
            </div>
          </div>
          <footer>
            <span class="status">{"Pronto."}</span>
            <small>{"Sem execução automática ao abrir"}</small>
          </footer>
        </section>
      </div>
    ),
    container,
  );
  return { setRecords, setMethods, setHistory, callbacks, dispose };
}
