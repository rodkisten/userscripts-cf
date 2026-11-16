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
- [ ] Instrumentação de eventos do ctx sem alterar removeEventListener, once ou AbortSignal
- [ ] Integração com interceptadores HTTP e error boundaries Solid
- [ ] Armazenamento IndexedDB com política de retenção e isolamento entre mundos
- [ ] Sanitização robusta de stack, URL e dados de exceção antes de persistir
- [x] Painel inicial Solid no Dock com filtro por script, stack e exportação JSON
- [ ] Integrar Object Inspector e syntax highlighting
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
