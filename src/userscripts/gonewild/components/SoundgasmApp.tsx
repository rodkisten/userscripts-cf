import { useMemo, useState } from "react";
import { gmClipboard } from "../../../runtime/userscript-capabilities.ts";
import { cleanTitle, normalize, parseTags, type Recording } from "../domain.ts";
import { Markdown } from "./Markdown.tsx";
import { Player } from "./Player.tsx";
import { Tags } from "./Tags.tsx";
import styles from "../Soundgasm.module.css";

export type SoundgasmData = {
  title: string; description: string; author: string; subreddit: string;
  permalink: string; source: string; recordings: Recording[]; profile: boolean;
};
function CopyButton({ text, label, id }: { text: string; label: string; id?: string }) {
  const [message, setMessage] = useState("");
  return <button type="button" id={id} className={styles["gws-sg-copy"]} onClick={async () => {
    try {
      const clipboard = gmClipboard();
      if (clipboard) await clipboard(text, "text");
      else await navigator.clipboard.writeText(text);
      setMessage("✓ Copiado");
    } catch { setMessage("Não foi possível copiar"); }
  }}>{message || label}</button>;
}
function RecordingCard({ recording, subreddit, bridge }: { recording: Recording; subreddit: string; bridge: any }) {
  const [expanded, setExpanded] = useState(false);
  const tags = useMemo(() => parseTags(recording.title, recording.description), [recording.title, recording.description]);
  return <article className={styles["gws-sg-card"]}>
    <div className={styles["gws-sg-chips"]}><Tags tags={tags} subreddit={subreddit} bridge={bridge} category /></div>
    <h2><a href={recording.href}>{cleanTitle(recording.title)}</a></h2>
    <div className={styles["gws-sg-chips"]}><Tags tags={tags} subreddit={subreddit} bridge={bridge} /></div>
    <div className={styles["gws-sg-cardmeta"]}>
      <span>{recording.plays ? `${recording.plays.toLocaleString("pt-BR")} reproduções` : "Áudio do Soundgasm"}</span>
      <a href={recording.href}>▶ Ouvir áudio</a>
    </div>
    {Boolean(recording.description) && <>
      <p className={styles["gws-sg-cardsummary"]}>{recording.description.slice(0, 220)}{recording.description.length > 220 ? "…" : ""}</p>
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>Descrição completa ↓</summary>
        {expanded && <div className={styles["gws-sg-description"]}><Markdown text={recording.description} /></div>}
      </details>
    </>}
  </article>;
}
function Catalogue({ data, bridge }: { data: SoundgasmData; bridge: any }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("original");
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return data.recordings.filter((item) => !needle || normalize(`${item.title} ${item.description}`).includes(needle))
      .sort((a, b) => sort === "popular" ? b.plays - a.plays
        : sort === "title" ? cleanTitle(a.title).localeCompare(cleanTitle(b.title)) : a.index - b.index);
  }, [data.recordings, query, sort]);
  return <>
    <p className={styles["gws-sg-eyebrow"]}>SOUNDGASM / CATÁLOGO</p>
    <h1 id="gws-sg-profile-name">@{data.author}</h1>
    <p id="gws-sg-profile-summary" className={styles["gws-sg-subtitle"]}>{filtered.length} de {data.recordings.length} gravações</p>
    <div className={styles["gws-sg-toolbar"]}>
      <input id="gws-sg-profile-search" type="search" placeholder="Buscar títulos e hashtags…"
        aria-label="Buscar gravações" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      <select id="gws-sg-profile-sort" aria-label="Ordenar gravações" value={sort}
        onChange={(event) => setSort(event.currentTarget.value)}>
        <option value="original">Ordem original</option>
        <option value="popular">Mais reproduzidos</option>
        <option value="title">Título A–Z</option>
      </select>
    </div>
    <div id="gws-sg-catalog" className={styles["gws-sg-catalog"]}>
      {filtered.map((recording) => <RecordingCard key={recording.href} recording={recording} subreddit={data.subreddit} bridge={bridge} />)}
    </div>
    {!filtered.length && <p id="gws-sg-profile-empty" className={styles["gws-sg-empty"]}>Nenhum áudio corresponde à pesquisa.</p>}
  </>;
}
export function SoundgasmApp({ data, bridge, onNative }: { data: SoundgasmData; bridge: any; onNative: (show: boolean) => void }) {
  const tags = useMemo(() => parseTags(data.title, data.description), [data.title, data.description]);
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  return <>
    <header className={styles["gws-sg-header"]}>
      <div className={styles["gws-sg-brand"]}><span className={styles["gws-sg-logo"]}>♫</span>
        <span>gonewild<span className={styles.accent}>studio</span></span></div>
      <a id="gws-sg-back" className={styles["gws-sg-source"]} href={data.permalink || "https://www.reddit.com"}
        target="_blank" rel="noopener noreferrer">↶ Reddit</a>
    </header>
    {data.profile ? <Catalogue data={data} bridge={bridge} /> : <>
      <div className={styles["gws-sg-eyebrow"]}>SOUNDGASM / AUDIO STUDIO</div>
      <div id="gws-sg-categories" className={styles["gws-sg-chips"]}><Tags tags={tags} subreddit={data.subreddit} bridge={bridge} category /></div>
      <h1 id="gws-sg-title">{cleanTitle(data.title)}</h1>
      <div id="gws-sg-tags" className={styles["gws-sg-chips"]}><Tags tags={tags} subreddit={data.subreddit} bridge={bridge} /></div>
      <div className={styles["gws-sg-byline"]}>
        <span>Por <a id="gws-sg-author-link" className={styles["gws-sg-authorlink"]}
          href={`https://soundgasm.net/u/${encodeURIComponent(data.author)}${data.subreddit ? `?subreddit=${encodeURIComponent(data.subreddit)}` : ""}`}>
          <b id="gws-sg-author">{data.author || "Anônimo"}</b> ↗</a></span>
        <span id="gws-sg-subname">{data.subreddit ? `• r/${data.subreddit}` : ""}</span>
      </div>
      <Player source={data.source} title={cleanTitle(data.title)} author={data.author}
        subreddit={data.subreddit} onNative={onNative} />
      <div className={styles["gws-sg-actions"]}>
        <CopyButton id="gws-sg-share" text={location.href} label="↗ Copiar link" />
        {Boolean(data.permalink) && <a id="gws-sg-post-link" href={data.permalink} target="_blank" rel="noopener noreferrer">↶ Abrir post no Reddit</a>}
      </div>
      <section className={styles["gws-sg-panel"]}>
        <button type="button" aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen((open) => !open)}>Descrição</button>
        <CopyButton id="gws-sg-description-copy" text={data.description} label="Copiar descrição" />
        {descriptionOpen && <div id="gws-sg-description" className={styles["gws-sg-description"]}>
          <Markdown text={data.description || "Não há descrição associada a este áudio."} />
        </div>}
      </section>
    </>}
  </>;
}
export function StudioFailure({ retry }: { retry: () => void }) {
  return <section role="alert" className={styles["gws-sg-panel"]}>
    <p>Não foi possível abrir o Studio. O player original continua disponível abaixo.</p>
    <button type="button" onClick={retry}>Tentar novamente</button>
  </section>;
}
