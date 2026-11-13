import { render } from "@solidjs/web";
import styles, { css } from "./Settings.module.css";
const ROOT_ID = "rod-instagram-reel-bookmark";
const LABELS = /^(save|salvar|guardar|unsave|remover dos salvos|remove from saved)$/i;
const SAVED = /unsave|remover dos salvos|remove from saved/i;

function reelIsOpen(): boolean {
  const segments = location.pathname.split("/").filter(Boolean);
  return segments.length === 2 && segments[0] === "reel" && /^[A-Za-z0-9_-]+$/.test(segments[1]);
}

function nativeSave(): HTMLElement | null {
  for (const node of document.querySelectorAll<HTMLElement>("[aria-label]")) {
    if (!LABELS.test(node.getAttribute("aria-label")?.trim() || "") || node.closest(`#${ROOT_ID}`)) {
      continue;
    }

    const control = node.closest<HTMLElement>('button, [role="button"]');
    if (control && !control.closest(`#${ROOT_ID}`)) {
      return control;
    }
  }

  return null;
}

function findActions(): HTMLElement | null {
  const selectors = [
    'svg[aria-label="More options"]',
    'svg[aria-label="Mais opções"]',
    'svg[aria-label="Share Post"]',
    'svg[aria-label="Compartilhar publicação"]',
    'svg[aria-label="Like"]',
    'svg[aria-label="Curtir"]',
  ];

  for (const selector of selectors) {
    const icon = document.querySelector<SVGElement>(selector);
    const action = icon?.closest<HTMLElement>('button, [role="button"]');
    const parent = action?.parentElement;
    if (parent && !parent.closest(`#${ROOT_ID}`)) {
      return parent;
    }
  }

  return null;
}

export function mountReelBookmark(signal: AbortSignal, pageStyle: (css: string) => void): void {
  pageStyle(css);
  const host = (<span />) as HTMLSpanElement;
  let button!: HTMLButtonElement;
  const dispose = render(
    () => <button ref={button} id={ROOT_ID} type="button" class={styles.bookmark} aria-label="Salvar" />,
    host,
  );
  let iconMarkup = "";
  let source: HTMLElement | null = null;
  button.addEventListener(
    "click",
    () => {
      if (!reelIsOpen()) {
        return;
      }

      const current = nativeSave();
      if (current) {
        current.click();
        queueMicrotask(refresh);
      }
    },
    { signal },
  );

  function refresh(): void {
    if (!reelIsOpen()) {
      host.remove();
      return;
    }

    const actions = findActions();
    source = nativeSave();
    if (!actions || !source) {
      host.remove();
      return;
    }

    const nativeIcon = source.querySelector("svg");
    if (!nativeIcon) {
      host.remove();
      return;
    }

    const saved = SAVED.test(
      source.getAttribute("aria-label") ||
        source.querySelector("[aria-label]")?.getAttribute("aria-label") ||
        "",
    );
    button.setAttribute("aria-label", saved ? "Remover dos salvos" : "Salvar");
    button.title = button.getAttribute("aria-label") || "";
    // Ignore our own DOM updates; replacing an unchanged clone would otherwise
    // trigger this observer indefinitely on every Instagram page.
    if (nativeIcon.outerHTML !== iconMarkup) {
      iconMarkup = nativeIcon.outerHTML;
      button.replaceChildren(nativeIcon.cloneNode(true));
    }
    const icon = button.querySelector("svg");
    if (icon) {
      icon.removeAttribute("aria-label");
      icon.setAttribute("aria-hidden", "true");
    }

    if (host.parentElement !== actions) {
      actions.append(host);
    }
  }

  const observer = new MutationObserver(() => refresh());
  observer.observe(document.documentElement, { subtree: true, childList: true });
  const interval = setInterval(refresh, 1200);
  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      clearInterval(interval);
      dispose();
      host.remove();
    },
    { once: true },
  );
  refresh();
}
