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

### Tags em todos os módulos

As mesmas tags também são declaradas nos módulos de `userscripts.config.js` (campo `tags: ['github', 'productivity']`). Os bundles de categoria incluem tanto módulos normais quanto scripts desta pasta. Tags repetidas são normalizadas e um script pode pertencer a várias categorias.

### Execução única entre instalações

A identidade lógica do script é estável e independente do bundle. Um script presente no bundle completo, no bundle de uma tag e na instalação individual só pode possuir **uma instância ativa** por página. A coordenação deve ser compartilhada entre instaladores, incluindo mundos sandbox/page, e liberar a posse no descarte. Scripts diferentes no mesmo site continuam independentes. A implementação precisa de testes de instalação em diferentes ordens, SPA, reentrada, erro na inicialização e Safari/Tampermonkey.

### Contrato desejado para o build

- Descobrir automaticamente todos os `.user.js` e `.user.ts` desta pasta.
- `.user.js`: preservar o código original, sem transpilar nem reformatar; adaptar apenas o empacotamento necessário para a execução isolada.
- `.user.ts`: compilar com Vite/TypeScript e permitir acesso ao contexto `ctx` e aos helpers do runtime.
- Gerar `standalone.user.js` e bundles separados por cada `@tag`, com manifesto e hashes.
- Respeitar `@match`, `@include`, `@exclude`, `@run-at`, `@grant`, `@require` e `@connect` por script, sem executar código em páginas não correspondentes.
- Não executar duas vezes o mesmo script quando tags, bundles ou instalações individuais se sobrepõem.
- Rejeitar metadados inválidos e incompatibilidades que não possam ser preservadas em um bundle.

**Status:** esta documentação descreve o contrato solicitado; o pipeline de descoberta e bundles por categoria ainda precisa ser implementado e validado. O build atual só usa `userscripts.config.js`.
