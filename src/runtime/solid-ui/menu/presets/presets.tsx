import { createSignal, For, Show } from "solid-js";
import type {
  ActionVariant,
  AnyRecord,
  Awaitable,
  OptionItem,
  Presentation,
  RodMenuAction,
  RodMenuContext,
  RodMenuField,
  RodMenuHandle,
  RodMenuMediaItem,
  RodMenuProviderItem,
  RodMenuRequestEntry,
  RodMenuResult,
  RodMenuSchema,
  RodMenuStoreConfig,
  RodMenuTab,
  SurfaceSize,
} from "../types";
import { spawnSurface } from "../components/RodMenuProvider";
import fieldStyles from "../styles/Fields.module.css";
import surfaceStyles from "../styles/Surface.module.css";

export interface RodMenuMediaPresetOptions<TValues extends AnyRecord = AnyRecord> {
  title?: string;
  description?: string;
  media: readonly RodMenuMediaItem[];
  source?: RodMenuMediaItem;
  channels?: readonly OptionItem[];
  initialValues?: Partial<TValues>;
  store?: RodMenuStoreConfig<TValues>;
  presentation?: Presentation;
  anchor?: RodMenuSchema<TValues>["anchor"];
  extraFields?: readonly RodMenuField[];
  actions?: readonly RodMenuAction[];
}

export interface RodMenuDebugPresetOptions {
  title?: string;
  description?: string;
  summary?: unknown;
  media?: readonly RodMenuMediaItem[];
  providers?: readonly RodMenuProviderItem[];
  requests?: readonly RodMenuRequestEntry[];
  relay?: unknown;
  logs?: unknown;
  presentation?: Presentation;
}

export interface RodMenuHistoryPresetOptions<T = unknown> {
  title?: string;
  description?: string;
  items: readonly T[];
  presentation?: Presentation;
  renderItem?: (item: T, index: number, context: RodMenuContext<any>) => any;
}

export interface RodMenuSavedSyncSnapshot {
  title?: string;
  description?: string;
  total: number;
  visible?: number;
  sent: number;
  unknown?: number;
  selected: number;
  pending: number;
  syncing?: boolean;
}

export interface RodMenuSavedSyncCommand {
  id: string;
  label: string | ((snapshot: RodMenuSavedSyncSnapshot) => string);
  variant?: ActionVariant;
  disabled?: boolean | ((snapshot: RodMenuSavedSyncSnapshot) => boolean);
  run: (context: { snapshot: RodMenuSavedSyncSnapshot; refresh: () => void }) => Awaitable<void>;
}

export interface RodMenuSavedSyncOptions {
  title?: string;
  description?: string;
  presentation?: Presentation;
  size?: SurfaceSize;
  getSnapshot: () => RodMenuSavedSyncSnapshot;
  commands: readonly RodMenuSavedSyncCommand[];
  onClose?: (result: RodMenuResult) => void;
}

export const presets = {
  media<TValues extends AnyRecord = AnyRecord>(
    options: RodMenuMediaPresetOptions<TValues>,
  ): RodMenuHandle<TValues> {
    const fields: RodMenuField[] = [];
    if (options.source) {
      fields.push({ type: "media-preview", name: "sourcePreview", item: options.source, showSource: true });
    }
    fields.push({
      type: "media-picker",
      name: "selectedMedia",
      label: options.media.length === 1 ? "Mídia" : "Mídias",
      items: options.media,
      value: options.media.filter((item) => !item.disabled).map((item) => item.id),
      selectAll: options.media.length > 1,
      minSelected: 1,
    });
    if (options.channels?.length) {
      fields.push({
        type: "channel-picker",
        name: "channel",
        label: "Canal",
        options: options.channels,
        searchable: options.channels.length > 8,
      });
    }
    if (options.extraFields?.length) fields.push(...options.extraFields);

    const actions: readonly RodMenuAction[] = options.actions || [
      { id: "cancel", label: "Cancelar", role: "cancel", variant: "ghost" },
      {
        id: "run",
        label: "Executar",
        role: "submit",
        variant: "primary",
        badge: (ctx) => {
          const sel = ctx.get<unknown[]>("selectedMedia");
          return Array.isArray(sel) && sel.length > 1 ? sel.length : null;
        },
        disabledWhen: (vals) => !Array.isArray(vals.selectedMedia) || vals.selectedMedia.length === 0,
      },
    ];

    return spawnSurface<TValues>({
      title: options.title || "Mídia detectada",
      description: options.description || "Escolha o que fazer com a mídia encontrada.",
      presentation: options.presentation || "auto",
      anchor: options.anchor,
      fields,
      actions,
      initialValues: options.initialValues,
      store: options.store,
    });
  },

  settings<TValues extends AnyRecord = AnyRecord>(schema: RodMenuSchema<TValues>): RodMenuHandle<TValues> {
    return spawnSurface<TValues>({
      ...schema,
      title: schema.title || "Configurações",
      store: schema.store || {
        persist: { key: `rod-menu:settings:${schema.id || "default"}`, storage: "local" },
      },
      actions: schema.actions || [
        {
          id: "reset",
          label: "Restaurar",
          role: "custom",
          variant: "ghost",
          close: false,
          handler: (ctx) => ctx.reset(),
        },
        { id: "done", label: "Concluir", role: "submit", variant: "primary" },
      ],
    });
  },

  history<T = unknown>(options: RodMenuHistoryPresetOptions<T>): RodMenuHandle {
    return spawnSurface({
      title: options.title || "Histórico",
      description: options.description,
      presentation: options.presentation || "bottom-sheet",
      fields: [
        {
          type: "custom",
          name: "history",
          render: (ctx) => (
            <div class={fieldStyles.historyList}>
              <For each={options.items}>
                {(item, idx) => (
                  <div class={fieldStyles.historyItem}>
                    {options.renderItem
                      ? options.renderItem(item, idx(), ctx)
                      : typeof item === "string"
                        ? item
                        : JSON.stringify(item)}
                  </div>
                )}
              </For>
            </div>
          ),
        },
      ],
      actions: [{ id: "close", label: "Fechar", role: "cancel", variant: "secondary" }],
    });
  },

  savedSync(options: RodMenuSavedSyncOptions) {
    const [tick, setTick] = createSignal(0);
    const refresh = () => setTick((t) => t + 1);

    const handle = spawnSurface({
      title: options.title || "Saved / Bookmarks",
      description: options.description || "Selecione, confira e sincronize suas mídias.",
      presentation: options.presentation || "bottom-sheet",
      size: options.size || "md",
      store: { persist: false },
      fields: [
        {
          type: "custom",
          name: "savedSync",
          chrome: "bare",
          render: () => {
            const snap = () => {
              tick();
              return options.getSnapshot();
            };

            const stats = [
              ["pending", "Pendentes"],
              ["selected", "Selecionados"],
              ["sent", "Enviados"],
              ["unknown", "Sem check"],
              ["visible", "Na tela"],
              ["total", "Vistos"],
            ] as const;

            return (
              <div class={fieldStyles.savedSync}>
                <div class={fieldStyles.savedSyncSummary}>
                  <Show when={snap().title && snap().title !== options.title}>
                    <strong>{snap().title}</strong>
                  </Show>
                  <small>{snap().description || options.description}</small>
                </div>

                <div class={fieldStyles.savedSyncStats}>
                  <For each={stats}>
                    {([key, label]) => (
                      <div class={fieldStyles.savedSyncStat}>
                        <b>{Number(snap()[key] ?? 0)}</b>
                        <span>{label}</span>
                      </div>
                    )}
                  </For>
                </div>

                <div class={fieldStyles.savedSyncCommands}>
                  <For each={options.commands}>
                    {(cmd) => {
                      const [busy, setBusy] = createSignal(false);
                      const disabled = () =>
                        busy() ||
                        Boolean(snap().syncing) ||
                        (typeof cmd.disabled === "function" ? cmd.disabled(snap()) : Boolean(cmd.disabled));

                      return (
                        <button
                          type="button"
                          class={`${fieldStyles.fieldButton} ${surfaceStyles.action}`}
                          data-variant={cmd.variant || "secondary"}
                          disabled={disabled()}
                          onClick={async () => {
                            if (disabled()) return;
                            setBusy(true);
                            try {
                              await cmd.run({ snapshot: snap(), refresh });
                            } finally {
                              setBusy(false);
                              refresh();
                            }
                          }}
                        >
                          {typeof cmd.label === "function" ? cmd.label(snap()) : cmd.label}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            );
          },
        },
      ],
      actions: [{ id: "close", label: "Fechar", role: "cancel", variant: "secondary" }],
      onClose: options.onClose,
    });

    return Object.assign(handle, { refresh });
  },

  debug(options: RodMenuDebugPresetOptions): RodMenuHandle {
    const tabs: RodMenuTab[] = [];
    if (options.summary !== undefined) {
      tabs.push({
        id: "summary",
        label: "Resumo",
        fields: [{ type: "debug-json", name: "debugSummary", data: options.summary, maxHeight: 360 }],
      });
    }
    if (options.media?.length) {
      tabs.push({
        id: "media",
        label: "Mídia",
        badge: options.media.length,
        fields: [{ type: "media-picker", name: "debugMedia", items: options.media, selectAll: false }],
      });
    }
    if (options.providers?.length) {
      tabs.push({
        id: "providers",
        label: "Providers",
        badge: options.providers.length,
        fields: [{ type: "provider-status", name: "debugProviders", providers: options.providers }],
      });
    }
    if (options.requests?.length) {
      tabs.push({
        id: "requests",
        label: "Requests",
        badge: options.requests.length,
        fields: [{ type: "request-log", name: "debugRequests", entries: options.requests, maxHeight: 420 }],
      });
    }
    if (options.relay !== undefined) {
      tabs.push({
        id: "relay",
        label: "Relay",
        fields: [{ type: "debug-json", name: "debugRelay", data: options.relay, maxHeight: 420 }],
      });
    }
    if (options.logs !== undefined) {
      tabs.push({
        id: "logs",
        label: "Logs",
        fields: [{ type: "debug-json", name: "debugLogs", data: options.logs, maxHeight: 420 }],
      });
    }
    if (!tabs.length) {
      tabs.push({
        id: "summary",
        label: "Resumo",
        fields: [{ type: "html", name: "empty", html: "<p>Sem dados de debug.</p>" }],
      });
    }

    return spawnSurface({
      title: options.title || "Debug",
      description: options.description,
      presentation: options.presentation || "bottom-sheet",
      size: "lg",
      tabs,
      actions: [{ id: "close", label: "Fechar", role: "cancel", variant: "secondary" }],
    });
  },

  async channelPicker<T extends string = string>(options: {
    title?: string;
    description?: string;
    channels: readonly OptionItem[];
    multiple?: boolean;
    searchable?: boolean;
    value?: T | readonly T[];
    presentation?: Presentation;
    anchor?: RodMenuSchema["anchor"];
  }): Promise<T | T[] | null> {
    const result = await spawnSurface<{ channel: T | T[] }>({
      title: options.title || "Escolha o canal",
      description: options.description,
      presentation: options.presentation || "auto",
      anchor: options.anchor,
      fields: [
        {
          type: "channel-picker",
          name: "channel",
          options: options.channels,
          multiple: options.multiple,
          searchable: options.searchable,
          value: options.value,
          required: true,
        },
      ],
      actions: [
        { id: "cancel", label: "Cancelar", role: "cancel", variant: "ghost" },
        { id: "select", label: "Selecionar", role: "submit", variant: "primary" },
      ],
    }).result;
    return result.action === "select" ? result.values.channel : null;
  },
};
