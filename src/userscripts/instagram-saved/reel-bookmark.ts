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

export function mountReelBookmark(signal: AbortSignal): void {
  const button = document.createElement("button");
  button.id = ROOT_ID;
  button.type = "button";
  button.setAttribute("aria-label", "Salvar");
  button.style.cssText = "display:flex;align-items:center;justify-content:center;background:none;border:0;" +
    "padding:8px;color:inherit;cursor:pointer;touch-action:manipulation";

  let source: HTMLElement | null = null;
  button.addEventListener("click", () => {
    if (!reelIsOpen()) {
      return;
    }

    const current = nativeSave();
    if (current) {
      current.click();
      queueMicrotask(refresh);
    }
  }, { signal });

  function refresh(): void {
    if (!reelIsOpen()) {
      button.remove();
      return;
    }

    const actions = findActions();
    source = nativeSave();
    if (!actions || !source) {
      button.remove();
      return;
    }

    const nativeIcon = source.querySelector("svg");
    if (!nativeIcon) {
      button.remove();
      return;
    }

    const saved = SAVED.test(
      source.getAttribute("aria-label") ||
      source.querySelector("[aria-label]")?.getAttribute("aria-label") || "",
    );
    button.setAttribute("aria-label", saved ? "Remover dos salvos" : "Salvar");
    button.title = button.getAttribute("aria-label") || "";
    button.replaceChildren(nativeIcon.cloneNode(true));
    const icon = button.querySelector("svg");
    if (icon) {
      icon.removeAttribute("aria-label");
      icon.setAttribute("aria-hidden", "true");
    }

    if (button.parentElement !== actions) {
      actions.append(button);
    }
  }

  const observer = new MutationObserver(() => refresh());
  observer.observe(document.documentElement, { subtree: true, childList: true });
  const interval = setInterval(refresh, 1200);
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearInterval(interval);
    button.remove();
  }, { once: true });
  refresh();
}
