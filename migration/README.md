# RodX 3.8.1 → projeto modular 3.9.0

Fonte: `RodX-Studio-v3.8.1.user.js`, 874.366 bytes, SHA-256 `92636bd94605a3a45de279808ca198004556b44cbac965f63bd8e0f98af0f908`.

O original foi separado por domínios; não há uma cópia monolítica usada como implementação. Os arquivos em `src/userscripts/rodx-studio/` são o código-fonte editável. O build resolve os imports com Vite e produz IIFEs instaláveis para o Tampermonkey.

## Estrutura

| Pasta                                                  | Responsabilidade                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `bootstrap/`                                           | Sequência de inicialização, listeners e registro dos serviços.                      |
| `core/`, `state/`, `config/`, `shared/`                | Runtime, scheduler, estado centralizado, configuração e utilitários.                |
| `network/`                                             | Ponte de página fetch/XHR e inspetor GraphQL.                                       |
| `lists/`                                               | Repositório, nomes, GraphQL, membros, seleção rápida, fila e importação/exportação. |
| `search/`                                              | Parser, compilação, blocos, presets, validação, histórico, typeahead e âncoras.     |
| `media/`                                               | Player, previews, gestos, viewport, downloads e modo imersivo.                      |
| `tweets/`, `feeds/`, `layout/`                         | Ações dos tweets, filtros e layout.                                                 |
| `telegram/`, `sync/`, `links/`, `translation/`         | Relay, sincronização, links e tradução.                                             |
| `ui/`, `styles/`, `storage/`, `identity/`, `platform/` | Interface, CSS, persistência, identidade e seletores.                               |

## Inicialização e imports

A base antiga usava closures com funções declaradas antes da execução e muitas referências entre domínios. Apenas distribuir os blocos em módulos com efeitos no topo causaria ciclos e leituras antes da inicialização.

Os módulos exportam funções e bindings vivos. Inicializadores explícitos atribuem os valores na ordem original, controlada por `initializeNetwork`, `initializeDeck` e `initializeLists`. Os imports não instalam listeners, não interceptam requests e não tocam no DOM por conta própria. Isso preserva o scheduler e os objetos de estado compartilhados do RodX.

A próxima manutenção deve editar os módulos diretamente. Ao adicionar serviços, registre-os no bootstrap correspondente. Os nomes das funções de inicialização indicam os bindings que preparam; as etapas numéricas restantes representam efeitos do bootstrap original e têm linhas de origem registradas no manifesto de auditoria.

## Verificação da migração

`rodx-3.8.1.json` registra os hashes estruturais de 462 declarações, inicializadores e efeitos, a sequência de execução e o hash do original. Os testes verificam esses hashes sem depender de formatação. CSS extraído é comparado depois de normalizar sua formatação.

Ao alterar intencionalmente lógica funcional, atualize o baseline correspondente somente depois de revisar a mudança e os testes da funcionalidade. A verificação de migração existe para detectar perdas acidentais, não para impedir evolução do código.

Os testes funcionais cobrem captura de bodies sem consumir requests, respostas multipart, limite da captura, nomes de listas com emoji, rejeição de rótulos como “Seguidores”, refresh por ID, ranking por frequência/recência e merge idempotente. Os dois instaláveis são executados em DOM simulado, incluindo a ponte direta e o fallback por script clássico. Isso não substitui a validação visual no Safari com o X autenticado.

## Instalação e dados existentes

`rodx-studio.user.js` e `unified.user.js` preservam o nome e namespace do RodX original. São alternativas de instalação; escolha uma. A versão 3.9.0 pode atualizar a 3.8.1 mantendo a identidade do userscript e suas chaves de armazenamento. Não exclua a instalação antiga antes de atualizar.

O RodX executa em `world: "sandbox"`, com as APIs GM diretas e os `@require` originais do Video.js e RodMenu. Só a ponte de rede executa na página. O exemplo de npm continua disponível individualmente e está excluído do unificado.
