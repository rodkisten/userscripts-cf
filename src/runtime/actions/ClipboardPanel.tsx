import { useEffect, useMemo, useState } from "react";
import styles, { css } from "./ClipboardPanel.module.css";

export type ClipboardEntry = { id: string; text: string; pinned: boolean; createdAt: number };
export type ClipboardApi = {
  list(query?: string): ClipboardEntry[];
  subscribe(listener: (items: ClipboardEntry[]) => void): () => void;
  pin(id: string, pinned: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  read(): Promise<unknown>;
};

export function ClipboardPanel({ clipboard }: { clipboard: ClipboardApi }) {
  const [items, setItems] = useState<ClipboardEntry[]>(() => clipboard.list());
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setItems(clipboard.list());
    return clipboard.subscribe((next) => setItems([...next]));
  }, [clipboard]);
  const filtered = useMemo(() => items
    .filter((item) => item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt), [items, query]);
  const run = async (action: () => Promise<unknown>) => {
    try { await action(); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return (
    <section className={styles.panel} aria-label="Histórico do clipboard">
      <style>{css}</style>
      <header className={styles.toolbar}>
        <input type="search" value={query} placeholder="Buscar no histórico" aria-label="Buscar"
          onChange={(event) => setQuery(event.currentTarget.value)} />
        <button type="button" onClick={() => void run(() => clipboard.read())}>Ler</button>
      </header>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.list}>
        {filtered.length === 0 && <p className={styles.empty}>Nenhum item no histórico.</p>}
        {filtered.map((item) => (
          <article className={styles.item} key={item.id}>
            <button type="button" className={styles.text} title="Copiar novamente"
              onClick={() => void run(async () => { await navigator.clipboard.writeText(item.text); })}>
              {item.text.slice(0, 250)}
            </button>
            <div className={styles.actions}>
              <button type="button" aria-label={item.pinned ? "Desafixar" : "Fixar"}
                onClick={() => void run(() => clipboard.pin(item.id, !item.pinned))}>{item.pinned ? "★" : "☆"}</button>
              <button type="button" aria-label="Excluir"
                onClick={() => void run(() => clipboard.remove(item.id))}>×</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
