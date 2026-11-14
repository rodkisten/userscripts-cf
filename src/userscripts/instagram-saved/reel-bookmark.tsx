import { createSignal } from "solid-js";
import { mountPoint } from "../../runtime/solid-ui/mount-point.tsx";
import styles, { css } from "./Settings.module.css";

const LABELS = /^(save|salvar|guardar|unsave|remover dos salvos|remove from saved)$/i;
const SAVED = /unsave|remover dos salvos|remove from saved/i;
const reelIsOpen = () => /^\/reel\/[A-Za-z0-9_-]+\/?$/.test(location.pathname);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function nativeSave(): HTMLElement | null {
  for (const node of document.querySelectorAll<HTMLElement>("[aria-label]")) {
    if (node.closest("[data-solid-mount]") || !LABELS.test(node.getAttribute("aria-label")?.trim() || "")) continue;
    const button = node.closest<HTMLElement>('button, [role="button"]');
    if (button) return button;
  }
  return null;
}

function actions(): HTMLElement | null {
  const save = nativeSave();
  if (save?.parentElement) return save.parentElement;
  return null;
}

function collectionOption(id: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>('[role="dialog"] [role="button"], [role="dialog"] button, [role="menuitem"], [role="option"]');
  return [...candidates].find((node) => {
    const text = (node.textContent || "").trim();
    return text === id || node.getAttribute("data-collection-id") === id;
  }) || null;
}

async function saveToCollections(ids: string[], signal: AbortSignal) {
  const source = nativeSave();
  if (!source) throw Error("Botão nativo de salvar não encontrado neste Reel");
  if (!ids.length) throw Error("Configure pelo menos uma coleção antes de enviar");
  // Never toggle an already saved reel off just to access the collections menu.
  if (SAVED.test(source.getAttribute("aria-label") || source.querySelector("[aria-label]")?.getAttribute("aria-label") || "")) {
    throw Error("Reel já salvo. Abra o bookmark nativo para gerenciar as coleções");
  }
  source.click();
  await sleep(350);
  for (const id of ids) {
    if (signal.aborted) return;
    const option = collectionOption(id);
    if (!option) throw Error(`Coleção ${id} não apareceu no seletor nativo. Nenhuma seleção adicional foi confirmada`);
    option.click();
    await sleep(300);
  }
}

export function mountReelBookmark(
  signal: AbortSignal,
  pageStyle: (css: string) => void,
  getCollectionIds: () => Promise<string[]>,
  notify: (message: string) => void,
) {
  pageStyle(css);
  const [busy, setBusy] = createSignal(false);
  let mount: ReturnType<typeof mountPoint> | undefined;
  let parent: HTMLElement | null = null;
  let cloned: HTMLElement | undefined;
  const send = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await saveToCollections(await getCollectionIds(), signal);
      notify("Seleção de coleções enviada ao Instagram");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  function refresh() {
    const target = reelIsOpen() ? actions() : null;
    if (!target || !nativeSave()) {
      mount?.dispose();
      cloned?.remove();
      cloned = undefined;
      mount = undefined;
      parent = null;
      return;
    }
    if (parent !== target || !mount?.host.isConnected) {
      mount?.dispose();
      cloned?.remove();
      parent = target;
      // Copy the native action wrapper so Instagram controls spacing and swipe positioning.
      const native = nativeSave()!;
      cloned = native.cloneNode(true) as HTMLElement;
      cloned.removeAttribute("id");
      cloned.removeAttribute("aria-label");
      cloned.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      cloned.replaceChildren();
      cloned.dataset.rodCollectionAction = "true";
      native.insertAdjacentElement("afterend", cloned);
      mount = mountPoint(cloned, () => (
        <button
          type="button"
          class={styles.bookmark}
          aria-label="Enviar para coleções"
          title="Enviar para coleções configuradas"
          disabled={busy()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void send();
          }}
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4Z" />
          </svg>
        </button>
      ), { tag: "span" });
    }
  }
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest("[data-solid-mount]"))) refresh();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label"] });
  const interval = setInterval(refresh, 1200);
  signal.addEventListener("abort", () => {
    observer.disconnect();
    clearInterval(interval);
    mount?.dispose();
    cloned?.remove();
  }, { once: true });
  refresh();
}
