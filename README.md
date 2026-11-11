# Userscripts CF

Monorepo JavaScript para Tampermonkey, com Vite, pacotes npm, userscripts separados e um instalável unificado com roteamento por URL.

## Como desenvolver

Node.js 22.12+ e npm:

```sh
npm ci
npm install nome-do-pacote
npm run build
npm test
```

Edite os arquivos em `src/userscripts/`. Os pacotes importados entram nos bundles; os scripts instalados não usam `import()` remoto, `eval()` ou URLs Blob. A configuração do Vite usa library mode/IIFE com alvo Safari 15 e código sem minificação. O build formata os instaláveis com Prettier.

## Definir onde cada script executa

Edite `userscripts.config.js`:

```js
{
  id: 'meu-script',
  name: 'Meu script',
  entry: 'src/userscripts/meu-script/index.js',
  matches: ['https://site.com/*'],
  exclude: ['https://site.com/settings*'],
}
```

Para criar uma pasta com um módulo inicial:

```sh
npm run new -- meu-script 'https://site.com/*'
```

O comando cria a pasta e imprime a entrada para adicionar à configuração. Mudanças nos domínios exigem rebuild e reinstalação do unificado: o Tampermonkey precisa atualizar os `@match`.

Cada módulo exporta um objeto com `init(ctx)`; pode retornar uma função de limpeza, inclusive depois de uma inicialização assíncrona:

```js
import { nanoid } from "nanoid";
import css from "./style.css?inline";

export default {
  async init(ctx) {
    ctx.style(css);
    const value = await ctx.storage.get("settings", {});
    ctx.state.set({ ...value, session: nanoid() });
    ctx.listen(window, "click", (event) => console.log(event.target));
    return () => console.info("Módulo encerrado");
  },
};
```

Use `?inline` no CSS e `ctx.style(css)` para inserir e remover estilos junto com o módulo. Recursos externos não são carregados automaticamente: prefira imports empacotados e recursos inline. Os módulos devem acessar DOM dentro de `init`, para que os imports não modifiquem páginas fora das regras.

## Saídas do build

| Arquivo                | Uso                                                                   |
| ---------------------- | --------------------------------------------------------------------- |
| `dist/unified.user.js` | Instale apenas este para usar todos os módulos nas URLs configuradas. |
| `dist/<id>.user.js`    | Instale um script específico, como alternativa ao unificado.          |
| `dist/manifest.json`   | Lista dos instaláveis, regras de URL e SHA-256 dos arquivos gerados.  |

O unificado contém os módulos empacotados e ativa somente os que correspondem à URL. Não instale simultaneamente o unificado e uma saída individual para o mesmo módulo. Os dois usam o mesmo namespace GM por módulo para preservar preferências quando você troca de formato.

Navegações SPA por `pushState`, `replaceState`, voltar/avançar e hash atualizam o roteamento. Um módulo permanece ativo enquanto sua regra corresponde; ao sair, o core remove estilos, listeners e recursos registrados com `ctx.onDispose`. O core usa estado centralizado em memória e storage GM persistente por módulo. Não há varredura periódica do DOM ou polling de URL.

`ctx.url` retorna a URL atual. `ctx.signal` sinaliza encerramento. Registre recursos externos (observers, timers e players) com `ctx.onDispose`; listeners criados por `ctx.listen` usam cancelamento automático. Para reagir a mudanças dentro de uma rota que continua ativa, o módulo pode observar os eventos de navegação adequados sem reinicializar tudo.

Os módulos executam no contexto da página por injeção de script clássico. A ponte oferece apenas `get`, `set` e `delete` no namespace GM do módulo. Não é uma fronteira de segurança contra a própria página e não deve armazenar segredos. CSPs de outros sites podem bloquear a injeção; validar cada site é necessário. Esse mecanismo foi validado no laboratório do Safari/X, mas este novo build ainda precisa de teste no iPhone.

Os módulos `x-foundation` e `example-site` são demonstrações. No X, a base apenas registra uma ativação e mostra uma mensagem no console; em `example.com`, a demonstração mostra um pequeno indicador e importa `nanoid` do npm. **O RodX gigante ainda não foi migrado.**

## Build e publicação no Cloudflare

O Worker `userscripts-cf` está conectado à branch `main` deste repositório pelo **Cloudflare Workers Builds**. O código-fonte continua privado. Cada push na `main` executa:

1. `npm run ci:cloudflare`: formatação, testes, Vite e preparação do Worker com os instaláveis.
2. `npm run deploy:cloudflare`: publica o Worker pela API usando o build token do Cloudflare.
3. `npm run publish:github`: espelho opcional dos arquivos em uma Release do GitHub, quando `GH_TOKEN` estiver configurado.

Distribuição pública:

- https://userscripts-cf.kisten.workers.dev/unified.user.js
- https://userscripts-cf.kisten.workers.dev/unified.meta.js
- https://userscripts-cf.kisten.workers.dev/manifest.json

A publicação em Cloudflare não precisa de token do GitHub no código. A integração Git autorizada permite ao serviço clonar o repositório. O deploy usa um build token já cadastrado no Cloudflare; nenhum novo serviço de armazenamento ou plano pago foi ativado. O Worker serve somente os arquivos empacotados, sem acesso ao repositório em tempo de execução.

Os instaláveis usam essas URLs públicas em `@updateURL` e `@downloadURL`. Aumente a versão no `package.json` antes de publicar uma atualização; o Tampermonkey não detecta alterações de código com a mesma versão.

Os workflows do GitHub Actions ficaram apenas manuais e opcionais. O fluxo normal não depende deles.

### Espelhar também em GitHub Releases

No Cloudflare, abra **userscripts-cf → Settings → Builds → Variables and secrets** e adicione **GH_TOKEN** como **secret**. Use um token fine-grained do GitHub limitado ao repositório `userscripts-cf`, com **Contents: Read and write**. Não coloque o valor no repositório nem nas URLs. O `GITHUB_TOKEN` automático do Actions não existe no ambiente do Cloudflare.

Sem esse secret, o espelho é ignorado explicitamente no log e a distribuição pública pelo Cloudflare funciona normalmente. Com ele, o build cria um draft, envia os `.js`, metadados e checksums e só então publica a Release. Uma Release já publicada com arquivos diferentes exige incremento de versão. Releases neste repositório privado continuam privadas; o Tampermonkey usa o Cloudflare para atualização pública.

## Laboratório remoto preservado

- URL: https://rodx-loader-lab.kisten.workers.dev
- `labs/remote-release/`: laboratório A/B, SHA-256, storage GM e recuperação após falha HTTP.
- `diagnostics/`: captura GraphQL fetch/XHR e testes de ponte GM.
- `npm run test:lab`: testes do laboratório usando A localmente.
- `npm run build:lab:b`: gera o Worker B localmente; não publica nada.

A release B foi publicada para testar a transição de A para B e o rollback. O resultado no dispositivo ainda precisa comprovar as duas etapas. Não publique dados privados, headers ou credenciais capturados pelo diagnóstico.

## Atualização nativa e GitHub Releases

O build inclui `@updateURL` e `@downloadURL` em todos os instaláveis. A versão de todos vem de `package.json`, para que mudanças no core também atualizem os scripts individuais. Aumente essa versão em cada release; não basta alterar o código mantendo a mesma versão.

A URL base fica em `distribution.config.js` e pode ser sobrescrita por `USERSCRIPTS_BASE_URL` no momento do build. O padrão é:

```text
https://userscripts-cf.kisten.workers.dev
```

O unificado é distribuído como `unified.meta.js` e `unified.user.js`; os individuais seguem o mesmo padrão com seu ID. O Tampermonkey verifica a versão do `.meta.js` e usa o `.user.js` quando uma atualização está disponível, conforme suas configurações de atualização. A atualização é do instalável completo, não um hot reload de módulos durante a página aberta.

**Este repositório é privado.** Seus assets de Release exigem acesso ao repositório. A distribuição pública pelo Cloudflare já está configurada, preservando a privacidade do fonte. Não inclua tokens na URL nem no userscript.

### Workflow opcional no GitHub Actions (manual)

O workflow manual `Release userscripts` permanece disponível como alternativa e exige runner do GitHub. O fluxo normal usa Cloudflare Builds. O tag informado ao workflow manual precisa coincidir com `v` + versão de `package.json`.

```sh
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release userscripts"
git push origin main
```

Também pode executar o workflow manualmente pela aba Actions, informando um tag correspondente à versão do código selecionado. O workflow usa o token automático do GitHub com permissão `contents: write`; não requer token pessoal salvo no código.

### Publicação local sem GitHub Actions

Com o GitHub CLI instalado e autenticado, dentro de um clone limpo do repositório:

```sh
gh auth login
npm ci
npm test
npm run release -- v0.2.0
```

O publicador recusa código não commitado, builds com versão antiga, checksums incorretos e sobrescrita de Releases já publicadas. Pode retomar um draft após uma falha no upload. A execução do GitHub Actions falhou antes de iniciar os steps na última tentativa; o caminho local permite publicar sem depender do runner. Nenhuma Release foi publicada apenas por adicionar esta configuração.
