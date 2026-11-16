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

- [ ] Captura atribuída por módulo, incluindo callbacks e inicialização do runtime
- [ ] Instrumentação de eventos do ctx sem alterar removeEventListener, once ou AbortSignal
- [ ] Integração com interceptadores HTTP e error boundaries Solid
- [ ] Armazenamento IndexedDB com política de retenção e isolamento entre mundos
- [ ] Sanitização robusta de stack, URL e dados de exceção antes de persistir
- [ ] Interface Solid 2 no Dock com filtros e Object Inspector
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
