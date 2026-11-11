# Instagram salvos → XTelegram

Userscript independente `instagram-saved`, sem painel e fora do unificado. Configure token e IDs dos canais no menu do gerenciador de userscripts. Abre uma varredura ao visitar o Instagram autenticado e repete a cada cinco minutos enquanto a página estiver visível. O Safari pode suspender a aba: não executa dentro do app nativo nem com o navegador fechado.

Busca via fetch autenticado na mesma origem: `/api/v1/feed/saved/posts/?count=50&max_id=...`. A rota e paginação foram verificadas no método `InstagramRestAPI.user_saved` do [gallery-dl](https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/instagram.py), não em uma sessão Instagram autenticada. Não depende de posts renderizados no DOM. Seleciona `product_type=clips`, maior resolução em `video_versions`, legenda original, autoria, permalink e variantes. Não envia cookies Instagram ao Relay.

O Relay atual já suporta `/batch`, itens diretos, legendas individuais, `provider + mediaId`, `force:false`, dedupe D1 e confirmação por canal; não exige alteração do servidor. Lotes de cinco, concorrência um, pausas proporcionais, quatro tentativas em 429/5xx e respeito a Retry-After. Erro de autenticação ou resposta inesperada interrompe a execução. Timeout de envio permanece incerto e não vira sucesso local.

Deduplicação local por conta Instagram, shortcode e conjunto de canais. Web Locks impede execuções simultâneas entre abas da mesma origem; sem Web Locks a sincronização para. O histórico só registra itens cobertos por entregas confirmadas ou `already_sent` em todos os canais pedidos. O Relay continua sendo a proteção entre dispositivos, mudanças de CDN e perda de storage. Não é possível prometer exactly-once no Telegram em falhas entre envio e persistência do servidor.

Um toast ao concluir com novos envios: “X mídias enviadas”. Sem toast quando não há novidades. Erros ficam acessíveis por ação explícita no menu “Diagnóstico”. Configuração inicial pelo menu, sem credenciais embutidas. Requer gerenciador com GM_xmlhttpRequest, GM storage e comandos de menu.

Validação local: `node --test tests/instagram-saved.test.js`. Falta validação autenticada Instagram/Telegram e build completo Vite neste ambiente. URLs CDN expiram e dependem de acesso pelo servidor Relay; falhas não são marcadas como entregues.
