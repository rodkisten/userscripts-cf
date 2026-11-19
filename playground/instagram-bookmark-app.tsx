/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReelBookmarkButton,
  type BookmarkState,
} from "../src/userscripts/instagram-saved/ReelBookmarkButton";
import { css } from "../src/userscripts/instagram-saved/Settings.module.css";

const states: BookmarkState[] = ["unsaved", "saved", "loading", "error"];

function App() {
  const [state, setState] = useState<BookmarkState>("unsaved");
  const [message, setMessage] = useState("Prévia local. Nenhuma ação real no Instagram.");
  const [pending, setPending] = useState<number | undefined>();

  useEffect(() => () => {
    if (pending !== undefined) window.clearTimeout(pending);
  }, [pending]);

  const clearPending = () => {
    if (pending !== undefined) window.clearTimeout(pending);
    setPending(undefined);
  };

  const activate = () => {
    if (state === "loading") return;
    clearPending();
    setState("loading");
    setMessage("Simulando salvamento…");
    const timer = window.setTimeout(() => {
      setState("saved");
      setMessage("Simulação concluída. Nenhum Reel foi salvo.");
      setPending(undefined);
    }, 900);
    setPending(timer);
  };

  const selectState = (next: BookmarkState) => {
    clearPending();
    setState(next);
    setMessage("Estado: " + next);
  };

  return (
    <main>
      <small>INSTAGRAM · COMPONENT PREVIEW</small>
      <h1>Reel Bookmark</h1>
      <p>O componente React real, consumido pelo playground.</p>
      <section className="card">
        <div className="reel">
          <div className="reelInfo">
            <span className="avatar">IG</span>
            <strong>Reel de demonstração</strong>
            <span>Prévia local</span>
          </div>
          <aside className="reelActions">
            <span>♡</span>
            <span>↗</span>
            <ReelBookmarkButton state={state} onActivate={activate} />
          </aside>
        </div>
        <p role="status" aria-live="polite">{message}</p>
      </section>
      <section className="card">
        <h2>Estados</h2>
        <div className="choices">
          {states.map((value) => (
            <button
              key={value}
              className={state === value ? "selected" : ""}
              onClick={() => selectState(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="examples">
          {states.map((value) => (
            <div className="example" key={value}>
              <ReelBookmarkButton state={value} onActivate={() => selectState(value)} />
              <span>{value}</span>
            </div>
          ))}
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
const root = createRoot(host);
root.render(<App />);
