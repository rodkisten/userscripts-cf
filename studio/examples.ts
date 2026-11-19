import type { MenuSchema, FieldDefinition } from "../src/runtime/react-ui/types";

type RodMenuField = FieldDefinition & Record<string, unknown>;
type RodMenuSchema = MenuSchema & Record<string, any>;

export interface StudioExample {
  id: string;
  title: string;
  category: string;
  description: string;
  fields: RodMenuField[];
  configure?: (schema: RodMenuSchema) => RodMenuSchema;
}

const options = [
  { label: "Automático", value: "auto" },
  { label: "Alta qualidade", value: "high" },
  { label: "Economia", value: "low" },
];

const field = (
  type: string,
  value: unknown,
  extra: Record<string, unknown> = {},
): RodMenuField => ({ type, name: "example", label: type, value, ...extra }) as RodMenuField;

export const studioExamples: StudioExample[] = [
  ...(["text", "email", "password", "search", "url", "tel"] as const).map((type) => ({
    id: type,
    title: type,
    category: "Texto",
    description: "Entrada de texto com validação e atributos nativos.",
    fields: [
      field(type, type === "email" ? "rod@example.com" : type === "url" ? "https://example.com" : "Exemplo", {
        placeholder: "Digite um valor",
        required: true,
      }),
    ],
  })),
  {
    id: "number",
    title: "Number",
    category: "Texto",
    description: "Limites mínimo, máximo e incremento.",
    fields: [field("number", 42, { min: 0, max: 100, step: 1 })],
  },
  {
    id: "textarea",
    title: "Textarea",
    category: "Texto",
    description: "Texto multilinha.",
    fields: [field("textarea", "Um texto de exemplo", { rows: 4, resize: "vertical" })],
  },
  ...(["checkbox", "switch"] as const).map((type) => ({
    id: type,
    title: type,
    category: "Controles",
    description: "Controle booleano.",
    fields: [field(type, true)],
  })),
  {
    id: "range",
    title: "Range",
    category: "Controles",
    description: "Controle deslizante.",
    fields: [field("range", 35, { min: 0, max: 100, step: 5, showValue: true })],
  },
  {
    id: "rating",
    title: "Rating",
    category: "Controles",
    description: "Avaliação por estrelas.",
    fields: [field("rating", 3, { max: 5, allowZero: true })],
  },
  ...(["select", "multiselect", "radio", "checkbox-group", "segmented", "channel-picker"] as const).map(
    (type) => ({
      id: type,
      title: type,
      category: "Seleção",
      description: "Escolha entre opções.",
      fields: [
        field(type, type === "multiselect" || type === "checkbox-group" ? ["auto"] : "auto", { options }),
      ],
    }),
  ),
  ...(["date", "datetime-local", "time", "month", "week"] as const).map((type) => ({
    id: type,
    title: type,
    category: "Data e hora",
    description: "Seletor temporal nativo.",
    fields: [field(type, type === "date" ? "2026-11-15" : type === "time" ? "14:30" : undefined)],
  })),
  {
    id: "color",
    title: "Color",
    category: "Mídia",
    description: "Seletor de cores.",
    fields: [field("color", "#a78bfa", { presets: ["#a78bfa", "#38bdf8", "#fb7185"] })],
  },
  {
    id: "file",
    title: "File",
    category: "Mídia",
    description: "Seleção local de arquivo.",
    fields: [field("file", undefined, { accept: "image/*", multiple: true })],
  },
  {
    id: "media-preview",
    title: "Media Preview",
    category: "Mídia",
    description: "Cartão de mídia.",
    fields: [
      field("media-preview", undefined, {
        item: {
          id: "demo",
          title: "Exemplo de foto",
          type: "photo",
          url: "https://placehold.co/400x250/png",
        },
      }),
    ],
  },
  {
    id: "media-picker",
    title: "Media Picker",
    category: "Mídia",
    description: "Seleção de mídias.",
    fields: [
      field("media-picker", [], {
        items: [
          { id: "a", title: "Foto A", type: "photo" },
          { id: "b", title: "Foto B", type: "photo" },
        ],
        selectAll: true,
      }),
    ],
  },
  {
    id: "provider-status",
    title: "Provider Status",
    category: "Diagnóstico",
    description: "Estado dos provedores.",
    fields: [
      field("provider-status", undefined, {
        providers: [
          { id: "api", label: "API", state: "success", durationMs: 128 },
          { id: "cache", label: "Cache", state: "loading" },
        ],
      }),
    ],
  },
  {
    id: "request-log",
    title: "Request Log",
    category: "Diagnóstico",
    description: "Log de requisições.",
    fields: [
      field("request-log", undefined, {
        entries: [{ method: "GET", url: "/api/items", status: 200, durationMs: 74 }],
      }),
    ],
  },
  {
    id: "debug-json",
    title: "Debug JSON",
    category: "Diagnóstico",
    description: "Visualização de JSON.",
    fields: [field("debug-json", undefined, { data: { ok: true, items: [1, 2, 3] }, pretty: true })],
  },
  {
    id: "html",
    title: "HTML",
    category: "Layout",
    description: "Conteúdo HTML estático.",
    fields: [field("html", undefined, { html: "<strong>Conteúdo de exemplo</strong>" })],
  },
  {
    id: "divider",
    title: "Divider",
    category: "Layout",
    description: "Separador visual.",
    fields: [field("divider", undefined)],
  },
  {
    id: "button",
    title: "Button",
    category: "Ações",
    description: "Botão com callback.",
    fields: [
      field("button", undefined, { text: "Executar", onPress: () => window.alert("Exemplo executado") }),
    ],
  },
  {
    id: "hidden",
    title: "Hidden",
    category: "Layout",
    description: "Campo oculto, demonstrado junto com um campo visível.",
    fields: [field("hidden", "secret"), field("text", "Campo visível", { name: "visible" })],
  },
  {
    id: "custom",
    title: "Custom",
    category: "Layout",
    description: "Renderização personalizada.",
    fields: [field("custom", undefined, { render: () => "Conteúdo customizado" })],
  },
  {
    id: "tabs",
    title: "Abas dinâmicas",
    category: "Avançado",
    description: "Abas com campos independentes e seleção inicial.",
    fields: [],
    configure: (schema) => ({
      ...schema,
      tabs: [
        {
          id: "general",
          label: "Geral",
          fields: [field("text", "Rod UI", { name: "project", label: "Projeto" })],
        },
        {
          id: "settings",
          label: "Configurações",
          fields: [field("switch", true, { name: "enabled", label: "Habilitado" })],
        },
      ],
      initialTab: "general",
    }),
  },
  {
    id: "sections",
    title: "Seções recolhíveis",
    category: "Avançado",
    description: "Grupos de campos com estado inicial expandido e recolhido.",
    fields: [],
    configure: (schema) => ({
      ...schema,
      sections: [
        {
          id: "profile",
          title: "Perfil",
          collapsible: true,
          fields: [field("text", "Rodolfo", { name: "name", label: "Nome" })],
        },
        {
          id: "preferences",
          title: "Preferências",
          collapsible: true,
          collapsed: true,
          fields: [field("switch", true, { name: "notifications", label: "Notificações" })],
        },
      ],
    }),
  },
  {
    id: "validation",
    title: "Validação assíncrona",
    category: "Avançado",
    description: "Validação por campo e validação geral, sem chamadas de rede.",
    fields: [
      field("text", "", {
        name: "username",
        label: "Usuário",
        required: true,
        validate: async (value: unknown) =>
          String(value ?? "").trim().length < 3 ? "Use pelo menos três caracteres" : null,
      }),
    ],
    configure: (schema) => ({
      ...schema,
      validate: async (values) =>
        String(values.username ?? "").toLowerCase() === "admin" ? { username: "Nome reservado" } : null,
    }),
  },
  {
    id: "conditional",
    title: "Campos condicionais",
    category: "Avançado",
    description: "Visibilidade e desabilitação reativas aos valores do formulário.",
    fields: [
      field("switch", false, { name: "advanced", label: "Habilitar modo avançado" }),
      field("text", "Valor secreto", {
        name: "secret",
        label: "Configuração avançada",
        visibleWhen: (values: Record<string, unknown>) => !!values.advanced,
      }),
      field("number", 3, {
        name: "retries",
        label: "Tentativas",
        disabledWhen: (values: Record<string, unknown>) => !values.advanced,
      }),
    ],
  },
  {
    id: "persistence",
    title: "Persistência local",
    category: "Avançado",
    description: "Restaura valores da sessão e salva alterações com debounce.",
    fields: [field("text", "Preferência salva", { name: "preference", label: "Preferência" })],
    configure: (schema) => ({
      ...schema,
      store: {
        persist: {
          key: "rod-ui-studio-demo",
          storage: "local",
          hydrate: true,
          debounceMs: 350,
          persistOn: ["change", "submit"],
        },
      },
    }),
  },
  {
    id: "gestures",
    title: "Gestos mobile",
    category: "Avançado",
    description: "Bottom sheet arrastável, fechamento por swipe e ajustes de teclado.",
    fields: [field("textarea", "Teste arrastar o menu", { name: "note", label: "Nota", rows: 5 })],
    configure: (schema) => ({
      ...schema,
      presentation: "bottom-sheet",
      draggable: true,
      swipeToDismiss: true,
      showHandle: true,
      gestures: { preventPullToRefresh: true, dismissThresholdPx: 110, dragFromContent: false },
      keyboard: { autoFocus: "never", visualViewport: true, keepFocusedFieldVisible: true },
    }),
  },
  {
    id: "stack",
    title: "Empilhamento",
    category: "Avançado",
    description: "Múltiplas superfícies com controle de profundidade e backdrop.",
    fields: [field("text", "Menu empilhado", { name: "layer", label: "Camada" })],
    configure: (schema) => ({
      ...schema,
      id: `rod-ui-stack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      stack: { enabled: true, maxVisible: 3, offsetPx: 14, scaleStep: 0.04, backdropClick: "previous" },
    }),
  },
  {
    id: "focus",
    title: "Foco e acessibilidade",
    category: "Avançado",
    description: "Focus trap, Escape, restauração de foco e entrada por teclado.",
    fields: [field("text", "", { name: "query", label: "Busca", autoFocus: true })],
    configure: (schema) => ({
      ...schema,
      trapFocus: true,
      restoreFocus: true,
      closeOnEscape: true,
      keyboard: { autoFocus: "explicit", preserveFocusOnHydrate: true, focusScrollPaddingPx: 20 },
    }),
  },
  {
    id: "theme",
    title: "Tema por instância",
    category: "Avançado",
    description: "Tokens de tema aplicados somente ao menu aberto.",
    fields: [field("color", "#fb7185", { name: "accent", label: "Cor" })],
    configure: (schema) => ({
      ...schema,
      theme: { "--rod-menu-accent": "#fb7185", "--rod-menu-radius": "22px" },
    }),
  },
  {
    id: "drawer",
    title: "Drawer lateral",
    category: "Avançado",
    description: "Drawer à direita com tamanho XL e fechamento por backdrop.",
    fields: [field("textarea", "Conteúdo lateral", { name: "notes", label: "Notas" })],
    configure: (schema) => ({
      ...schema,
      presentation: "drawer",
      drawerSide: "right",
      size: "xl",
      closeOnBackdrop: true,
    }),
  },
  {
    id: "popover",
    title: "Popover ancorado",
    category: "Avançado",
    description: "Ancoragem no botão de abertura, alinhamento e deslocamento.",
    fields: [field("select", "auto", { name: "quality", label: "Qualidade", options })],
    configure: (schema) => ({
      ...schema,
      presentation: "popover",
      anchor: () => (document.activeElement instanceof Element ? document.activeElement : document.body),
      anchorAlign: "end",
      anchorOffset: 10,
    }),
  },
  {
    id: "async-action",
    title: "Ação assíncrona",
    category: "Avançado",
    description: "Simula salvamento assíncrono com indicador de carregamento.",
    fields: [field("text", "Exemplo", { name: "name", label: "Nome" })],
    configure: (schema) => ({
      ...schema,
      actions: [
        { id: "cancel", label: "Cancelar", role: "cancel" },
        {
          id: "save",
          label: "Salvar (700 ms)",
          role: "submit",
          handler: async () => {
            await new Promise((resolve) => setTimeout(resolve, 700));
          },
        },
      ],
    }),
  },
];

export function schemaForExample(
  example: StudioExample,
  presentation: RodMenuSchema["presentation"],
  size: RodMenuSchema["size"],
): RodMenuSchema {
  const schema: RodMenuSchema = {
    id: "rod-ui-studio-example",
    title: example.title,
    description: example.description,
    presentation,
    size,
    fields: example.fields,
    actions: [
      { id: "cancel", label: "Cancelar", role: "cancel" },
      { id: "save", label: "Salvar", role: "submit" },
    ],
  };
  return example.configure?.(schema) ?? schema;
}
