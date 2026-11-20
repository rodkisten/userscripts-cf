import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import styles, { css } from "./Settings.module.css";
export { css };

export type Form = {
  enabled: boolean;
  collectionIds: string[];
  delayMs: number;
  jitterMs: number;
  batchSize: number;
  maxItemsPerSession: number;
  token: string;
  channels: string[];
};
export function SavedPanel({
  onOpen,
  running,
  error,
  progress,
}: {
  onOpen: () => void;
  running?: boolean;
  error?: string;
  progress?: { current: number; total: number; collection: string; sent: number };
}) {
  return (
    <section className={styles.panel}>
      <style>{css}</style>
      <p>Sincronize as coleções escolhidas com o Relay, sem reenviar itens confirmados.</p>
      <p role="status">
        {running
          ? progress
            ? `Coleção ${progress.current}/${progress.total}: ${progress.collection} · ${progress.processed} processada(s) · ${progress.sent} enviada(s)`
            : "Preparando sincronização…"
          : error || "Pronto"}
      </p>
      <button type="button" onClick={onOpen}>
        ⚙ Configurações de salvos
      </button>
    </section>
  );
}
export function SavedSettings({ settings, onChange }: { settings: Form; onChange: (next: Form) => void }) {
  const [form, setForm] = useState<Form>(() => ({ ...settings }));
  const update = (patch: Partial<Form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    onChange(next);
  };
  const ids = (raw: string) => [
    ...new Set(
      raw
        .split(/[,;\\s]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  return (
    <section className={styles.panel}>
      <style>{css}</style>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => update({ enabled: event.currentTarget.checked })}
        />
        Sincronização automática
      </label>
      <label>
        IDs das coleções (separados por vírgula)
        <input
          value={form.collectionIds.join(", ")}
          onChange={(event) => update({ collectionIds: ids(event.currentTarget.value) })}
        />
      </label>
      <label>
        Token do Relay
        <input
          type="password"
          autoComplete="off"
          value={form.token}
          onChange={(event) => update({ token: event.currentTarget.value })}
        />
      </label>
      <label>
        Canais Telegram
        <input
          value={form.channels.join(", ")}
          onChange={(event) => update({ channels: ids(event.currentTarget.value) })}
        />
      </label>
      <label>
        Delay (ms)
        <input
          type="number"
          min={0}
          value={form.delayMs}
          onChange={(event) => update({ delayMs: Math.max(0, event.currentTarget.valueAsNumber || 0) })}
        />
      </label>
      <label>
        Jitter (ms)
        <input
          type="number"
          min={0}
          value={form.jitterMs}
          onChange={(event) => update({ jitterMs: Math.max(0, event.currentTarget.valueAsNumber || 0) })}
        />
      </label>
      <label>
        Itens por lote
        <input
          type="number"
          min={1}
          value={form.batchSize}
          onChange={(event) => update({ batchSize: Math.max(1, event.currentTarget.valueAsNumber || 1) })}
        />
      </label>
      <label>
        Limite por execução
        <input
          type="number"
          min={1}
          value={form.maxItemsPerSession}
          onChange={(event) =>
            update({ maxItemsPerSession: Math.max(1, event.currentTarget.valueAsNumber || 1) })
          }
        />
      </label>
      <p>
        Somente as coleções escolhidas serão sincronizadas. Nenhuma coleção informada mantém o envio
        desativado.
      </p>
    </section>
  );
}

export function SettingsDialog({
  settings,
  close,
  save,
  error,
}: {
  settings: Form;
  close: () => void;
  save: (next: Form) => Promise<void>;
  error: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(error);
  const [draft, setDraft] = useState<Form>(() => ({ ...settings }));
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "#0009", zIndex: 2147483645 }} />
        <Dialog.Content
          style={{
            position: "fixed",
            inset: "auto 0 0",
            maxHeight: "90dvh",
            overflowY: "auto",
            background: "#18181b",
            color: "#fafafa",
            padding: 16,
            borderRadius: "16px 16px 0 0",
            zIndex: 2147483646,
          }}
        >
          <Dialog.Title>Instagram · Coleções salvas</Dialog.Title>
          <Dialog.Description>
            Configure as coleções, o Relay e os limites de sincronização.
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setFailure("");
              void save(draft)
                .catch((cause) => setFailure(cause instanceof Error ? cause.message : String(cause)))
                .finally(() => setBusy(false));
            }}
          >
            <SavedSettings settings={settings} onChange={setDraft} />
            {failure && <p role="alert">{failure}</p>}
            <div className={styles.actions}>
              <button type="submit" disabled={busy}>
                Salvar
              </button>
              <button type="button" disabled={busy} onClick={close}>
                Cancelar
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
