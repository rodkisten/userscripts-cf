export let VERSION;

export function initializeDeckVERSION() {
  VERSION = "3.1.0";
}

export let PREFIX;

export function initializeDeckPREFIX() {
  PREFIX = "rodx:search-deck:v1:";
}

export let IDENT;

export function initializeDeckIDENT() {
  IDENT = "rodx-search-deck";
}

export let MAX_VISIBLE;

export function initializeDeckMAX_VISIBLE() {
  MAX_VISIBLE = 100000;
}

export let EMPTY_FIELDS;

export function initializeDeckEMPTY_FIELDS() {
  EMPTY_FIELDS = Object.freeze({
    all: "",
    exact: "",
    any: "",
    none: "",
    hashtags: "",
    cashtags: "",
    lang: "",
    from: "",
    to: "",
    mentions: "",
    listId: "",
    following: "any",
    verified: "any",
    since: "",
    until: "",
    withinTime: "",
    sinceTime: "",
    untilTime: "",
    minLikes: "",
    maxLikes: "",
    minReposts: "",
    maxReposts: "",
    minReplies: "",
    maxReplies: "",
    media: "any",
    replies: "any",
    reposts: "any",
    quotes: "any",
    links: "any",
    hashtagFilter: "any",
    mentionFilter: "any",
    safe: "any",
    postType: "any",
    hasEngagement: "any",
    urlDomain: "",
    placeId: "",
    conversationId: "",
    replyToId: "",
    quoteId: "",
    quotedUserId: "",
    sinceId: "",
    maxId: "",
    extra: "",
  });
}

export let LANGUAGE_OPTIONS;

export function initializeDeckLANGUAGE_OPTIONS() {
  LANGUAGE_OPTIONS = [
    ["", "Todos os idiomas"],
    ["pt", "Português"],
    ["en", "Inglês"],
    ["es", "Espanhol"],
    ["fr", "Francês"],
    ["de", "Alemão"],
    ["it", "Italiano"],
    ["ja", "Japonês"],
    ["ko", "Coreano"],
    ["zh", "Chinês"],
    ["ar", "Árabe"],
    ["hi", "Hindi"],
    ["ru", "Russo"],
    ["tr", "Turco"],
    ["id", "Indonésio"],
    ["nl", "Holandês"],
  ];
}

export let ANY_ONLY_EXCLUDE;

export function initializeDeckANY_ONLY_EXCLUDE() {
  ANY_ONLY_EXCLUDE = [
    ["any", "Não filtrar"],
    ["only", "Somente"],
    ["exclude", "Excluir"],
  ];
}

export let BLOCK_MEDIA;

export function initializeDeckBLOCK_MEDIA() {
  BLOCK_MEDIA = [
    ["media", "🖼️ Qualquer mídia"],
    ["images", "📷 Imagens"],
    ["twimg", "🖼️ Imagens do X"],
    ["videos", "🎬 Vídeos"],
    ["native_video", "📹 Vídeos nativos do X"],
  ];
}

export let BLOCK_TYPES;

export function initializeDeckBLOCK_TYPES() {
  BLOCK_TYPES = [
    ["hashtag", "＃ Hashtag"],
    ["keyword", "⌕ Palavra-chave"],
    ["phrase", "“” Frase exata"],
    ["media", "▣ Tipo de mídia"],
    ["author", "@ Autor"],
    ["raw", "{} Operador livre"],
  ];
}

export let MAX_BLOCK_NODES;

export function initializeDeckMAX_BLOCK_NODES() {
  MAX_BLOCK_NODES = 240;
}

export let MAX_BLOCK_DEPTH;

export function initializeDeckMAX_BLOCK_DEPTH() {
  MAX_BLOCK_DEPTH = 9;
}

export let SORTS;

export function initializeDeckSORTS() {
  SORTS = [
    ["live", "Recentes"],
    ["top", "Destaques"],
    ["image", "Fotos"],
    ["video", "Vídeos"],
    ["user", "Pessoas"],
  ];
}

export let GROUPS;

export function initializeDeckGROUPS() {
  GROUPS = [
    {
      id: "words",
      title: "Palavras e idioma",
      icon: "⌕",
      fields: [
        ["all", "Todas estas palavras", "text", "react next typescript"],
        ["exact", "Frase exata", "text", "engenharia de software"],
        ["any", "Qualquer uma (OR)", "text", "react vue angular"],
        ["none", "Excluir palavras/frases", "text", 'vaga estágio "curso pago"'],
        ["cashtags", "Cashtags", "text", "PETR4 AAPL"],
        ["lang", "Idioma", "select", LANGUAGE_OPTIONS],
      ],
    },
    {
      id: "people",
      title: "Contas e origem",
      icon: "@",
      fields: [
        ["from", "Publicado por (@)", "text", "verge, techcrunch"],
        ["to", "Respondendo a (@)", "text", "github"],
        ["mentions", "Mencionando (@)", "text", "openai, google"],
        ["listId", "Lista pública (ID)", "text", "1234567890123456789"],
        [
          "following",
          "Contas que sigo",
          "select",
          [
            ["any", "Qualquer conta"],
            ["only", "Apenas contas que sigo (experimental)"],
          ],
        ],
        [
          "verified",
          "Contas verificadas",
          "select",
          [
            ["any", "Não filtrar"],
            ["verified", "Verificadas"],
            ["blue", "Selo azul"],
            ["exclude", "Excluir verificadas"],
          ],
        ],
      ],
    },
    {
      id: "dates",
      title: "Datas e período",
      icon: "◷",
      fields: [
        ["since", "Data inicial (inclusive)", "date", ""],
        ["until", "Data final (inclusive)", "date", ""],
        ["withinTime", "Último período (opcional)", "text", "2d, 12h ou 1w"],
        ["sinceTime", "Desde timestamp Unix (segundos)", "text", "1767225600"],
        ["untilTime", "Até timestamp Unix (segundos)", "text", "1767225600"],
      ],
    },
    {
      id: "engagement",
      title: "Engajamento",
      icon: "♡",
      fields: [
        ["minLikes", "Curtidas mínimas", "number", "100"],
        ["maxLikes", "Curtidas máximas", "number", "10000"],
        ["minReposts", "Reposts mínimos", "number", "10"],
        ["maxReposts", "Reposts máximos", "number", "1000"],
        ["minReplies", "Respostas mínimas", "number", "5"],
        ["maxReplies", "Respostas máximas", "number", "500"],
      ],
    },
    {
      id: "content",
      title: "Tipos de publicação e conteúdo",
      icon: "▣",
      fields: [
        ["replies", "Respostas", "select", ANY_ONLY_EXCLUDE],
        [
          "reposts",
          "Reposts",
          "select",
          [
            ["any", "Padrão do X"],
            ["only", "Somente reposts"],
            ["exclude", "Excluir reposts"],
            ["include", "Incluir reposts"],
          ],
        ],
        ["quotes", "Posts com citação", "select", ANY_ONLY_EXCLUDE],
        ["links", "Links", "select", ANY_ONLY_EXCLUDE],
        ["hashtagFilter", "Posts com hashtags", "select", ANY_ONLY_EXCLUDE],
        ["mentionFilter", "Posts com menções", "select", ANY_ONLY_EXCLUDE],
        [
          "safe",
          "Conteúdo sensível",
          "select",
          [
            ["any", "Não filtrar"],
            ["only", "Somente resultados não sinalizados"],
          ],
        ],
        [
          "hasEngagement",
          "Qualquer engajamento",
          "select",
          [
            ["any", "Não filtrar"],
            ["only", "Com curtida, resposta ou repost"],
          ],
        ],
        [
          "postType",
          "Outros tipos",
          "select",
          [
            ["any", "Qualquer publicação"],
            ["self_threads", "Threads do autor"],
            ["spaces", "Links para Spaces"],
          ],
        ],
      ],
    },
    {
      id: "expert",
      title: "Filtros técnicos e operadores livres",
      icon: "{}",
      fields: [
        ["urlDomain", "URL/domínio mencionado", "text", "github.com"],
        ["placeId", "ID de lugar do X", "text", "96683cc9126741d1"],
        ["conversationId", "ID da conversa", "text", "2109320622882873464"],
        ["replyToId", "ID do post respondido", "text", "2109320622882873464"],
        ["quoteId", "ID do post citado", "text", "2109320622882873464"],
        ["quotedUserId", "ID da conta citada", "text", "11348282"],
        ["sinceId", "Posts depois deste ID", "text", "2109320622882873464"],
        ["maxId", "Posts até este ID", "text", "2109320622882873464"],
        [
          "extra",
          "Query livre / outros operadores",
          "textarea",
          "(from:NASA OR from:SpaceX) -filter:replies",
        ],
      ],
    },
  ];
}
