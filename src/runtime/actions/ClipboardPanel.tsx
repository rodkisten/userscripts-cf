import { createSignal, onCleanup, For, Show } from "solid-js";
import { clipboardText } from "../solid-ui/clipboard";
import styles, { css } from "./ClipboardPanel.module.css";

type Entry = { id: string; text: string; pinned: boolean; createdAt: number };
type ClipboardApi = {
  list(query?: string): Entry[];
  subscribe(listener: (items: Entry[]) => void): () => void;
  pin(id: string, pinned: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  read(): Promise<unknown>;
};
export function ClipboardPanel(props: { clipboard: ClipboardApi }) {
  const [items, setItems] = createSignal<Entry[]>(props.clipboard.list());
  const [query, setQuery] = createSignal("");
  const [error, setError] = createSignal("");
  const unsubscribe = props.clipboard.subscribe(setItems);
  onCleanup(unsubscribe);
  const filtered = () => items().filter(item => item.text.toLocaleLowerCase().includes(query().toLocaleLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  const read = async () => {
    try { await props.clipboard.read(); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return (
    <section class={styles.panel} aria-label="Histórico do clipboard">
      <style>{css}</style>
      <header class={styles.toolbar}>
        <input type="search" value={query()} placeholder="Buscar no histórico" aria-label="Buscar"
          onInput={(event) => setQuery(event.currentTarget.value)} />
        <button type="button" onClick={() => void read()}>Ler</button>
      </header>
      <Show when={error()}><p role="alert" class={styles.error}>{error()}</p></Show>
      <div class={styles.list}>
        <For each={filtered()} fallback={<p class={styles.empty}>Nenhum item no histórico.</p>}>
          {(item) => (
            <article class={styles.item}>
              <button type="button" class={styles.text} title="Copiar novamente"
                onClick={() => void clipboardText(item.text).catch((cause) => setError(String(cause)))}>
                {item.text.slice(0, 250)}
              </button>
              <div class={styles.actions}>
                <button type="button" aria-label={item.pinned ? "Desafixar" : "Fixar"}
                  onClick={() => void props.clipboard.pin(item.id, !item.pinned)}>{item.pinned ? "★" : "☆"}</button>
                <button type="button" aria-label="Excluir" onClick={() => void props.clipboard.remove(item.id)}>×</button>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}
