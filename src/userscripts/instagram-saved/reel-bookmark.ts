const ROOT_ID = "rod-instagram-reel-bookmark";

const ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M6 3.5h12v17l-6-4-6 4z" />
</svg>`;

function reelIsOpen(): boolean {
  return location.pathname.split("/").includes("reel") ||
    Boolean(document.querySelector('[role="dialog"] a[href*="/reel/"]'));
}

function findNativeSave(): HTMLElement | null {
  const labels = /^(save|salvar|guardar|unsave|remover dos salvos|remove from saved)$/i;
  const candidates = document.querySelectorAll<HTMLElement>(
    'svg[aria-label], button[aria-label], [role="button"][aria-label]',
  );

  for (const candidate of candidates) {
    if (candidate.closest(`#${ROOT_ID}`)) {
      continue;
    }

    const label = candidate.getAttribute("aria-label") || "";
    if (!labels.test(label.trim())) {
      continue;
    }

    const button = candidate.closest<HTMLElement>('button, [role="button"]');
    if (button && !button.closest(`#${ROOT_ID}`)) {
      return button;
    }
  }

  return null;
}

export function mountReelBookmark(signal: AbortSignal): void {
  const button = document.createElement("button");
  button.id = ROOT_ID;
  button.type = "button";
  button.setAttribute("aria-label", "Salvar Reel no Instagram");
  button.title = "Salvar Reel no Instagram";
  button.innerHTML = ICON;
  button.style.cssText = [
    "position:fixed",
    "left:max(12px,env(safe-area-inset-left))",
    "top:50%",
    "transform:translateY(-50%)",
    "z-index:2147483640",
    "display:none",
    "align-items:center",
    "justify-content:center",
    "width:44px",
    "height:44px",
    "border-radius:50%",
    "border:1px solid rgba(255,255,255,.25)",
    "background:rgba(15,15,15,.8)",
    "color:white",
    "backdrop-filter:blur(12px)",
    "cursor:pointer",
    "touch-action:manipulation",
  ].join(";");

  button.addEventListener("click", () => {
    const native = findNativeSave();
    if (!native) {
      button.title = "Controle de salvar do Instagram indisponível";
      return;
    }

    // Let Instagram perform its own authenticated request and update its own state.
    native.click();
    refresh();
  }, { signal });

  function refresh(): void {
    const visible = reelIsOpen();
    const native = visible ? findNativeSave() : null;
    button.style.display = visible && native ? "flex" : "none";
    if (native) {
      const saved = /unsave|remover dos salvos|remove from saved/i.test(
        native.querySelector("[aria-label]")?.getAttribute("aria-label") ||
        native.getAttribute("aria-label") || "",
      );
      button.setAttribute("aria-label", saved ? "Remover Reel dos salvos" : "Salvar Reel no Instagram");
      button.title = button.getAttribute("aria-label") || "";
      button.style.color = saved ? "#ffd66e" : "white";
    }
  }

  document.documentElement.append(button);
  const observer = new MutationObserver(() => {
    refresh();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  const refreshTimer = setInterval(refresh, 1000);
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearInterval(refreshTimer);
    button.remove();
  }, { once: true });
  refresh();
}
