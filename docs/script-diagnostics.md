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
- [x] Handler Solid para falhas reativas na árvore de ownership
- [x] Observação passiva opt-in de falhas fetch/XHR nativos com proprietário unknown
- [x] Snapshot IndexedDB com retenção de 250 fingerprints e fallback localStorage
- [x] Sincronização best-effort entre abas da mesma origem (BroadcastChannel e storage events)
- [ ] Sincronização entre mundos isolados do Tampermonkey e entre origens
- [ ] Sanitização robusta de stack, URL e dados de exceção antes de persistir
- [x] Painel inicial Solid no Dock com filtro por script, stack e exportação JSON
- [x] Integrar Object Inspector existente ao Dock
- [x] Syntax highlighting de stack traces no Dock e playground
- [x] Playground interativo de diagnósticos com link no design system
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

Erros globais sem contexto de execução são marcados como `unknown`; não atribuir arbitrariamente a um módulo. O armazenamento utiliza IndexedDB com fallback localStorage. Erros de inicialização ocorridos antes da instalação do prelude não são recuperáveis. Callbacks externos ao runtime e falhas fora do ownership Solid não são cobertos automaticamente. Não declarar o recurso completo até o build e a compatibilidade serem verificados.

## API do contexto

```ts
ctx.diagnostics.capture(new Error("Falha de exemplo"), "custom.operation");
ctx.listen(window, "click", async () => { throw new Error("Falha no listener"); });
```

O Dock mostra a seção Diagnósticos e permite exportar o JSON. A captura de callbacks externos ao ctx ainda exige instrumentação própria. Não há validação de build concluída nesta etapa.

## Integrações HTTP e Solid

O runtime captura erros de `ctx.http.request` (rejeições de rede e exceções), falhas dos interceptadores de requisição/resposta e exceções de `ctx.ui.mountSolid`. O comportamento original é preservado: requisições ainda rejeitam e exceções de montagem são relançadas. Cancelamentos esperados por `AbortError` não são registrados. Respostas HTTP 4xx/5xx não são automaticamente tratadas como exceções. Fetch/XHR nativos possuem observação opt-in; falhas reativas do Solid na árvore de ownership são capturadas.

## Persistência IndexedDB

A versão atual abre o banco `rod-script-diagnostics` (v1), object store `snapshots`, chave `history`. Mantém um snapshot de até 250 fingerprints, com fallback síncrono em localStorage. A hidratação não sobrescreve novos erros capturados durante a abertura do banco. O armazenamento é por origem e mundo JavaScript, sem sincronização garantida entre abas. A limpeza remove os registros em ambos os backends quando o IndexedDB está disponível.

## Captura de rede nativa

Não se atribuem erros de `fetch`/XHR da página a um userscript sem evidência de propriedade. `ctx.http.request` e interceptadores do próprio script são atribuídos; chamadas nativas externas permanecem sem proprietário conhecido. Instrumentação passiva opt-in ainda pendente.

## Solid reativo

`ctx.ui.mountSolid` instala um handler `onError` no owner Solid do componente, registrando erros reativos com o ID do userscript. Um callback opcional `options.onError` também é invocado. O handler não garante captura de erros fora da árvore de ownership Solid.

## Observação passiva de rede

```ts
const stop = ctx.diagnostics.observeNetwork();
// stop() interrompe o monitoramento antes do descarte do contexto.
```

Somente falhas de transporte e status 5xx geram diagnósticos. O observador reutiliza os interceptadores passivos de fetch e XHR, sem ler os corpos quando `maxBodyCharacters` é zero. URLs são reduzidas a origin + pathname; a propriedade `script` permanece `unknown`, pois as chamadas podem pertencer à página. O observador é opt-in e não altera o resultado das requisições.

## Revisão de integração (2026-11-16)

Foi corrigida uma regressão em `src/core/runtime.ts`: `ctx.listen` atribuía indevidamente uma falha assíncrona também a `module.init`; a captura `module.init` foi restaurada ao bloco `catch` de inicialização. Não foi possível executar `npm run typecheck` nem `npm run build` neste ambiente porque o clone remoto não ficou acessível. A consulta de status do commit anterior não retornou checks. Portanto, a compilação continua **não validada**.

## Playground

Acesse `/playground/diagnostics.html` (linkado no catálogo e Design System). Inclui gerador de erros, simulação de recorrência, busca, filtros, ordenação, visualização de stack, importação e exportação JSON, modo local e integração ao coletor global quando disponível. O playground não executa código fornecido pelo usuário.

## Sincronização entre abas

O prelude compartilha eventos `capture`, `clear`, `hello` e `snapshot` via `BroadcastChannel("rod:script-diagnostics:v1")`, com fallback em `storage` events. Mensagens possuem IDs de origem e sequência para evitar processamento duplicado nos dois transportes. O histórico recebido é persistido em IndexedDB e localStorage; snapshots reconciliam fingerprints pelo maior contador conhecido. Um marcador persistente `:clearedAt` impede que um snapshot antigo do IndexedDB ressuscite registros apagados. A comunicação funciona somente entre contextos que compartilham origem e partição de armazenamento. Não sincroniza sandboxes isoladas, domínios diferentes ou dispositivos. Contagens de eventos simultâneos podem divergir sob concorrência e ainda precisam de reconciliação por origem para garantir precisão exata.
