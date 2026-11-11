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
  version: '1.0.0',
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

## CI e hospedagem

O workflow valida cada push/PR e oferece `dist/` e o Worker do laboratório como artefatos. O `run-name` identifica branch/referência. Ele não faz deploy automático: a integração com Cloudflare continua pendente.

Os instaláveis são autossuficientes. O mecanismo remoto com atualização, snapshot e rollback continua isolado em `labs/remote-release/`; conectar esse mecanismo aos módulos reais é uma etapa posterior, depois da validação da infraestrutura. Não existe atualização remota automática escondida nestes novos instaláveis.

## Laboratório remoto preservado

- URL: https://rodx-loader-lab.kisten.workers.dev
- `labs/remote-release/`: laboratório A/B, SHA-256, storage GM e recuperação após falha HTTP.
- `diagnostics/`: captura GraphQL fetch/XHR e testes de ponte GM.
- `npm run test:lab`: testes do laboratório usando A localmente.
- `npm run build:lab:b`: gera o Worker B localmente; não publica nada.

A release B foi publicada para testar a transição de A para B e o rollback. O resultado no dispositivo ainda precisa comprovar as duas etapas. Não publique dados privados, headers ou credenciais capturados pelo diagnóstico.
