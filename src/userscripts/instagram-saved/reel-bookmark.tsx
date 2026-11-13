import { createStore } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import styles, { css } from "./Settings.module.css";
const ROOT_ID = "rod-instagram-reel-bookmark";
const LABELS = /^(save|salvar|guardar|unsave|remover dos salvos|remove from saved)$/i;
const SAVED = /unsave|remover dos salvos|remove from saved/i;
function reelIsOpen() {
  return /^\/reel\/[A-Za-z0-9_-]+\/?$/.test(location.pathname);
}
function nativeSave(): HTMLElement | null {
  for (const node of document.querySelectorAll<HTMLElement>("[aria-label]")) {
    if (node.closest("[data-solid-mount]") || !LABELS.test(node.getAttribute("aria-label")?.trim() || ""))
      continue;
    const control = node.closest<HTMLElement>('button, [role="button"]');
    if (control) return control;
  }
  return null;
}
function findActions() {
  for (const node of document.querySelectorAll(
    'svg[aria-label="More options"], svg[aria-label="Mais opções"], svg[aria-label="Share Post"], svg[aria-label="Compartilhar publicação"], svg[aria-label="Like"], svg[aria-label="Curtir"]',
  )) {
    const parent = node.closest('button, [role="button"]')?.parentElement;
    if (parent && !parent.closest("[data-solid-mount]")) return parent;
  }
  return null;
}
export function ReelBookmark(props: { saved: boolean; activate: () => void }) {
  return (
    <button
      id={ROOT_ID}
      type="button"
      class={styles.bookmark}
      aria-label={props.saved ? "Remover dos salvos" : "Salvar"}
      title={props.saved ? "Remover dos salvos" : "Salvar"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.activate();
      }}
    >
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path
          d={
            props.saved
              ? "M20 21.5a.5.5 0 0 1-.315-.112L12 15.322l-7.685 6.066A.5.5 0 0 1 3.5 21V3A1.5 1.5 0 0 1 5 1.5h14A1.5 1.5 0 0 1 20.5 3v18a.5.5 0 0 1-.5.5Z"
              : "M19 1.5H5A1.5 1.5 0 0 0 3.5 3v18a.5.5 0 0 0 .815.388L12 15.322l7.685 6.066A.5.5 0 0 0 20.5 21V3A1.5 1.5 0 0 0 19 1.5Zm0 17.435-6.69-5.28a.5.5 0 0 0-.62 0L5 18.935V3h14Z"
          }
        />
      </svg>
    </button>
  );
}
export function mountReelBookmark(signal: AbortSignal, pageStyle: (css: string) => void) {
  pageStyle(css);
  const [state, setState] = createStore({ saved: false });
  let mount: ReturnType<typeof mountPoint> | undefined;
  const activate = () => {
    if (reelIsOpen()) {
      nativeSave()?.click();
      queueMicrotask(refresh);
    }
  };
  function refresh() {
    const target = reelIsOpen() ? findActions() : null,
      source = nativeSave();
    if (!target || !source) {
      mount?.dispose();
      mount = undefined;
      return;
    }
    const saved = SAVED.test(
      source.getAttribute("aria-label") ||
        source.querySelector("[aria-label]")?.getAttribute("aria-label") ||
        "",
    );
    if (saved !== state.saved)
      setState((draft) => {
        draft.saved = saved;
      });
    if (mount?.host.parentElement !== target) {
      mount?.dispose();
      mount = mountPoint(target, () => <ReelBookmark saved={state.saved} activate={activate} />, {
        tag: "span",
      });
    }
  }
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
            "[data-solid-mount]",
          ),
      )
    )
      refresh();
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-label"],
  });
  const interval = setInterval(refresh, 1200);
  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      clearInterval(interval);
      mount?.dispose();
    },
    { once: true },
  );
  refresh();
}
