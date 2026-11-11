export function buildStudioPreferences(Studio, deck) {
  const { state } = deck;
  const labels = {
    snap: "Encaixe suave ao rolar",
    compact: "Densidade compacta",
    colorfulTags: "Hashtags coloridas",
    hideSeen: "Ocultar posts vistos",
    translatePosts: "Tradução automática de posts",
    translateForeignTags: "Traduzir hashtags",
    videoMute: "Iniciar vídeos sem som",
    bestQuality: "Melhor qualidade disponível",
    swipeToCloseVideo: "Deslizar para fechar vídeo",
    seekPreviews: "Prévia ao arrastar a reprodução",
    videoPauseDim: "Escurecer o vídeo ao pausar",
  };
  const moduleLabels = {
    lists: "Listas e membros",
    profile: "Listas no perfil",
    layout: "Perfil e barra do tweet",
    media: "Player e reprodução",
    links: "Links e Telegram",
    translation: "Tradução",
    hygiene: "Limpeza da interface",
    customTimeline: "Timeline própria de listas",
  };
  const options = [
    {
      value: "media",
      label: "Imagens e vídeos",
    },
    {
      value: "video",
      label: "Só vídeos",
    },
    {
      value: "image",
      label: "Só imagens",
    },
    {
      value: "all",
      label: "Todos, incluindo texto",
    },
  ];
  const select = (name, label, value, choices) => ({
    type: "select",
    name,
    label,
    value,
    options: choices,
  });
  function field(name, label, value) {
    if (typeof value === "boolean")
      return {
        type: "switch",
        name,
        label,
        value,
      };
    if (typeof value === "number")
      return {
        type: "number",
        name,
        label,
        value,
      };
    return {
      type: "text",
      name,
      label,
      value: String(value ?? ""),
    };
  }
  function open() {
    Studio.menu.close("workspace");
    const visual = state.visual;
    const fields = Object.entries(visual)
      .filter(
        ([key, value]) => key !== "feedFilters" && ["boolean", "number", "string"].includes(typeof value),
      )
      .map(([key, value]) =>
        key === "playerMode"
          ? select("v_" + key, "Player", value, [
              {
                value: "videojs",
                label: "Video.js 10.3.0",
              },
              {
                value: "twitter",
                label: "Player do X",
              },
              {
                value: "rodx",
                label: "Controles RodX",
              },
            ])
          : field(
              "v_" + key,
              labels[key] ||
                {
                  density: "Espaçamento",
                  font: "Tamanho da fonte",
                  viewedThreshold: "Proporção para marcar como visto",
                  seenDelayMs: "Tempo para marcar visto (ms)",
                  autoPlayEnterPercent: "Iniciar com % visível",
                  autoPauseExitPercent: "Pausar após % sair",
                  previewStepSeconds: "Intervalo das prévias (s)",
                }[key] ||
                key,
              value,
            ),
      );
    const settings = Studio.services.lists?.settings || {};
    const listNames = {
      hideReposts: "Excluir reposts das listas",
      showHomeBar: "Listas no dock",
      homeAll: "Todas as listas no dock",
      media: "Mídia padrão das listas",
      replies: "Incluir respostas",
      queryText: "Termos da busca",
      sort: "Ordenação",
      minLikes: "Mínimo de curtidas",
      autoSyncApi: "Sincronizar metadados",
      queueIntervalSeconds: "Intervalo da fila (s)",
      quickAddFollow: "Seguir ao adicionar",
      quickAddDisableReposts: "Desativar reposts ao adicionar",
    };
    const listFields = Object.entries(listNames)
      .filter(([key]) => key in settings)
      .map(([key, label]) =>
        key === "media"
          ? select("l_media", label, settings.media, [
              {
                value: "media",
                label: "Imagens e vídeos",
              },
              {
                value: "videos",
                label: "Vídeos",
              },
              {
                value: "images",
                label: "Imagens",
              },
              {
                value: "all",
                label: "Todos",
              },
            ])
          : key === "sort"
            ? select("l_sort", label, settings.sort, [
                {
                  value: "live",
                  label: "Mais recentes",
                },
                {
                  value: "top",
                  label: "Principais",
                },
              ])
            : field("l_" + key, label, settings[key]),
      );
    const defaults = Studio.config.feedDefaults || {
      media: "media",
      reposts: true,
    };
    return Studio.menu.open({
      id: "rodx-preferences",
      title: "RodX · Preferências",
      description: "RodMenu · configurações centralizadas. Os filtros atuam nas próximas respostas do X.",
      presentation: "bottom-sheet",
      size: "lg",
      store: {
        persist: false,
      },
      tabs: [
        {
          id: "feed",
          label: "Feeds",
          fields: [
            select("globalMedia", "Mídia padrão de todos os feeds", defaults.media, options),
            field("globalReposts", "Incluir reposts por padrão", defaults.reposts),
            {
              type: "custom",
              name: "feedNote",
              render() {
                const p = document.createElement("p");
                p.textContent = "As escolhas específicas de cada feed prevalecem sobre o padrão global.";
                return p;
              },
            },
          ],
        },
        {
          id: "player",
          label: "Player e visual",
          fields,
        },
        {
          id: "modules",
          label: "Módulos",
          fields: [
            ...Object.entries(moduleLabels).map(([key, label]) =>
              field("m_" + key, label, Studio.config.modules[key] !== false),
            ),
            field("budgetMs", "Orçamento do agendador (ms)", Studio.config.budgetMs),
            field("scanDelayMs", "Agrupar mudanças (ms)", Studio.config.scanDelayMs),
            field("homeListLimit", "Máximo de listas no dock", Studio.config.homeListLimit),
          ],
        },
        {
          id: "lists",
          label: "Listas",
          fields: listFields,
        },
      ],
      actions: [
        {
          id: "cancel",
          label: "Fechar",
          role: "cancel",
        },
        {
          id: "apply",
          label: "Salvar",
          role: "submit",
          handler: async (ctx) => {
            const values = ctx.values,
              next = {
                ...state.visual,
              },
              modules = {
                ...Studio.config.modules,
              };
            for (const [key, value] of Object.entries(values)) {
              if (key.startsWith("v_")) next[key.slice(2)] = value;
              if (key.startsWith("m_")) modules[key.slice(2)] = value;
              if (key.startsWith("l_")) settings[key.slice(2)] = value;
            }
            state.visual = deck.normalizeVisual(next);
            Studio.configure({
              modules,
              budgetMs: Math.max(3, Math.min(12, Number(values.budgetMs) || 7)),
              scanDelayMs: Math.max(60, Math.min(500, Number(values.scanDelayMs) || 110)),
              homeListLimit: Math.max(0, Math.min(50, Number(values.homeListLimit) || 0)),
              feedDefaults: {
                media: values.globalMedia,
                reposts: values.globalReposts,
              },
            });
            if (Studio.services.lists) localStorage.setItem("xls-v1:settings", JSON.stringify(settings));
            await deck.saveState();
            deck.publish();
            Studio.invalidate("state");
            deck.toast("Preferências salvas. Mudanças de módulos exigem recarregar.");
          },
        },
        {
          id: "sync",
          label: "Sincronizar relay agora",
          validate: false,
          handler: () => Studio.services.cloud.syncNow(),
        },
        {
          id: "reload",
          label: "Recarregar o X",
          validate: false,
          handler: () => location.reload(),
        },
      ],
    });
  }
  function filters() {
    const scope = deck.scope();
    if (!scope) return open();
    const current = deck.feedSettings();
    Studio.menu.open({
      id: "rodx-feed-options",
      title: "Filtros deste feed",
      description: "Filtragem na resposta de rede. Recarregue para aplicar também aos posts já carregados.",
      store: {
        persist: false,
      },
      fields: [
        select("media", "Mídia", current.media, options),
        field("reposts", "Incluir reposts", current.reposts !== false),
        field("snap", "Encaixe ao rolar (global)", state.visual.snap === true),
      ],
      actions: [
        {
          id: "close",
          label: "Fechar",
          role: "cancel",
        },
        {
          id: "save",
          label: "Salvar",
          role: "submit",
          handler: async (ctx) => {
            state.visual.feedFilters = {
              ...state.visual.feedFilters,
              [scope]: {
                media: ctx.values.media,
                reposts: ctx.values.reposts,
              },
            };
            state.visual.snap = ctx.values.snap;
            await deck.saveState();
            deck.publish();
            Studio.invalidate("state");
          },
        },
        {
          id: "inherit",
          label: "Usar padrão global",
          close: true,
          handler: async () => {
            const filters = {
              ...state.visual.feedFilters,
            };
            delete filters[scope];
            state.visual.feedFilters = filters;
            await deck.saveState();
            deck.publish();
            Studio.invalidate("state");
          },
        },
      ],
    });
  }
  return {
    open,
    filters,
  };
}
