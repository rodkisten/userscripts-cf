# Política de testes: runtime e utilitários (obrigatória)

> Decisão do mantenedor, 19/11/2026. **Não escrever, executar ou manter testes de componentes, telas ou userscripts.**

## Escopo permitido

- Runtime e ciclo de vida do contexto, storage, rede, eventos, disposals, integração de APIs e contratos públicos do runtime.
- Utilitários puros, parsers, transformadores, codemods AST, fixtures de transformação, algoritmos e infraestrutura de build.
- Testes de segurança e compatibilidade dos utilitários/runtime, quando pertinentes.

## Escopo proibido

- Testes de componentes React, Radix, shadcn, DOM renderizado, hooks de apresentação, snapshots visuais e UI.
- Testes funcionais, integração, boot, simulação de navegador ou comportamento de userscripts específicos (GitHub Tools, RodX, Reddit, Instagram etc.).
- Testes legados de Solid e fixtures destinadas apenas a testar a interface.
- Não substituir esses testes por equivalentes React. **Excluir, não migrar.**

## Validação

- Manter TypeScript, build e verificações estáticas de compilação. Isso não equivale a testes de componentes.
- Rodar Vitest somente para runtime e utilitários. Não rodar `vitest run` indiscriminadamente sobre a pasta `tests`.
- Ao adicionar um teste, justificar no PR que ele verifica uma API de runtime ou um utilitário, não uma funcionalidade de userscript.
- Remover gradualmente testes fora do escopo, seus fixtures exclusivos e dependências de teste sem consumidores.
- CI e documentação devem refletir o mesmo escopo. Não desativar typecheck/build para esconder regressões.
- As regras antigas que exigem testes de UI, playground ou userscripts ficam revogadas onde conflitarem com esta política.

## Critérios de aceite

1. Testes de runtime e utilitários aprovados.
2. Typecheck e build aprovados.
3. Nenhuma suíte de componentes/userscripts incluída na seleção de testes.
4. Falhas restantes documentadas com evidência; nunca declarar CI verde sem verificar.
