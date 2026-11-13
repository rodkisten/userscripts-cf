# Scripts independentes

Coloque aqui scripts utilitários com extensão `.user.js` ou `.user.ts`.

## Metadados

Use o cabeçalho padrão do Tampermonkey. A diretiva **`@tag`** existe oficialmente e pode ser repetida. Preferimos `@tag` a uma diretiva inventada `@category`.

```ts
// ==UserScript==
// @name         Utilitário GitHub
// @namespace    https://rod.migos.club/userscripts-cf
// @version      1.0.0
// @match        https://github.com/*
// @tag          github
// @tag          productivity
// @run-at       document-idle
// @grant        GM_getValue
// ==/UserScript==
```

### Contrato desejado para o build

- Descobrir automaticamente todos os `.user.js` e `.user.ts` desta pasta.
- `.user.js`: preservar o código original, sem transpilar nem reformatar; adaptar apenas o empacotamento necessário para a execução isolada.
- `.user.ts`: compilar com Vite/TypeScript e permitir acesso ao contexto `ctx` e aos helpers do runtime.
- Gerar `standalone.user.js` e bundles separados por cada `@tag`, com manifesto e hashes.
- Respeitar `@match`, `@include`, `@exclude`, `@run-at`, `@grant`, `@require` e `@connect` por script, sem executar código em páginas não correspondentes.
- Não executar duas vezes o mesmo script quando tags ou bundles se sobrepõem.
- Rejeitar metadados inválidos e incompatibilidades que não possam ser preservadas em um bundle.

**Status:** esta documentação descreve o contrato solicitado; o pipeline de descoberta e bundles por categoria ainda precisa ser implementado e validado. O build atual só usa `userscripts.config.js`.
