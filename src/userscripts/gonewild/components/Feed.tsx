import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { categoryTag, cleanTitle, normalize, type AudioItem, type Post, type Settings } from "../domain.ts";
import type { StudioStore } from "../store.ts";
import { resolvePostAudio } from "../services.ts";
import styles from "../Feed.module.css";
import shell, { css as shellCSS } from "../Shell.module.css";
export type FeedController = {
  store: StudioStore; bridge: any; search: (more?: boolean) => Promise<void>;
  clear: () => void; settings: () => void; tagMenu: (tag: string) => void;
};
function useStudio(store: StudioStore) {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  return store.state;
}
function TagButton({ tag, controller }: { tag: string; controller: FeedController }) {
  const state = useStudio(controller.store);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const selected = state.search.include.some((value) => normalize(value) === normalize(tag)) ? "include"
    : state.search.exclude.some((value) => normalize(value) === normalize(tag)) ? "exclude" : "";
  const cancel = () => clearTimeout(timer.current);
  return <button type="button" className={`${styles["gws-tag"]} ${categoryTag(tag) ? styles["gws-category"] || "" : ""}`}
    data-selection={selected} aria-pressed={Boolean(selected)}
    onPointerDown={() => {
      held.current = false;
      timer.current = setTimeout(() => { held.current = true; controller.tagMenu(tag); }, 500);
    }}
    onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
    onContextMenu={(event) => { event.preventDefault(); cancel(); held.current = true; controller.tagMenu(tag); }}
    onClick={(event) => {
      event.preventDefault(); event.stopPropagation();
      if (!held.current) { controller.store.actions.tag(tag); void controller.search(); }
      held.current = false;
    }}>#{tag}</button>;
}
export function PostCard({ post, controller, native = false, onAudio }: {
  post: Post; controller: FeedController; native?: boolean; onAudio?: (items: AudioItem[]) => void;
}) {
  const state = useStudio(controller.store);
  const [audio, setAudio] = useState({ items: [] as AudioItem[], checked: false, loading: false, error: "" });
  const request = useRef<AbortController | undefined>(undefined);
  const loading = useRef(false);
  const checked = useRef(false);
  const load = async (force = false) => {
    if (loading.current || (!force && checked.current)) return;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    loading.current = true;
    setAudio((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const result = await resolvePostAudio(post, controller.bridge, abort.signal, force);
      if (abort.signal.aborted) return;
      checked.current = true;
      setAudio({ items: result.items, checked: true, loading: false, error: "" });
      onAudio?.(result.items);
      controller.store.setState((draft) => { draft.resolved[post.id] = { checked: true, count: result.items.length }; });
    } catch (error) {
      if (!abort.signal.aborted) {
        checked.current = true;
        setAudio((previous) => ({ ...previous, checked: true, error: (error as Error).message }));
      }
    } finally {
      if (!abort.signal.aborted) { loading.current = false; setAudio((previous) => ({ ...previous, loading: false })); }
    }
  };
  useEffect(() => {
    if (state.settings.audio) void load();
    return () => request.current?.abort();
  }, [post.id, state.settings.audio]);
  const title = normalize(post.title);
  const hidden = (state.settings.hideSeen && !!state.seen[post.id])
    || (state.settings.onlyAudio && audio.checked && !audio.items.length)
    || state.search.include.some((tag) => !title.includes(normalize(tag)))
    || state.search.exclude.some((tag) => title.includes(normalize(tag)));
  return <section className={styles["gws-inline"]} hidden={hidden} onClick={(event) => event.stopPropagation()}>
    {state.settings.showTags && <div className={styles["gws-categories"]}>
      {post.tags.filter(categoryTag).map((tag) => <TagButton key={tag} tag={tag} controller={controller} />)}
    </div>}
    {(!native || state.settings.showTags) && <h2 className={styles["gws-title"]}>
      <a href={post.href}>{cleanTitle(post.title)}</a>
    </h2>}
    {state.settings.showTags && <div className={styles["gws-tags"]}>
      {post.tags.filter((tag) => !categoryTag(tag)).map((tag) => <TagButton key={tag} tag={tag} controller={controller} />)}
    </div>}
    <div className={styles["gws-controls"]}>
      <button type="button" className={styles["gws-action"]} onClick={() => controller.store.actions.seen(post.id, !state.seen[post.id])}>
        {state.seen[post.id] ? "✓ Visto" : "Marcar visto"}
      </button>
      <a className={styles["gws-action"]} href={post.href} target="_blank" rel="noopener noreferrer">Abrir post ↗</a>
      {state.settings.audio && <button type="button" className={styles["gws-action"]} disabled={audio.loading}
        onClick={() => void load(true)}>{audio.loading ? "Buscando…" : "↻ Atualizar áudio"}</button>}
    </div>
    {state.settings.audio && <div className={styles["gws-audio"]}>
      {audio.items.map((item) => <div key={item.external}>
        <a href={item.studioHref || item.external} target="_blank" rel="noopener noreferrer">Abrir no Studio ↗</a>
        {item.playable ? <audio src={item.playable} controls preload="none"
          onPlay={(event) => document.querySelectorAll<HTMLAudioElement>("audio").forEach((other) => {
            if (other !== event.currentTarget) other.pause();
          })}
          onError={() => setAudio((previous) => ({ ...previous, error: "O player não conseguiu abrir a mídia. Use o link do Studio." }))} />
          : <p className={styles["gws-muted"]}>Sem URL direta. Abra no site original.</p>}
      </div>)}
      {audio.checked && !audio.items.length && <p className={styles["gws-muted"]}>Nenhum link de áudio encontrado.</p>}
      {audio.error && <p role="status">{audio.error}</p>}
    </div>}
  </section>;
}
export function FeedRoot({ controller }: { controller: FeedController }) {
  const state = useStudio(controller.store);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enabled = state.settings.subreddits.some((name) => normalize(name) === normalize(location.pathname.split("/")[2] || ""));
  return <>
    <section id="gws-searchbar" className={styles["gws-searchbar"]}>
      <strong>♫ Studio</strong>
      {!enabled && <span role="status">Subreddit não configurado. Abra ⚙ para habilitar.</span>}
      <input id="gws-input" className={styles["gws-search-input"]} type="search" aria-label="Termo de busca"
        placeholder="Buscar títulos e hashtags" value={state.search.text}
        onChange={(event) => {
          const value = event.currentTarget.value;
          controller.store.setState((draft) => { draft.search.text = value; });
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void controller.search(), 350);
        }}
        onKeyDown={(event) => { if (event.key === "Enter") { clearTimeout(timer.current); void controller.search(); } }} />
      <button id="gws-search" type="button" disabled={state.search.loading} onClick={() => void controller.search()}>Buscar</button>
      <button id="gws-reset" type="button" onClick={controller.clear}>Limpar</button>
      <button id="gws-settings" type="button" aria-label="Configurações do Studio" onClick={controller.settings}>⚙</button>
      <div id="gws-chips" className={styles["gws-searchchips"]}>
        {[...state.search.include, ...state.search.exclude].map((tag) => <TagButton key={tag} tag={tag} controller={controller} />)}
      </div>
    </section>
    {state.search.active && <section id="gws-results-view">
      <div className={styles["gws-results-title"]}>Resultados do Studio</div>
      <div id="gws-result-status" className={styles["gws-result-message"]} role="status">
        {state.search.loading ? "Buscando…" : state.search.error || `${state.search.results.length} resultados`}
      </div>
      <div id="gws-results-list">{state.search.results.map((post) => <article key={post.id} className={styles["gws-result"]}>
        <div className={styles["gws-result-meta"]}>r/{post.sub} · u/{post.author}</div>
        <PostCard post={post} controller={controller} />
      </article>)}</div>
      {Boolean(state.search.after) && <button id="gws-more" type="button" disabled={state.search.loading}
        onClick={() => void controller.search(true)}>Carregar mais</button>}
    </section>}
  </>;
}
export function SettingsShell({ store, open, tag, close, closeTag, chooseTag, clear, portalContainer }: {
  store: StudioStore; open: boolean; tag: string; close: () => void; closeTag: () => void;
  chooseTag: (tag: string, kind: "include" | "exclude") => void; clear: () => void;
  portalContainer?: HTMLElement;
}) {
  const state = useStudio(store);
  const [draft, setDraft] = useState<Settings>(() => ({ ...state.settings, subreddits: [...state.settings.subreddits] }));
  const [subreddits, setSubreddits] = useState(state.settings.subreddits.join(", "));
  useEffect(() => {
    if (open) {
      setDraft({ ...state.settings, subreddits: [...state.settings.subreddits] });
      setSubreddits(state.settings.subreddits.join(", "));
    }
  }, [open]);
  const toggles: Array<[keyof Omit<Settings, "subreddits">, string]> = [
    ["removeAds", "Remover posts patrocinados e anúncios"],
    ["showTags", "Categorias e hashtags nos cards"],
    ["audio", "Detectar links e incluir players"],
    ["hideSeen", "Ocultar posts vistos"],
    ["networkFilter", "Filtrar vistos nas respostas da rede"],
    ["onlyAudio", "Mostrar apenas posts com áudio"],
  ];
  return <>
    <style>{shellCSS}</style>
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay id="shade" className="open" />
        <Dialog.Content id="sheet" className="open" aria-describedby={undefined}>
          <div className={shell.top}><Dialog.Title>🎧 GoneWildStudio</Dialog.Title>
            <Dialog.Close id="close" aria-label="Fechar">✕</Dialog.Close></div>
          <div id="status" className={shell.status}>Vistos: {Object.keys(state.seen).length}</div>
          <h3>Subreddits habilitados</h3>
          <input id="subs" value={subreddits} onChange={(event) => setSubreddits(event.currentTarget.value)}
            placeholder="GoneWildAudioGay, GoneWildAudio" />
          <h3>Feed</h3>
          {toggles.map(([key, label]) => <label key={key} className={shell.toggle}>
            <input id={key} type="checkbox" checked={Boolean(draft[key])}
              onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.currentTarget.checked }))} />
            {label}
          </label>)}
          <div className={shell.buttons}>
            <button id="save" type="button" className={shell.primary} onClick={() => {
              store.actions.settings({ ...draft, subreddits: [...new Set(subreddits.split(/[,;\\n]+/)
                .map((name) => name.trim().replace(/^r\\//i, ""))
                .filter((name) => /^[\\w]{2,32}$/.test(name)))] });
              close();
            }}>Salvar alterações</button>
            <button id="clearTags" type="button" onClick={clear}>Limpar busca</button>
            <button id="clearSeen" type="button" onClick={() => {
              if (confirm("Limpar todo o histórico local de posts vistos?")) store.actions.clearSeen();
            }}>Limpar vistos</button>
          </div>
          <div id="count" className={shell.fine}>{state.postCount} posts reconhecidos</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {Boolean(tag) && <div id="menu" className="open" role="menu">
      <div id="menu-title" className={shell["menu-title"]}>#{tag}</div>
      <div className={shell["menu-buttons"]}>
        <button type="button" onClick={() => { chooseTag(tag, "include"); closeTag(); }}>+ Incluir</button>
        <button type="button" onClick={() => { chooseTag(tag, "exclude"); closeTag(); }}>− Excluir</button>
        <button type="button" onClick={() => { chooseTag(tag, "include"); closeTag(); }}>Pesquisar</button>
      </div>
      <button type="button" onClick={closeTag}>Fechar</button>
    </div>}
  </>;
}
