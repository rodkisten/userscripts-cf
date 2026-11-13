import { For, Show, createEffect, createSignal, createStore, onCleanup, onSettled } from "solid-js";
import { categoryTag, cleanTitle, normalize, type AudioItem, type Post, type Settings } from "../domain.ts";
import type { StudioStore } from "../store.ts";
import { resolvePostAudio } from "../services.ts";
import styles from "../Feed.module.css";
import shell, { css as shellCSS } from "../Shell.module.css";
export type FeedController = {
  store: StudioStore;
  bridge: any;
  search: (more?: boolean) => Promise<void>;
  clear: () => void;
  settings: () => void;
  tagMenu: (tag: string) => void;
};
function TagButton(props: { tag: string; controller: FeedController }) {
  let timer: ReturnType<typeof setTimeout> | undefined,
    held = false;
  const cancel = () => clearTimeout(timer);
  onCleanup(cancel);
  const selected = () =>
    props.controller.store.state.search.include.some((tag) => normalize(tag) === normalize(props.tag))
      ? "include"
      : props.controller.store.state.search.exclude.some((tag) => normalize(tag) === normalize(props.tag))
        ? "exclude"
        : "";
  const select = () => {
    props.controller.store.actions.tag(props.tag);
    void props.controller.search();
  };
  return (
    <button
      type="button"
      class={`${styles["gws-tag"]} ${categoryTag(props.tag) ? styles["gws-category"] || "" : ""}`}
      data-selection={selected()}
      aria-pressed={selected() ? "true" : "false"}
      onPointerDown={() => {
        held = false;
        timer = setTimeout(() => {
          held = true;
          props.controller.tagMenu(props.tag);
        }, 500);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(event) => {
        event.preventDefault();
        cancel();
        held = true;
        props.controller.tagMenu(props.tag);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!held) select();
        held = false;
      }}
    >
      #{props.tag}
    </button>
  );
}
export function PostCard(props: {
  post: Post;
  controller: FeedController;
  native?: boolean;
  onAudio?: (items: AudioItem[]) => void;
}) {
  const [audio, setAudio] = createStore({
    items: [] as AudioItem[],
    checked: false,
    loading: false,
    error: "",
  });
  let request: AbortController | undefined;
  const load = async (force = false) => {
    if (audio.loading || (!force && audio.checked)) return;
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    setAudio((draft) => {
      draft.loading = true;
      draft.error = "";
    });
    try {
      const result = await resolvePostAudio(props.post, props.controller.bridge, signal, force);
      if (!signal.aborted) {
        setAudio((draft) => {
          draft.items = result.items;
          draft.checked = true;
        });
        props.onAudio?.(result.items);
        props.controller.store.setState((draft) => {
          draft.resolved[props.post.id] = { checked: true, count: result.items.length };
        });
      }
    } catch (error) {
      if (!signal.aborted)
        setAudio((draft) => {
          draft.error = (error as Error).message;
          draft.checked = true;
        });
    } finally {
      if (!signal.aborted)
        setAudio((draft) => {
          draft.loading = false;
        });
    }
  };
  createEffect(
    () => props.controller.store.state.settings.audio,
    (enabled) => {
      if (enabled) void load();
    },
  );
  onCleanup(() => request?.abort());
  const hidden = () => {
    const { settings, seen, search } = props.controller.store.state;
    const title = normalize(props.post.title);
    return (
      (settings.hideSeen && !!seen[props.post.id]) ||
      (settings.onlyAudio && audio.checked && !audio.items.length) ||
      search.include.some((tag) => !title.includes(normalize(tag))) ||
      search.exclude.some((tag) => title.includes(normalize(tag)))
    );
  };
  return (
    <section class={styles["gws-inline"]} hidden={hidden()} onClick={(event) => event.stopPropagation()}>
      <Show when={props.controller.store.state.settings.showTags}>
        <div class={styles["gws-categories"]}>
          <For each={props.post.tags.filter(categoryTag)}>
            {(tag) => <TagButton tag={tag} controller={props.controller} />}
          </For>
        </div>
      </Show>
      <Show when={!props.native || props.controller.store.state.settings.showTags}>
        <h2 class={styles["gws-title"]}>
          <a href={props.post.href}>{cleanTitle(props.post.title)}</a>
        </h2>
      </Show>
      <Show when={props.controller.store.state.settings.showTags}>
        <div class={styles["gws-tags"]}>
          <For each={props.post.tags.filter((tag) => !categoryTag(tag))}>
            {(tag) => <TagButton tag={tag} controller={props.controller} />}
          </For>
        </div>
      </Show>
      <div class={styles["gws-controls"]}>
        <button
          class={styles["gws-action"]}
          onClick={() =>
            props.controller.store.actions.seen(
              props.post.id,
              !props.controller.store.state.seen[props.post.id],
            )
          }
        >
          {props.controller.store.state.seen[props.post.id] ? "✓ Visto" : "Marcar visto"}
        </button>
        <a class={styles["gws-action"]} href={props.post.href} target="_blank" rel="noopener noreferrer">
          Abrir post ↗
        </a>
        <Show when={props.controller.store.state.settings.audio}>
          <button class={styles["gws-action"]} disabled={audio.loading} onClick={() => void load(true)}>
            {audio.loading ? "Buscando…" : "↻ Atualizar áudio"}
          </button>
        </Show>
      </div>
      <Show when={props.controller.store.state.settings.audio}>
        <div class={styles["gws-audio"]}>
          <For each={audio.items}>
            {(item) => (
              <div>
                <a href={item.studioHref || item.external} target="_blank" rel="noopener noreferrer">
                  Abrir no Studio ↗
                </a>
                <Show
                  when={item.playable}
                  fallback={<p class={styles["gws-muted"]}>Sem URL direta. Abra no site original.</p>}
                >
                  <audio
                    src={item.playable || undefined}
                    controls
                    preload="none"
                    onPlay={(event) => {
                      document.querySelectorAll<HTMLAudioElement>("audio").forEach((other) => {
                        if (other !== event.currentTarget) other.pause();
                      });
                    }}
                    onError={() =>
                      setAudio((draft) => {
                        draft.error = "O player não conseguiu abrir a mídia. Use o link do Studio.";
                      })
                    }
                  />
                </Show>
              </div>
            )}
          </For>
          <Show when={audio.checked && !audio.items.length}>
            <p class={styles["gws-muted"]}>Nenhum link de áudio encontrado.</p>
          </Show>
          <Show when={audio.error}>
            <p role="status">{audio.error}</p>
          </Show>
        </div>
      </Show>
    </section>
  );
}
export function FeedRoot(props: { controller: FeedController }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const state = props.controller.store.state;
  return (
    <>
      <section id="gws-searchbar" class={styles["gws-searchbar"]}>
        <strong>♫ Studio</strong>
        <input
          id="gws-input"
          class={styles["gws-search-input"]}
          type="search"
          aria-label="Termo de busca"
          placeholder="Buscar títulos e hashtags"
          value={state.search.text}
          onInput={(event) => {
            const value = event.currentTarget.value;
            props.controller.store.setState((draft) => {
              draft.search.text = value;
            });
            clearTimeout(timer);
            timer = setTimeout(() => void props.controller.search(), 350);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              clearTimeout(timer);
              void props.controller.search();
            }
          }}
        />
        <button id="gws-search" onClick={() => void props.controller.search()}>
          Buscar
        </button>
        <button id="gws-reset" onClick={props.controller.clear}>
          Limpar
        </button>
        <button id="gws-settings" aria-label="Configurações do Studio" onClick={props.controller.settings}>
          ⚙
        </button>
        <div id="gws-chips" class={styles["gws-searchchips"]}>
          <For each={[...state.search.include, ...state.search.exclude]}>
            {(tag) => <TagButton tag={tag} controller={props.controller} />}
          </For>
        </div>
      </section>
      <Show when={state.search.active}>
        <section id="gws-results-view">
          <div class={styles["gws-results-title"]}>Resultados do Studio</div>
          <div id="gws-result-status" class={styles["gws-result-message"]} role="status">
            {state.search.loading
              ? "Buscando…"
              : state.search.error || `${state.search.results.length} resultados`}
          </div>
          <div id="gws-results-list">
            <For each={state.search.results}>
              {(post) => (
                <article class={styles["gws-result"]}>
                  <div class={styles["gws-result-meta"]}>
                    r/{post.sub} · u/{post.author}
                  </div>
                  <PostCard post={post} controller={props.controller} />
                </article>
              )}
            </For>
          </div>
          <Show when={state.search.after}>
            <button
              id="gws-more"
              disabled={state.search.loading}
              onClick={() => void props.controller.search(true)}
            >
              Carregar mais
            </button>
          </Show>
        </section>
      </Show>
    </>
  );
}
export function SettingsShell(props: {
  store: StudioStore;
  open: boolean;
  tag: string;
  close: () => void;
  closeTag: () => void;
  chooseTag: (tag: string, kind: "include" | "exclude") => void;
  clear: () => void;
}) {
  const [draft, setDraft] = createStore<Settings>({
    ...props.store.state.settings,
    subreddits: [...props.store.state.settings.subreddits],
  });
  const [subreddits, setSubreddits] = createSignal(draft.subreddits.join(", "));
  createEffect(
    () => props.open,
    (open) => {
      if (open) {
        setDraft((value) =>
          Object.assign(value, {
            ...props.store.state.settings,
            subreddits: [...props.store.state.settings.subreddits],
          }),
        );
        setSubreddits(props.store.state.settings.subreddits.join(", "));
      }
    },
  );
  const toggles: Array<[keyof Omit<Settings, "subreddits">, string]> = [
    ["removeAds", "Remover posts patrocinados e anúncios"],
    ["showTags", "Categorias e hashtags nos cards"],
    ["audio", "Detectar links e incluir players"],
    ["hideSeen", "Ocultar posts vistos"],
    ["networkFilter", "Filtrar vistos nas respostas da rede"],
    ["onlyAudio", "Mostrar apenas posts com áudio"],
  ];
  return (
    <>
      <style>{shellCSS}</style>
      <Show when={props.open}>
        <div id="shade" class="open" onClick={props.close} />
        <section
          id="sheet"
          class="open"
          role="dialog"
          aria-label="GoneWildStudio"
          aria-modal="true"
          onKeyDown={(event) => {
            if (event.key === "Escape") props.close();
          }}
        >
          <div class={shell.top}>
            <h2>🎧 GoneWildStudio</h2>
            <button id="close" aria-label="Fechar" onClick={props.close}>
              ✕
            </button>
          </div>
          <div id="status" class={shell.status}>
            Vistos: {Object.keys(props.store.state.seen).length}
          </div>
          <h3>Subreddits habilitados</h3>
          <input
            id="subs"
            value={subreddits()}
            onInput={(event) => setSubreddits(event.currentTarget.value)}
            placeholder="GoneWildAudioGay, GoneWildAudio"
          />
          <h3>Feed</h3>
          <For each={toggles}>
            {([key, label]) => (
              <label class={shell.toggle}>
                <input
                  id={key}
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setDraft((value) => {
                      value[key] = checked;
                    });
                  }}
                />
                {label}
              </label>
            )}
          </For>
          <div class={shell.buttons}>
            <button
              id="save"
              class={shell.primary}
              onClick={() => {
                props.store.actions.settings({
                  ...draft,
                  subreddits: [
                    ...new Set(
                      subreddits()
                        .split(/[,;\n]+/)
                        .map((name) => name.trim().replace(/^r\//i, ""))
                        .filter((name) => /^[\w]{2,32}$/.test(name)),
                    ),
                  ],
                });
                props.close();
              }}
            >
              Salvar alterações
            </button>
            <button id="clearTags" onClick={props.clear}>
              Limpar busca
            </button>
            <button
              id="clearSeen"
              onClick={() => {
                if (confirm("Limpar todo o histórico local de posts vistos?"))
                  props.store.actions.clearSeen();
              }}
            >
              Limpar vistos
            </button>
          </div>
          <div id="count" class={shell.fine}>
            {props.store.state.postCount} posts reconhecidos
          </div>
        </section>
      </Show>
      <Show when={props.tag}>
        <div id="menu" class="open" role="menu">
          <div id="menu-title" class={shell["menu-title"]}>
            #{props.tag}
          </div>
          <div class={shell["menu-buttons"]}>
            <button
              onClick={() => {
                props.chooseTag(props.tag, "include");
                props.closeTag();
              }}
            >
              + Incluir
            </button>
            <button
              onClick={() => {
                props.chooseTag(props.tag, "exclude");
                props.closeTag();
              }}
            >
              − Excluir
            </button>
            <button
              onClick={() => {
                props.chooseTag(props.tag, "include");
                props.closeTag();
              }}
            >
              Pesquisar
            </button>
          </div>
          <button onClick={props.closeTag}>Fechar</button>
        </div>
      </Show>
    </>
  );
}
