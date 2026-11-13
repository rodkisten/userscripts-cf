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

## Migração reativa 4.0.1

As views não criam elementos soltos nem atualizam `textContent`, `innerHTML` ou `disabled` por seletores. Um teste de arquitetura verifica essa separação.

| Camada                                                     | Responsabilidade                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gonewild/components/`                                     | `SoundgasmApp`, `Player`, `Catalogue`, `RecordingCard`, `Markdown`, `Tags`, `PostCard`, `FeedRoot` e `SettingsShell`. Signals controlam buscas/seleções locais; stores controlam reprodução, configurações e resultados. |
| `gonewild/store.ts`                                        | Ações de configurações, vistos e busca; mantém as chaves legadas e persiste o payload da ação, sem ler um snapshot anterior ao commit do Solid 2.                                                                        |
| `gonewild/services.ts`, `bridge.js`, `network.js`          | Rede, limites de memória, cache e transporte versionado de contexto.                                                                                                                                                     |
| `*-adapter.tsx`, `native.ts`, `github-tools/navigation.ts` | Leitura do site e alterações indispensáveis em elementos pertencentes ao Reddit/GitHub/Soundgasm. Não montam filhos de UI manualmente.                                                                                   |
| `runtime/solid-ui/mount-point.tsx`                         | Única criação de contêiner de montagem para integrar Solid com documentos externos. A exceção separada é a injeção do shim de rede na página.                                                                            |
| GitHub e Instagram                                         | Toolbar/progresso/logs, bookmark, configurações e Rod Actions são componentes; o estado de exibição vem de signals/stores.                                                                                               |

O player observa fontes do jPlayer que aparecem depois de `DOMContentLoaded`, mantendo a mesma instância de áudio. Uma falha de renderização reabre a interface original em vez de deixar a página vazia. Os testes exercitam chegada tardia da fonte, eventos de mídia, seek, velocidade, loop, persistência, filtros e interações reais com as configurações. A versão passa a 4.0.1 para permitir atualização pelo gerenciador de userscripts.
