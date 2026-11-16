# Script Diagnostics

> Status: implementação parcial. Atualizar este documento e o playground sempre que a funcionalidade evoluir.

## Disponível

- [x] Prelude compartilhado injetado em todos os alvos pelo build
- [x] Listeners globais `error` e `unhandledrejection`
- [x] Registro de falhas de recursos
- [x] Histórico limitado a 250 fingerprints e contagem de recorrências
- [x] Persistência local best-effort e exportação JSON
- [x] Registro de ID, versão e alvo dos scripts instalados

## Pendente

- [x] Captura atribuída em module.init e ctx.listen (outros callbacks pendentes)
- [x] Instrumentação de ctx.listen e ctx.events.dom com captura síncrona e assíncrona
- [ ] Validar semântica de once, removeEventListener e AbortSignal em Safari
- [x] Captura de erros de requisição ctx.http.request e de interceptadores HTTP
- [x] Captura de falhas síncronas no mount Solid
- [ ] Error boundaries Solid e falhas reativas após o mount
- [ ] Captura de erros de fetch/XHR nativos sem atribuição incorreta
- [x] Snapshot IndexedDB com retenção de 250 fingerprints e fallback localStorage
- [ ] Isolamento e sincronização entre mundos e abas
- [ ] Sanitização robusta de stack, URL e dados de exceção antes de persistir
- [x] Painel inicial Solid no Dock com filtro por script, stack e exportação JSON
- [x] Integrar Object Inspector existente ao Dock
- [ ] Syntax highlighting especializado para stack traces
- [ ] Playground interativo e link no design system
- [ ] Sourcemaps validados para o bundle minificado
- [ ] Validação de build, segurança e compatibilidade Safari/Tampermonkey

## Acesso provisório

No mesmo mundo JavaScript em que o coletor foi instalado:

```js
const diagnostics = window.__rodScriptDiagnosticsV1;
console.log(diagnostics?.history);
console.log(diagnostics?.export());
diagnostics?.clear();
```

O coletor não garante que o objeto esteja acessível no console da página quando o userscript roda em sandbox isolada.

## Limitações atuais

Erros globais sem contexto de execução são marcados como `unknown`; não atribuir arbitrariamente a um módulo. O armazenamento atual usa localStorage, não IndexedDB. Erros de inicialização ocorridos antes da instalação do prelude não são recuperáveis. A implementação ainda não substitui instrumentação de callbacks, promises e handlers Solid. Não declarar o recurso completo até essas etapas serem implementadas e verificadas.

## API do contexto

```ts
ctx.diagnostics.capture(new Error("Falha de exemplo"), "custom.operation");
ctx.listen(window, "click", async () => { throw new Error("Falha no listener"); });
```

O Dock mostra a seção Diagnósticos e permite exportar o JSON. A captura de callbacks externos ao ctx ainda exige instrumentação própria. Não há validação de build concluída nesta etapa.

## Integrações HTTP e Solid

O runtime captura erros de `ctx.http.request` (rejeições de rede e exceções), falhas dos interceptadores de requisição/resposta e exceções de `ctx.ui.mountSolid`. O comportamento original é preservado: requisições ainda rejeitam e exceções de montagem são relançadas. Cancelamentos esperados por `AbortError` não são registrados. Respostas HTTP 4xx/5xx não são automaticamente tratadas como exceções. Fetch/XHR nativos da página e falhas reativas do Solid após a montagem ainda não estão cobertos.

## Persistência IndexedDB

A versão atual abre o banco `rod-script-diagnostics` (v1), object store `snapshots`, chave `history`. Mantém um snapshot de até 250 fingerprints, com fallback síncrono em localStorage. A hidratação não sobrescreve novos erros capturados durante a abertura do banco. O armazenamento é por origem e mundo JavaScript, sem sincronização garantida entre abas. A limpeza remove os registros em ambos os backends quando o IndexedDB está disponível.

## Captura de rede nativa

Não se atribuem erros de `fetch`/XHR da página a um userscript sem evidência de propriedade. `ctx.http.request` e interceptadores do próprio script são atribuídos; chamadas nativas externas permanecem sem proprietário conhecido. Instrumentação passiva opt-in ainda pendente.

## Solid reativo

`ctx.ui.mountSolid` instala um handler `onError` no owner Solid do componente, registrando erros reativos com o ID do userscript. Um callback opcional `options.onError` também é invocado. O handler não garante captura de erros fora da árvore de ownership Solid.
