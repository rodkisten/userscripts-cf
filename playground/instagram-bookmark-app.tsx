import { createSignal, For, onCleanup } from "solid-js";
import { render } from "@solidjs/web";
import {
  ReelBookmarkButton,
  type BookmarkState,
} from "../src/userscripts/instagram-saved/ReelBookmarkButton";
import { css } from "../src/userscripts/instagram-saved/Settings.module.css";
const states: BookmarkState[] = ["unsaved", "saved", "loading", "error"];
function App() {
  const [state, setState] = createSignal<BookmarkState>("unsaved");
  const [message, setMessage] = createSignal("Prévia local. Nenhuma ação real no Instagram.");
  let pending: number | undefined;
  onCleanup(() => clearTimeout(pending));
  const activate = () => {
    if (state() === "loading") return;
    clearTimeout(pending);
    setState("loading");
    setMessage("Simulando salvamento…");
    pending = window.setTimeout(() => {
      setState("saved");
      setMessage("Simulação concluída. Nenhum Reel foi salvo.");
    }, 900);
  };
  return (
    <main>
      <small>INSTAGRAM · COMPONENT PREVIEW</small>
      <h1>Reel Bookmark</h1>
      <p>O componente real SolidJS, consumido pelo playground.</p>
      <section class="card">
        <div class="reel">
          <div class="reelInfo">
            <span class="avatar">IG</span>
            <strong>Reel de demonstração</strong>
            <span>Prévia local</span>
          </div>
          <aside class="reelActions">
            <span>♡</span>
            <span>↗</span>
            <ReelBookmarkButton state={state()} onActivate={activate} />
          </aside>
        </div>
        <p role="status" aria-live="polite">
          {message()}
        </p>
      </section>
      <section class="card">
        <h2>Estados</h2>
        <div class="choices">
          <For each={states}>
            {(value) => (
              <button
                class={{ selected: state() === value }}
                onClick={() => {
                  clearTimeout(pending);
                  setState(value);
                  setMessage("Estado: " + value);
                }}
              >
                {value}
              </button>
            )}
          </For>
        </div>
        <div class="examples">
          <For each={states}>
            {(value) => (
              <div class="example">
                <ReelBookmarkButton state={value} onActivate={() => setState(value)} />
                <span>{value}</span>
              </div>
            )}
          </For>
        </div>
      </section>
      <footer>Sem login, sem API, sem alterações nos seus Reels.</footer>
    </main>
  );
}
const style = document.createElement("style");
style.textContent = css;
document.head.append(style);
const host = document.getElementById("app");
if (!host) throw new Error("Missing bookmark preview mount target");
host.replaceChildren();
render(() => <App />, host);
