import { createSignal } from "solid-js";
import styles, { css } from "./Settings.module.css";
export { css };

type Form = {
  enabled: boolean;
  collectionIds: string[];
  delayMs: number;
  jitterMs: number;
  batchSize: number;
  maxItemsPerSession: number;
  token: string;
  channels: string[];
};
export function SavedPanel(props: { onOpen: () => void }) {
  return (
    <section class={styles.panel}>
      <style>{css}</style>
      <p>Sincronize as coleções escolhidas com o Relay, sem reenviar itens confirmados.</p>
      <button type="button" onClick={props.onOpen}>
        ⚙ Configurações de salvos
      </button>
    </section>
  );
}
export function SavedSettings(props: { settings: Form; onChange: (next: Form) => void }) {
  const [form, setForm] = createSignal({ ...props.settings });
  const update = (patch: Partial<Form>) => {
    const next = { ...form(), ...patch };
    setForm(next);
    props.onChange(next);
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
          checked={form().enabled}
          onChange={(event) => update({ enabled: event.currentTarget.checked })}
        />{" "}
        Sincronização automática
      </label>
      <label>
        IDs das coleções (separados por vírgula)
        <input
          value={form().collectionIds.join(", ")}
          onChange={(event) => update({ collectionIds: ids(event.currentTarget.value) })}
        />
      </label>
      <label>
        Token do Relay{" "}
        <input
          type="password"
          autocomplete="off"
          value={form().token}
          onInput={(event) => update({ token: event.currentTarget.value })}
        />
      </label>
      <label>
        Canais Telegram{" "}
        <input
          value={form().channels.join(", ")}
          onChange={(event) => update({ channels: ids(event.currentTarget.value) })}
        />
      </label>
      <label>
        Delay (ms)
        <input
          type="number"
          min="0"
          value={form().delayMs}
          onInput={(event) => update({ delayMs: Math.max(0, event.currentTarget.valueAsNumber || 0) })}
        />
      </label>
      <label>
        Jitter (ms)
        <input
          type="number"
          min="0"
          value={form().jitterMs}
          onInput={(event) => update({ jitterMs: Math.max(0, event.currentTarget.valueAsNumber || 0) })}
        />
      </label>
      <label>
        Itens por lote
        <input
          type="number"
          min="1"
          value={form().batchSize}
          onInput={(event) => update({ batchSize: Math.max(1, event.currentTarget.valueAsNumber || 1) })}
        />
      </label>
      <label>
        Limite por execução
        <input
          type="number"
          min="1"
          value={form().maxItemsPerSession}
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
