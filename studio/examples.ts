import type { RodMenuField, RodMenuSchema } from "../src/runtime/solid-ui/menu/types";

export interface StudioExample {
  id: string;
  title: string;
  category: string;
  description: string;
  fields: RodMenuField[];
}

const options = [
  { label: "Automático", value: "auto" },
  { label: "Alta qualidade", value: "high" },
  { label: "Economia", value: "low" },
];

const field = (type: RodMenuField["type"], value: unknown, extra: Record<string, unknown> = {}): RodMenuField =>
  ({ type, name: "example", label: type, value, ...extra } as RodMenuField);

export const studioExamples: StudioExample[] = [
  ...(["text", "email", "password", "search", "url", "tel"] as const).map(type => ({
    id: type, title: type, category: "Texto", description: "Entrada de texto com validação e atributos nativos.",
    fields: [field(type, type === "email" ? "rod@example.com" : type === "url" ? "https://example.com" : "Exemplo", { placeholder: "Digite um valor", required: true })],
  })),
  { id: "number", title: "Number", category: "Texto", description: "Limites mínimo, máximo e incremento.", fields: [field("number", 42, { min: 0, max: 100, step: 1 })] },
  { id: "textarea", title: "Textarea", category: "Texto", description: "Texto multilinha.", fields: [field("textarea", "Um texto de exemplo", { rows: 4, resize: "vertical" })] },
  ...(["checkbox", "switch"] as const).map(type => ({ id: type, title: type, category: "Controles", description: "Controle booleano.", fields: [field(type, true)] })),
  { id: "range", title: "Range", category: "Controles", description: "Controle deslizante.", fields: [field("range", 35, { min: 0, max: 100, step: 5, showValue: true })] },
  { id: "rating", title: "Rating", category: "Controles", description: "Avaliação por estrelas.", fields: [field("rating", 3, { max: 5, allowZero: true })] },
  ...(["select", "multiselect", "radio", "checkbox-group", "segmented", "channel-picker"] as const).map(type => ({
    id: type, title: type, category: "Seleção", description: "Escolha entre opções.", fields: [field(type, type === "multiselect" || type === "checkbox-group" ? ["auto"] : "auto", { options })],
  })),
  ...(["date", "datetime-local", "time", "month", "week"] as const).map(type => ({
    id: type, title: type, category: "Data e hora", description: "Seletor temporal nativo.", fields: [field(type, type === "date" ? "2026-11-15" : type === "time" ? "14:30" : undefined)],
  })),
  { id: "color", title: "Color", category: "Mídia", description: "Seletor de cores.", fields: [field("color", "#a78bfa", { presets: ["#a78bfa", "#38bdf8", "#fb7185"] })] },
  { id: "file", title: "File", category: "Mídia", description: "Seleção local de arquivo.", fields: [field("file", undefined, { accept: "image/*", multiple: true })] },
  { id: "media-preview", title: "Media Preview", category: "Mídia", description: "Cartão de mídia.", fields: [field("media-preview", undefined, { item: { id: "demo", title: "Exemplo de foto", type: "photo", url: "https://placehold.co/400x250/png" } })] },
  { id: "media-picker", title: "Media Picker", category: "Mídia", description: "Seleção de mídias.", fields: [field("media-picker", [], { items: [{ id: "a", title: "Foto A", type: "photo" }, { id: "b", title: "Foto B", type: "photo" }], selectAll: true })] },
  { id: "provider-status", title: "Provider Status", category: "Diagnóstico", description: "Estado dos provedores.", fields: [field("provider-status", undefined, { providers: [{ id: "api", label: "API", state: "success", durationMs: 128 }, { id: "cache", label: "Cache", state: "loading" }] })] },
  { id: "request-log", title: "Request Log", category: "Diagnóstico", description: "Log de requisições.", fields: [field("request-log", undefined, { entries: [{ method: "GET", url: "/api/items", status: 200, durationMs: 74 }] })] },
  { id: "debug-json", title: "Debug JSON", category: "Diagnóstico", description: "Visualização de JSON.", fields: [field("debug-json", undefined, { data: { ok: true, items: [1, 2, 3] }, pretty: true })] },
  { id: "html", title: "HTML", category: "Layout", description: "Conteúdo HTML estático.", fields: [field("html", undefined, { html: "<strong>Conteúdo de exemplo</strong>" })] },
  { id: "divider", title: "Divider", category: "Layout", description: "Separador visual.", fields: [field("divider", undefined)] },
  { id: "button", title: "Button", category: "Ações", description: "Botão com callback.", fields: [field("button", undefined, { text: "Executar", onPress: () => window.alert("Exemplo executado") })] },
  { id: "hidden", title: "Hidden", category: "Layout", description: "Campo oculto, demonstrado junto com um campo visível.", fields: [field("hidden", "secret"), field("text", "Campo visível", { name: "visible" })] },
  { id: "custom", title: "Custom", category: "Layout", description: "Renderização personalizada.", fields: [field("custom", undefined, { render: () => "Conteúdo customizado" })] },
];

export function schemaForExample(example: StudioExample, presentation: RodMenuSchema["presentation"], size: RodMenuSchema["size"]): RodMenuSchema {
  return {
    id: "rod-ui-studio-example", title: example.title, description: example.description, presentation, size,
    fields: example.fields,
    actions: [
      { id: "cancel", label: "Cancelar", role: "cancel" },
      { id: "save", label: "Salvar", role: "submit" },
    ],
  };
}
