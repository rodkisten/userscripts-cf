import { gmClipboard } from "../../../runtime/userscript-capabilities.ts";
import { For, Show, createMemo, createSignal, createStore, onSettled } from "solid-js";
import { cleanTitle, normalize, parseTags, type Recording } from "../domain.ts";
import { Markdown } from "./Markdown.tsx";
import { Player } from "./Player.tsx";
import { Tags } from "./Tags.tsx";
import styles from "../Soundgasm.module.css";
export type SoundgasmData = {
  title: string;
  description: string;
  author: string;
  subreddit: string;
  permalink: string;
  source: string;
  recordings: Recording[];
  profile: boolean;
};
function Header(props: { permalink?: string }) {
  return (
    <header class={styles["gws-sg-header"]}>
      <div class={styles["gws-sg-brand"]}>
        <span class={styles["gws-sg-logo"]}>♫</span>
        <span>
          gonewild<span class={styles.accent}>studio</span>
        </span>
      </div>
      <a
        id="gws-sg-back"
        class={styles["gws-sg-source"]}
        href={props.permalink || "https://www.reddit.com"}
        target="_blank"
        rel="noopener noreferrer"
      >
        ↶ Reddit
      </a>
    </header>
  );
}
function CopyButton(props: { text: string; label: string; id?: string }) {
  const [message, setMessage] = createSignal("");
  const copy = async () => {
    try {
      const clipboard = gmClipboard();
      if (clipboard) await clipboard(props.text, "text");
      else await navigator.clipboard.writeText(props.text);
      setMessage("✓ Copiado");
    } catch {
      setMessage("Não foi possível copiar");
    }
  };
  return (
    <button id={props.id} class={styles["gws-sg-copy"]} onClick={copy}>
      {message() || props.label}
    </button>
  );
}
function RecordingCard(props: { recording: Recording; subreddit: string; bridge: any }) {
  const [expanded, setExpanded] = createSignal(false);
  const tags = createMemo(() => parseTags(props.recording.title, props.recording.description));
  return (
    <article class={styles["gws-sg-card"]}>
      <div class={styles["gws-sg-chips"]}>
        <Tags tags={tags()} subreddit={props.subreddit} bridge={props.bridge} category />
      </div>
      <h2>
        <a href={props.recording.href}>{cleanTitle(props.recording.title)}</a>
      </h2>
      <div class={styles["gws-sg-chips"]}>
        <Tags tags={tags()} subreddit={props.subreddit} bridge={props.bridge} />
      </div>
      <div class={styles["gws-sg-cardmeta"]}>
        <span>
          {props.recording.plays
            ? `${props.recording.plays.toLocaleString("pt-BR")} reproduções`
            : "Áudio do Soundgasm"}
        </span>
        <a href={props.recording.href}>▶ Ouvir áudio</a>
      </div>
      <Show when={props.recording.description}>
        <p class={styles["gws-sg-cardsummary"]}>
          {props.recording.description.slice(0, 220)}
          {props.recording.description.length > 220 ? "…" : ""}
        </p>
        <details open={expanded()} onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary>Descrição completa ↓</summary>
          <Show when={expanded()}>
            <div class={styles["gws-sg-description"]}>
              <Markdown text={props.recording.description} />
            </div>
          </Show>
        </details>
      </Show>
    </article>
  );
}
function Catalogue(props: { data: SoundgasmData; bridge: any }) {
  const [query, setQuery] = createSignal("");
  const [sort, setSort] = createSignal("original");
  const filtered = createMemo(() => {
    const needle = normalize(query());
    const values = props.data.recordings.filter(
      (item) => !needle || normalize(`${item.title} ${item.description}`).includes(needle),
    );
    return [...values].sort((a, b) =>
      sort() === "popular"
        ? b.plays - a.plays
        : sort() === "title"
          ? cleanTitle(a.title).localeCompare(cleanTitle(b.title))
          : a.index - b.index,
    );
  });
  return (
    <>
      <p class={styles["gws-sg-eyebrow"]}>SOUNDGASM / CATÁLOGO</p>
      <h1 id="gws-sg-profile-name">@{props.data.author}</h1>
      <p id="gws-sg-profile-summary" class={styles["gws-sg-subtitle"]}>
        {filtered().length} de {props.data.recordings.length} gravações
      </p>
      <div class={styles["gws-sg-toolbar"]}>
        <input
          id="gws-sg-profile-search"
          type="search"
          placeholder="Buscar títulos e hashtags…"
          aria-label="Buscar gravações"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <select
          id="gws-sg-profile-sort"
          aria-label="Ordenar gravações"
          value={sort()}
          onChange={(event) => setSort(event.currentTarget.value)}
        >
          <option value="original">Ordem original</option>
          <option value="popular">Mais reproduzidos</option>
          <option value="title">Título A–Z</option>
        </select>
      </div>
      <div id="gws-sg-catalog" class={styles["gws-sg-catalog"]}>
        <For each={filtered()}>
          {(recording) => (
            <RecordingCard recording={recording} subreddit={props.data.subreddit} bridge={props.bridge} />
          )}
        </For>
      </div>
      <Show when={!filtered().length}>
        <p id="gws-sg-profile-empty" class={styles["gws-sg-empty"]}>
          Nenhum áudio corresponde à pesquisa.
        </p>
      </Show>
    </>
  );
}
export function SoundgasmApp(props: { data: SoundgasmData; bridge: any; onNative: (show: boolean) => void }) {
  const tags = createMemo(() => parseTags(props.data.title, props.data.description));
  const [details, setDetails] = createStore({ description: true });
  return (
    <>
      <Header permalink={props.data.permalink} />
      <Show
        when={props.data.profile}
        fallback={
          <>
            <div class={styles["gws-sg-eyebrow"]}>SOUNDGASM / AUDIO STUDIO</div>
            <div id="gws-sg-categories" class={styles["gws-sg-chips"]}>
              <Tags tags={tags()} subreddit={props.data.subreddit} bridge={props.bridge} category />
            </div>
            <h1 id="gws-sg-title">{cleanTitle(props.data.title)}</h1>
            <div id="gws-sg-tags" class={styles["gws-sg-chips"]}>
              <Tags tags={tags()} subreddit={props.data.subreddit} bridge={props.bridge} />
            </div>
            <div class={styles["gws-sg-byline"]}>
              <span>
                Por{" "}
                <a
                  id="gws-sg-author-link"
                  class={styles["gws-sg-authorlink"]}
                  href={`https://soundgasm.net/u/${encodeURIComponent(props.data.author)}${props.data.subreddit ? `?subreddit=${encodeURIComponent(props.data.subreddit)}` : ""}`}
                >
                  <b id="gws-sg-author">{props.data.author || "Anônimo"}</b> ↗
                </a>
              </span>
              <span id="gws-sg-subname">{props.data.subreddit ? `• r/${props.data.subreddit}` : ""}</span>
            </div>
            <Player
              source={props.data.source}
              title={cleanTitle(props.data.title)}
              author={props.data.author}
              subreddit={props.data.subreddit}
              onNative={props.onNative}
            />
            <div class={styles["gws-sg-actions"]}>
              <CopyButton id="gws-sg-share" text={location.href} label="↗ Copiar link" />
              <Show when={props.data.permalink}>
                <a
                  id="gws-sg-post-link"
                  href={props.data.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ↶ Abrir post no Reddit
                </a>
              </Show>
            </div>
            <section class={styles["gws-sg-panel"]}>
              <button
                aria-expanded={details.description ? "true" : "false"}
                onClick={() =>
                  setDetails((draft) => {
                    draft.description = !draft.description;
                  })
                }
              >
                Descrição
              </button>
              <CopyButton
                id="gws-sg-description-copy"
                text={props.data.description}
                label="Copiar descrição"
              />
              <Show when={details.description}>
                <div id="gws-sg-description" class={styles["gws-sg-description"]}>
                  <Markdown text={props.data.description || "Não há descrição associada a este áudio."} />
                </div>
              </Show>
            </section>
          </>
        }
      >
        <Catalogue data={props.data} bridge={props.bridge} />
      </Show>
    </>
  );
}

export function StudioFailure(props: { retry: () => void }) {
  return (
    <section role="alert" class={styles["gws-sg-panel"]}>
      <p>Não foi possível abrir o Studio. O player original continua disponível abaixo.</p>
      <button type="button" onClick={props.retry}>
        Tentar novamente
      </button>
    </section>
  );
}
