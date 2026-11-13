import { Dialog } from "../../runtime/solid-ui/Dialog.tsx";
import { createStore } from "solid-js";
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
export function SavedPanel(props: { onOpen: () => void; running?: boolean; error?: string }) {
  return (
    <section class={styles.panel}>
      <style>{css}</style>
      <p>Sincronize as coleções escolhidas com o Relay, sem reenviar itens confirmados.</p>
      <p role="status">{props.running ? "Sincronizando…" : props.error || "Pronto"}</p>
      <button type="button" onClick={props.onOpen}>
        ⚙ Configurações de salvos
      </button>
    </section>
  );
}
export function SavedSettings(props: { settings: Form; onChange: (next: Form) => void }) {
  const [form, setForm] = createStore({ ...props.settings });
  const update = (patch: Partial<Form>) => {
    // Publish the staged draft, including other edits batched in this event.
    setForm((draft) => {
      Object.assign(draft, patch);
      props.onChange({ ...draft, collectionIds: [...draft.collectionIds], channels: [...draft.channels] });
    });
  };
  const ids = (raw: string) => [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  return (
    <section class={styles.panel}>
      <style>{css}</style>
      <label class={styles.toggle}>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => update({ enabled: event.currentTarget.checked })}
        />{" "}
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
        Token do Relay{" "}
        <input
          type="password"
          autocomplete="off"
          value={form.token}
          onInput={(event) => update({ token: event.currentTarget.value })}
        />
      </label>
      <label>
        Canais Telegram{" "}
        <input
          value={form.channels.join(", ")}
          onChange={(event) => update({ channels: ids(event.currentTarget.value) })}
        />
      </label>
      <label>
        Delay (ms)
        <input
          type="number"
          min="0"
          value={form.delayMs}
          onInput={(event) => update({ delayMs: Math.max(0, event.currentTarget.valueAsNumber || 0) })}
        />
      </label>
      <label>
        Jitter (ms)
        <input
          type="number"
          min="0"
          value={form.jitterMs}
          onInput={(event) => update({ jitterMs: Math.max(0, event.currentTarget.valueAsNumber || 0) })}
        />
      </label>
      <label>
        Itens por lote
        <input
          type="number"
          min="1"
          value={form.batchSize}
          onInput={(event) => update({ batchSize: Math.max(1, event.currentTarget.valueAsNumber || 1) })}
        />
      </label>
      <label>
        Limite por execução
        <input
          type="number"
          min="1"
          value={form.maxItemsPerSession}
          onInput={(event) =>
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

export function SettingsDialog(props: {
  settings: Form;
  close: () => void;
  save: (next: Form) => Promise<void>;
  error: string;
}) {
  const [dialog, setDialog] = createStore({ busy: false, error: props.error });
  let draft = { ...props.settings };
  return (
    <Dialog title="Instagram · Coleções salvas" close={props.close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (dialog.busy) return;
          setDialog((value) => {
            value.busy = true;
            value.error = "";
          });
          void props
            .save(draft)
            .catch((error) =>
              setDialog((value) => {
                value.error = error.message;
              }),
            )
            .finally(() =>
              setDialog((value) => {
                value.busy = false;
              }),
            );
        }}
      >
        <SavedSettings
          settings={props.settings}
          onChange={(next) => {
            draft = next;
          }}
        />
        <p role="status">{dialog.error}</p>
        <div class={styles.actions}>
          <button type="submit" disabled={dialog.busy}>
            Salvar
          </button>
          <button type="button" onClick={props.close}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialog>
  );
}
