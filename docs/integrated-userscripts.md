# Reddit, GitHub e Instagram

Os três módulos têm entrada no build Vite, UI em Solid 2 e estilos em CSS Modules. O JavaScript final é legível e formatado, sem comentários de implementação; somente o cabeçalho obrigatório `==UserScript==` permanece. Os comentários do código-fonte são preservados.

| Instalável                | Recursos                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gonewild.user.js`        | Reddit, Soundgasm e Audiochan; player, catálogo do autor, tags, pesquisa, histórico de reprodução e contexto de retorno ao post. Executa somente nesses domínios.                                              |
| `github-tools.user.js`    | Copiar conteúdo/caminhos, ordenação persistente e cópia do output completo por step do GitHub Actions. Abas nativas calculadas conforme largura e quantidade; ícones em espaços menores, sem menu de overflow. |
| `instagram-saved.user.js` | Sincronização para o Relay somente das coleções configuradas, com legendas, lotes, deduplicação, jitter e backoff. Configurações no painel Rod Actions ou no menu do Tampermonkey.                             |

## Logs do GitHub

Abra um job de uma execução do Actions e use **⧉ Output** no step desejado. O script usa `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/steps/{step_number}/logs`, incluindo o conteúdo de grupos recolhidos e linhas não renderizadas na tela. O número do step vem dos atributos/IDs nativos, não de sua posição visual.

O menu **GitHub · Token para logs (Actions: read)** permite configurar um token para repositórios privados ou quando o GitHub exigir autenticação. Ele é enviado apenas à API oficial, sem cookies; redirects de download seguem a política do navegador, que remove Authorization ao mudar de origem. Logs indisponíveis, expirados ou ainda não produzidos geram erro explícito, sem copiar um fragmento visível como se fosse o resultado completo.

## Instagram

Informe IDs de coleções, token do Relay e canais na mesma tela de configurações. Sem IDs, a sincronização fica desativada. O script preserva os cursores e confirmações locais por conta/coleção, só marca como entregue após confirmação do Relay e usa Web Locks para impedir execuções simultâneas. O navegador precisa estar aberto e autenticado; o script não roda dentro do app nativo.

`src/userscripts/instagram-saved/index.tsx` e `core.ts` são as fontes canônicas. `node build-instagram-saved.mjs` usa o mesmo build e atualiza a cópia de compatibilidade em `standalone/`, evitando versões divergentes.

## Validação

`npm ci`, `npm test` e `npm run lint`. Os testes cobrem logs completos, falhas de acesso, navegação SPA, montagem/limpeza de UI, configuração de coleções, deduplicação, backoff e remoção de comentários sem danificar strings ou regexes. Os fixtures de interface usam DOM simulado; sessões autenticadas e reprodução real no Safari precisam de validação no dispositivo.
