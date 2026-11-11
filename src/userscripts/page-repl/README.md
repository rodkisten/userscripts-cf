# Page REPL

Userscript independente para diagnosticar e executar JavaScript no navegador, disponível como `page-repl.user.js`. Não é incluído no RodX unificado. Funciona em páginas HTTP/HTTPS nas quais o gerenciador permite userscripts; páginas internas e lojas de extensões podem ser restritas pelo navegador.

## Uso

Abra o botão **>_**, escreva código e clique em **Executar**. Também pode abrir pelo menu do Tampermonkey. Ctrl/Cmd+Enter executa; Ctrl+Espaço ou **Completar** sugere nomes; Alt+↑/↓ navega pelo histórico. O botão flutuante pode ser arrastado. A altura do painel acompanha o viewport e o teclado móvel.

- Aceita `await` e retorna a última expressão.
- `console.log/info/warn/error/table/dir/trace/assert/clear` são capturados durante a execução aguardada.
- `_` contém o último resultado do contexto; `$` e `$$` buscam no DOM; `$0` é o elemento focado no início da execução.
- `ctx.vars` mantém valores no contexto. Com persistência ligada, declarações de topo e suas referências são transformadas em propriedades mutáveis, **inclusive const**. Isso é semântica de sessão do REPL, não preservação integral das regras de const/TDZ de um script normal.
- Variáveis locais de funções mantêm escopo lexical. Funções, closures, classes, destructuring e loops são aceitos. Imports estáticos não são aceitos no corpo de execução; use `await import(url)`, sujeito às regras do navegador.
- Desligue **Persistir variáveis** para executar sem transformação das declarações. Sessões de contextos distintos podem ter estado distinto.
- Histórico/código ficam no storage GM, separados por origem. Nada executa automaticamente ao abrir ou ao carregar o histórico.

## Script global

Ative **Script global (sem wrapper)** para inserir o código no nível superior, sem transformar declarações nem envolvê-lo em função async. Isso preserva a semântica nativa do método escolhido: scripts clássicos e módulos continuam tendo escopos diferentes. Não oferece ctx, _, $, $$, retorno da última expressão ou captura de console. A confirmação indica apenas que o trecho síncrono final foi alcançado; não aguarda trabalho assíncrono arbitrário. Imports estáticos só funcionam em métodos de módulo.

## Editor

A interface inteira é construída em TSX com Solid 2.0.0-rc.21 e estado reativo para resultados, métodos e histórico. CodeMirror 6 fornece números de linha, destaque JavaScript, quebra automática de linhas, indentação, pares de delimitadores, undo/redo e diagnósticos de sintaxe no texto. **Selecionar tudo**, **Copiar**, **Colar** e **Validar** também funcionam por botões; copiar usa a seleção ou o documento inteiro. Quando o Safari não permite ler o clipboard, o botão instrui a usar o menu nativo de colagem.

Autocomplete combina escopo lexical do editor, nomes persistidos no REPL e propriedades expostas na página via unsafeWindow, incluindo caminhos de propriedades de dados. Não avalia expressões nem chama getters arbitrários. Variáveis privadas de closures e módulos, propriedades acessoras de aplicação e objetos de outras origens podem não estar disponíveis. A validação é sintática, não uma análise de tipos ou garantia de execução. Validação automática aguarda 350 ms; todos os listeners e o editor são descartados ao encerrar.

Solid, CodeMirror e suas dependências são incorporados ao IIFE no build Cloudflare, sem imports remotos durante a abertura. Os templates estáticos do Solid são convertidos em factories DOM no build para preservar montagem em páginas com Trusted Types.

## Estratégias

27 métodos: eval direto/indireto no sandbox, Function, unsafeWindow eval/Function/string timer, wrappedJSObject, execScript legado, script por textContent/text/text node/innerHTML, nonce observado, Trusted Types, GM_addElement e GM.addElement, scripts clássicos e módulos por Blob/data URL, módulo inline/nonce, import(Blob)/import(data), import no realm de unsafeWindow, onclick e javascript: opcional.

O modo automático usa uma sonda inofensiva e escolhe um método de página confirmado antes de executar o código **uma vez**. Não repete automaticamente código de usuário depois de erro/timeout, pois efeitos podem já ter ocorrido. **Executar em todos** repete o código em cada método habilitado; use conscientemente quando quiser comparar esses efeitos.

O relatório registra retorno, erro, duração, evidências do contexto, transporte e violações de CSP observadas. OK comprova retorno, não equivalência universal entre realms. Timeout significa ausência de confirmação e pode indicar bloqueio, demora ou falha no transporte. GM global e window/document.defaultView são evidências, não prova independente de MAIN_WORLD. Um userscript não pode trocar seu próprio @sandbox depois da instalação nem obter APIs de extensão chrome.scripting/userScripts só por solicitá-las.

## URLs, recursos e limites

**URL → editor** baixa JavaScript por GM, sem executá-lo. **Script src** carrega a URL diretamente como script clássico ou módulo: o evento load é registrado, mas resultados/efeitos de código remoto não instrumentado não são confirmados. O servidor remoto pode exigir CORS para módulos. Não envia código ao servidor para contornar CSP.

Parar/timeout interrompem a espera do REPL. Não encerram loops síncronos, não revogam privilégios e não desfazem efeitos na página. Recarregue a página se seu código a bloquear. Métodos legados ou indisponíveis são classificados explicitamente; não existe uma lista finita que cubra todos os mecanismos presentes e futuros de todos os navegadores.

A interface usa DOM APIs em vez de innerHTML para poder abrir em páginas com Trusted Types. Estilos usam stylesheet construída com fallback para style/nonce. Os resultados são limitados em tamanho/profundidade e o painel mantém até 150 registros; o objeto original permanece na sessão. As sondas restauram/removem seus próprios scripts, listeners, URLs Blob e atributos de transporte. Efeitos do código do usuário continuam sendo responsabilidade desse código.

## Testes

Há testes de transformação/persistência/closures, shadowing, destructuring, hoisting, loops, await/console, transporte sem duplicação, timeout/cancelamento com imports pendentes e inicialização do instalável completo em DOM simulado. A tentativa de lançar Chromium neste executor foi bloqueada por restrição de socket do ambiente; CSP e isolamento real ainda devem ser medidos no navegador onde o userscript será instalado.
